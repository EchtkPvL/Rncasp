package pdf

import (
	"context"
	"fmt"
	"html"
	"log/slog"
	"sort"
	"strings"
	"time"

	"github.com/chromedp/cdproto/page"
	"github.com/chromedp/chromedp"
	"github.com/echtkpvl/rncasp/internal/repository"
	"github.com/google/uuid"
)

type PDFGenerator struct {
	logger *slog.Logger
}

func NewPDFGenerator(logger *slog.Logger) *PDFGenerator {
	return &PDFGenerator{logger: logger}
}

type PDFOptions struct {
	Layout         string   // "grid" or "list"
	PaperSize      string   // "A4" or "A3"
	Landscape      bool
	ShowCoverage   bool
	ShowTeamColors bool
	Days           []string // ISO date strings (YYYY-MM-DD); empty = all
	UserIDs        []string // UUIDs; empty = all
}

type PDFData struct {
	Event        repository.Event
	Shifts       []repository.ListShiftsByEventRow
	EventTeams   []repository.ListEventTeamsRow
	Coverage     []repository.CoverageRequirement
	HiddenRanges []repository.EventHiddenRange
}

func (g *PDFGenerator) Generate(ctx context.Context, data PDFData, opts PDFOptions) ([]byte, error) {
	// Filter shifts by selected days if provided
	shifts := data.Shifts
	if len(opts.Days) > 0 {
		shifts = filterShiftsByDays(shifts, opts.Days)
	}
	if len(opts.UserIDs) > 0 {
		shifts = filterShiftsByUsers(shifts, opts.UserIDs)
	}

	htmlContent := renderHTML(data.Event, shifts, data.EventTeams, data.Coverage, data.HiddenRanges, opts)

	// Paper dimensions in inches
	width, height := paperDimensions(opts.PaperSize, opts.Landscape)

	// Launch headless chromium
	allocCtx, allocCancel := chromedp.NewExecAllocator(ctx,
		append(chromedp.DefaultExecAllocatorOptions[:],
			chromedp.Flag("no-sandbox", true),
			chromedp.Flag("disable-gpu", true),
			chromedp.Flag("disable-dev-shm-usage", true),
		)...,
	)
	defer allocCancel()

	chromeCtx, chromeCancel := chromedp.NewContext(allocCtx)
	defer chromeCancel()

	var pdfBuf []byte
	if err := chromedp.Run(chromeCtx,
		chromedp.Navigate("about:blank"),
		chromedp.ActionFunc(func(ctx context.Context) error {
			frameTree, err := page.GetFrameTree().Do(ctx)
			if err != nil {
				return err
			}
			return page.SetDocumentContent(frameTree.Frame.ID, htmlContent).Do(ctx)
		}),
		chromedp.ActionFunc(func(ctx context.Context) error {
			buf, _, err := page.PrintToPDF().
				WithPaperWidth(width).
				WithPaperHeight(height).
				WithMarginTop(0.31).
				WithMarginBottom(0.31).
				WithMarginLeft(0.31).
				WithMarginRight(0.31).
				WithPrintBackground(true).
				WithPreferCSSPageSize(false).
				Do(ctx)
			if err != nil {
				return err
			}
			pdfBuf = buf
			return nil
		}),
	); err != nil {
		return nil, fmt.Errorf("chromedp PDF generation: %w", err)
	}

	return pdfBuf, nil
}

func paperDimensions(paperSize string, landscape bool) (width, height float64) {
	switch paperSize {
	case "A3":
		width, height = 11.69, 16.54
	default: // A4
		width, height = 8.27, 11.69
	}
	if landscape {
		width, height = height, width
	}
	return
}

// --- Shift filtering ---

func filterShiftsByDays(shifts []repository.ListShiftsByEventRow, days []string) []repository.ListShiftsByEventRow {
	daySet := make(map[string]bool, len(days))
	for _, d := range days {
		daySet[d] = true
	}

	var result []repository.ListShiftsByEventRow
	for _, s := range shifts {
		// Check if shift overlaps any selected day
		for d := range daySet {
			dayStart, err := time.Parse("2006-01-02", d)
			if err != nil {
				continue
			}
			dayEnd := dayStart.AddDate(0, 0, 1)
			if s.StartTime.Before(dayEnd) && s.EndTime.After(dayStart) {
				result = append(result, s)
				break
			}
		}
	}
	return result
}

func filterShiftsByUsers(shifts []repository.ListShiftsByEventRow, userIDs []string) []repository.ListShiftsByEventRow {
	set := make(map[string]bool, len(userIDs))
	for _, id := range userIDs {
		set[id] = true
	}
	var result []repository.ListShiftsByEventRow
	for _, s := range shifts {
		if set[s.UserID.String()] {
			result = append(result, s)
		}
	}
	return result
}

// --- Time slot generation (ported from frontend lib/time.ts) ---

func granularityToMinutes(g string) int {
	switch g {
	case "15min":
		return 15
	case "30min":
		return 30
	default:
		return 60
	}
}

func generateTimeSlots(start, end time.Time, granularity string, hiddenRanges []repository.EventHiddenRange) []time.Time {
	minutes := granularityToMinutes(granularity)
	var slots []time.Time
	current := start
	for current.Before(end) {
		hour := current.Hour()
		hidden := false
		for _, r := range hiddenRanges {
			if hour >= int(r.HideStartHour) && hour < int(r.HideEndHour) {
				hidden = true
				break
			}
		}
		if !hidden {
			slots = append(slots, current)
		}
		current = current.Add(time.Duration(minutes) * time.Minute)
	}
	return slots
}

func formatTime24(t time.Time) string {
	return fmt.Sprintf("%02d:%02d", t.Hour(), t.Minute())
}

func formatDay(t time.Time) string {
	return t.Format("Mon 2 Jan")
}

// --- User grouping (ported from frontend) ---

type userInfo struct {
	id          uuid.UUID
	username    string
	fullName    string
	displayName string
}

func groupShiftsByUser(shifts []repository.ListShiftsByEventRow) []userInfo {
	seen := make(map[uuid.UUID]bool)
	var users []userInfo
	for _, s := range shifts {
		if seen[s.UserID] {
			continue
		}
		seen[s.UserID] = true
		dn := ""
		if s.UserDisplayName != nil {
			dn = *s.UserDisplayName
		}
		users = append(users, userInfo{
			id:          s.UserID,
			username:    s.Username,
			fullName:    s.UserFullName,
			displayName: dn,
		})
	}
	sort.Slice(users, func(i, j int) bool {
		return users[i].username < users[j].username
	})
	return users
}

func userName(u userInfo) string {
	if u.displayName != "" {
		return u.displayName
	}
	return u.fullName
}

// --- Event days ---

func getEventDays(start, end time.Time) []time.Time {
	var days []time.Time
	current := time.Date(start.Year(), start.Month(), start.Day(), 0, 0, 0, 0, start.Location())
	for current.Before(end) {
		days = append(days, current)
		current = current.AddDate(0, 0, 1)
	}
	return days
}

// --- HTML rendering ---

func renderHTML(event repository.Event, shifts []repository.ListShiftsByEventRow, eventTeams []repository.ListEventTeamsRow, coverage []repository.CoverageRequirement, hiddenRanges []repository.EventHiddenRange, opts PDFOptions) string {
	var b strings.Builder
	b.WriteString(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'Noto Sans', Arial, sans-serif; font-size: 9pt; color: #000; }

.print-page-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-size: 8pt;
  border-bottom: 0.5pt solid #999;
  padding-bottom: 1mm;
  margin-bottom: 2mm;
}
.print-event-name { font-weight: bold; font-size: 10pt; }

.print-grid-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  font-size: 7pt;
}
.print-grid-table th,
.print-grid-table td {
  border: 0.5pt solid #ccc;
  padding: 1mm;
  text-align: center;
  overflow: hidden;
}
.print-name-col {
  width: 25mm;
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.print-shift-cell { font-weight: bold; font-size: 7pt; }
.print-coverage-row td { font-size: 6pt; height: 5mm; }

.print-day-break { break-before: page; }

.print-list-user {
  break-inside: avoid;
  margin-bottom: 4mm;
}
.print-list-user-name {
  font-size: 10pt;
  font-weight: bold;
  border-bottom: 0.5pt solid #ccc;
  padding-bottom: 0.5mm;
  margin-bottom: 1mm;
}
.print-list-day-header {
  font-size: 8pt;
  font-weight: bold;
  padding-left: 3mm;
  margin-top: 1mm;
}
.print-list-shift {
  font-size: 8pt;
  display: flex;
  gap: 2mm;
  padding-left: 6mm;
}
.print-team-dot {
  display: inline-block;
  width: 2.5mm;
  height: 2.5mm;
  flex-shrink: 0;
  margin-top: 0.5mm;
}
</style>
</head>
<body>
`)

	if opts.Layout == "list" {
		renderListLayout(&b, event, shifts, opts)
	} else {
		renderGridLayout(&b, event, shifts, eventTeams, coverage, hiddenRanges, opts)
	}

	b.WriteString("</body>\n</html>")
	return b.String()
}

func renderGridLayout(b *strings.Builder, event repository.Event, shifts []repository.ListShiftsByEventRow, eventTeams []repository.ListEventTeamsRow, coverage []repository.CoverageRequirement, hiddenRanges []repository.EventHiddenRange, opts PDFOptions) {
	days := getEventDays(event.StartTime, event.EndTime)
	granMinutes := granularityToMinutes(event.TimeGranularity)
	now := time.Now()

	// Build team map
	teamMap := make(map[uuid.UUID]teamEntry)
	for _, et := range eventTeams {
		teamMap[et.ID] = teamEntry{name: et.Name, abbreviation: et.Abbreviation, color: et.Color}
	}
	for _, s := range shifts {
		if _, ok := teamMap[s.TeamID]; !ok {
			teamMap[s.TeamID] = teamEntry{name: s.TeamName, abbreviation: s.TeamAbbreviation, color: s.TeamColor}
		}
	}

	for dayIdx, day := range days {
		// Compute day boundaries clamped to event range
		dayStart := day
		dayEnd := day.AddDate(0, 0, 1)
		if dayStart.Before(event.StartTime) {
			dayStart = event.StartTime
		}
		if dayEnd.After(event.EndTime) {
			dayEnd = event.EndTime
		}

		slots := generateTimeSlots(dayStart, dayEnd, event.TimeGranularity, hiddenRanges)
		if len(slots) == 0 {
			continue
		}

		// Filter shifts for this day
		dayStartMs := slots[0]
		dayEndMs := slots[len(slots)-1].Add(time.Duration(granMinutes) * time.Minute)
		var dayShifts []repository.ListShiftsByEventRow
		for _, s := range shifts {
			if s.StartTime.Before(dayEndMs) && s.EndTime.After(dayStartMs) {
				dayShifts = append(dayShifts, s)
			}
		}

		users := groupShiftsByUser(dayShifts)

		// Page break for non-first days
		if dayIdx > 0 {
			b.WriteString(`<div class="print-day-break">`)
		} else {
			b.WriteString(`<div>`)
		}

		// Header
		b.WriteString(`<div class="print-page-header">`)
		b.WriteString(`<span class="print-event-name">`)
		b.WriteString(html.EscapeString(event.Name))
		b.WriteString(`</span><span>`)
		b.WriteString(html.EscapeString(formatDay(day)))
		b.WriteString(`</span><span>`)
		b.WriteString(html.EscapeString(formatTime24(now)))
		b.WriteString(`</span></div>`)

		// Grid table
		b.WriteString(`<table class="print-grid-table"><thead><tr><th class="print-name-col">&nbsp;</th>`)
		for _, slot := range slots {
			b.WriteString("<th>")
			if slot.Minute() == 0 {
				b.WriteString(html.EscapeString(formatTime24(slot)))
			}
			b.WriteString("</th>")
		}
		b.WriteString("</tr></thead><tbody>")

		// User rows
		for _, user := range users {
			b.WriteString(`<tr><td class="print-name-col">`)
			b.WriteString(html.EscapeString(userName(user)))
			b.WriteString("</td>")

			userShifts := filterShiftsForUser(dayShifts, user.id)
			renderUserCells(b, userShifts, slots, granMinutes, opts.ShowTeamColors)

			b.WriteString("</tr>")
		}

		// Coverage rows
		if opts.ShowCoverage {
			renderCoverageRows(b, teamMap, slots, granMinutes, dayShifts, coverage)
		}

		b.WriteString("</tbody></table></div>")
	}
}

func filterShiftsForUser(shifts []repository.ListShiftsByEventRow, userID uuid.UUID) []repository.ListShiftsByEventRow {
	var result []repository.ListShiftsByEventRow
	for _, s := range shifts {
		if s.UserID == userID {
			result = append(result, s)
		}
	}
	return result
}

func renderUserCells(b *strings.Builder, userShifts []repository.ListShiftsByEventRow, slots []time.Time, granMinutes int, showTeamColors bool) {
	rendered := make(map[uuid.UUID]bool)
	skipUntil := -1

	for i := 0; i < len(slots); i++ {
		if i < skipUntil {
			continue
		}

		slotMs := slots[i]
		slotEnd := slotMs.Add(time.Duration(granMinutes) * time.Minute)

		// Find shift covering this slot
		var found *repository.ListShiftsByEventRow
		for idx := range userShifts {
			s := &userShifts[idx]
			if rendered[s.ID] {
				continue
			}
			if s.StartTime.Before(slotEnd) && s.EndTime.After(slotMs) {
				found = s
				break
			}
		}

		if found != nil {
			rendered[found.ID] = true
			// Calculate colspan
			span := 0
			for j := i; j < len(slots); j++ {
				if !slots[j].Before(found.EndTime) {
					break
				}
				span++
			}
			if span < 1 {
				span = 1
			}
			skipUntil = i + span

			bgColor := "#f0f0f0"
			if showTeamColors {
				bgColor = found.TeamColor + "33"
			}

			b.WriteString(fmt.Sprintf(`<td colspan="%d" class="print-shift-cell" style="background-color:%s">`, span, html.EscapeString(bgColor)))
			b.WriteString(html.EscapeString(found.TeamAbbreviation))
			b.WriteString("</td>")
		} else {
			b.WriteString("<td></td>")
		}
	}
}

type teamEntry struct {
	name         string
	abbreviation string
	color        string
}

func renderCoverageRows(b *strings.Builder, teamMap map[uuid.UUID]teamEntry, slots []time.Time, granMinutes int, dayShifts []repository.ListShiftsByEventRow, coverage []repository.CoverageRequirement) {
	// Sort teams deterministically
	type teamKV struct {
		id   uuid.UUID
		team teamEntry
	}
	var teams []teamKV
	for id, t := range teamMap {
		teams = append(teams, teamKV{id, t})
	}
	sort.Slice(teams, func(i, j int) bool {
		return teams[i].team.abbreviation < teams[j].team.abbreviation
	})

	for _, tkv := range teams {
		b.WriteString(`<tr class="print-coverage-row"><td class="print-name-col">`)
		b.WriteString(html.EscapeString(tkv.team.abbreviation))
		b.WriteString("</td>")

		for _, slot := range slots {
			slotEnd := slot.Add(time.Duration(granMinutes) * time.Minute)

			// Count shifts for this team in this slot
			count := 0
			for _, s := range dayShifts {
				if s.TeamID == tkv.id && s.StartTime.Before(slotEnd) && s.EndTime.After(slot) {
					count++
				}
			}

			// Find coverage requirement
			required := 0
			for _, c := range coverage {
				if c.TeamID == tkv.id && !c.StartTime.After(slot) && c.EndTime.After(slot) {
					required = int(c.RequiredCount)
					break
				}
			}

			bgColor := "transparent"
			if required > 0 {
				if count >= required {
					bgColor = "#dcfce7"
				} else {
					bgColor = "#fef2f2"
				}
			}

			content := ""
			if required > 0 {
				content = fmt.Sprintf("%d/%d", count, required)
			}

			b.WriteString(fmt.Sprintf(`<td style="background-color:%s">%s</td>`, bgColor, content))
		}

		b.WriteString("</tr>")
	}
}

func renderListLayout(b *strings.Builder, event repository.Event, shifts []repository.ListShiftsByEventRow, opts PDFOptions) {
	now := time.Now()
	users := groupShiftsByUser(shifts)
	days := getEventDays(event.StartTime, event.EndTime)

	// Filter to selected days only
	if len(opts.Days) > 0 {
		daySet := make(map[string]bool)
		for _, d := range opts.Days {
			daySet[d] = true
		}
		var filtered []time.Time
		for _, d := range days {
			if daySet[d.Format("2006-01-02")] {
				filtered = append(filtered, d)
			}
		}
		days = filtered
	}

	sort.Slice(days, func(i, j int) bool { return days[i].Before(days[j]) })

	// Date range label
	dateRange := ""
	if len(days) > 0 {
		dateRange = formatDay(days[0]) + " – " + formatDay(days[len(days)-1])
	}

	// Header
	b.WriteString(`<div class="print-page-header">`)
	b.WriteString(`<span class="print-event-name">`)
	b.WriteString(html.EscapeString(event.Name))
	b.WriteString(`</span><span>`)
	b.WriteString(html.EscapeString(dateRange))
	b.WriteString(`</span><span>`)
	b.WriteString(html.EscapeString(formatTime24(now)))
	b.WriteString(`</span></div>`)

	// User blocks
	for _, user := range users {
		b.WriteString(`<div class="print-list-user">`)
		b.WriteString(`<div class="print-list-user-name">`)
		b.WriteString(html.EscapeString(userName(user)))
		b.WriteString("</div>")

		userShifts := filterShiftsForUser(shifts, user.id)
		sort.Slice(userShifts, func(i, j int) bool {
			return userShifts[i].StartTime.Before(userShifts[j].StartTime)
		})

		for _, day := range days {
			dayStart := day
			dayEnd := day.AddDate(0, 0, 1)

			var overlapping []repository.ListShiftsByEventRow
			for _, s := range userShifts {
				if s.StartTime.Before(dayEnd) && s.EndTime.After(dayStart) {
					overlapping = append(overlapping, s)
				}
			}

			if len(overlapping) == 0 {
				continue
			}

			b.WriteString(`<div class="print-list-day-header">`)
			b.WriteString(html.EscapeString(formatDay(day)))
			b.WriteString("</div>")

			for _, shift := range overlapping {
				b.WriteString(`<div class="print-list-shift">`)
				if opts.ShowTeamColors {
					b.WriteString(fmt.Sprintf(`<span class="print-team-dot" style="background-color:%s"></span>`, html.EscapeString(shift.TeamColor)))
				}
				b.WriteString("<span>")
				b.WriteString(html.EscapeString(formatTime24(shift.StartTime)))
				b.WriteString("–")
				b.WriteString(html.EscapeString(formatTime24(shift.EndTime)))
				b.WriteString("</span><span>")
				b.WriteString(html.EscapeString(shift.TeamName))
				b.WriteString(" (")
				b.WriteString(html.EscapeString(shift.TeamAbbreviation))
				b.WriteString(")</span></div>")
			}
		}

		b.WriteString("</div>")
	}
}

