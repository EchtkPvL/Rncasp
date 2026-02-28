import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { Event, Shift, CoverageRequirement, EventTeam, HiddenRange } from "@/api/types";
import { generateTimeSlots, granularityToMinutes, formatSlotTime, formatDayHeader, groupShiftsByUser } from "@/lib/time";
import { useTimeFormat } from "@/hooks/useTimeFormat";

interface PrintGridPageProps {
  event: Event;
  shifts: Shift[];
  allShifts?: Shift[];
  coverage: CoverageRequirement[];
  eventTeams: EventTeam[];
  hiddenRanges: HiddenRange[];
  day: Date;
  showCoverage: boolean;
  isFirstPage: boolean;
  rangeStart?: Date;
  rangeEnd?: Date;
}

export function PrintGridPage({
  event,
  shifts,
  allShifts,
  coverage,
  eventTeams,
  hiddenRanges,
  day,
  showCoverage,
  isFirstPage,
  rangeStart,
  rangeEnd,
}: PrintGridPageProps) {
  const { t } = useTranslation(["events"]);
  const hour12 = useTimeFormat();

  // Compute day boundaries clamped to event range and optional time range
  const dayRange = useMemo(() => {
    const dayStart = new Date(day);
    const dayEnd = new Date(day);
    dayEnd.setDate(dayEnd.getDate() + 1);
    const eventStart = new Date(event.start_time);
    const eventEnd = new Date(event.end_time);
    let start = dayStart > eventStart ? dayStart : eventStart;
    let end = dayEnd < eventEnd ? dayEnd : eventEnd;
    if (rangeStart && rangeStart > start) start = rangeStart;
    if (rangeEnd && rangeEnd < end) end = rangeEnd;
    return {
      start: start.toISOString(),
      end: end.toISOString(),
    };
  }, [day, event.start_time, event.end_time, rangeStart, rangeEnd]);

  // Generate time slots for this day
  const slots = useMemo(
    () => generateTimeSlots(dayRange.start, dayRange.end, event.time_granularity, hiddenRanges),
    [dayRange.start, dayRange.end, event.time_granularity, hiddenRanges]
  );

  const granMinutes = granularityToMinutes(event.time_granularity);

  // Filter shifts that overlap this day (user-filtered, for grid rows)
  const dayShifts = useMemo(() => {
    if (slots.length === 0) return [];
    const dayStartMs = slots[0].getTime();
    const dayEndMs = slots[slots.length - 1].getTime() + granMinutes * 60 * 1000;
    return shifts.filter((s) => {
      const sStart = new Date(s.start_time).getTime();
      const sEnd = new Date(s.end_time).getTime();
      return sStart < dayEndMs && sEnd > dayStartMs;
    });
  }, [shifts, slots, granMinutes]);

  // All shifts for this day (unfiltered by user, for coverage totals)
  const allDayShifts = useMemo(() => {
    if (!allShifts || slots.length === 0) return dayShifts;
    const dayStartMs = slots[0].getTime();
    const dayEndMs = slots[slots.length - 1].getTime() + granMinutes * 60 * 1000;
    return allShifts.filter((s) => {
      const sStart = new Date(s.start_time).getTime();
      const sEnd = new Date(s.end_time).getTime();
      return sStart < dayEndMs && sEnd > dayStartMs;
    });
  }, [allShifts, dayShifts, slots, granMinutes]);

  // Get distinct users
  const users = useMemo(() => groupShiftsByUser(dayShifts), [dayShifts]);

  // Build team lookup
  const teamMap = useMemo(() => {
    const map = new Map<string, { name: string; abbreviation: string; color: string }>();
    for (const et of eventTeams) {
      map.set(et.team_id, { name: et.team_name, abbreviation: et.team_abbreviation, color: et.team_color });
    }
    for (const s of dayShifts) {
      if (!map.has(s.team_id)) {
        map.set(s.team_id, { name: s.team_name, abbreviation: s.team_abbreviation, color: s.team_color });
      }
    }
    return map;
  }, [eventTeams, dayShifts]);

  // Build coverage data per slot per team
  const coverageData = useMemo(() => {
    if (!showCoverage) return null;
    const teams = Array.from(teamMap.entries());
    if (teams.length === 0) return null;

    return teams.map(([teamId, team]) => {
      const slotData = slots.map((slot) => {
        const slotMs = slot.getTime();
        const slotEndMs = slotMs + granMinutes * 60 * 1000;

        // Count shifts covering this slot for this team (using all shifts, not user-filtered)
        const count = allDayShifts.filter((s) => {
          if (s.team_id !== teamId) return false;
          const sStart = new Date(s.start_time).getTime();
          const sEnd = new Date(s.end_time).getTime();
          return sStart < slotEndMs && sEnd > slotMs;
        }).length;

        // Find coverage requirement for this slot + team
        const req = coverage.find((c) => {
          if (c.team_id !== teamId) return false;
          const cStart = new Date(c.start_time).getTime();
          const cEnd = new Date(c.end_time).getTime();
          return cStart <= slotMs && cEnd > slotMs;
        });

        return { count, required: req?.required_count ?? 0 };
      });

      return { teamId, team, slotData };
    });
  }, [showCoverage, teamMap, slots, granMinutes, allDayShifts, coverage]);

  if (slots.length === 0) return null;

  const now = new Date();

  return (
    <div className={isFirstPage ? "" : "print-day-break"}>
      {/* Page header — only on first page of each day */}
      <div className="print-page-header">
        <span className="print-event-name">{event.name}</span>
        <span>{formatDayHeader(day)}</span>
        <span>
          {t("events:printed_at")} {formatSlotTime(now, hour12)}
        </span>
      </div>

      {/* Single table — browser handles page breaks, thead repeats automatically */}
      <table className="print-grid-table">
        <thead>
          <tr>
            <th className="print-name-col">&nbsp;</th>
            {slots.map((slot, i) => {
              const min = slot.getMinutes();
              const isHourStart = min === 0;
              return (
                <th key={i} className={isHourStart ? "print-hour-start" : undefined}>
                  {isHourStart ? formatSlotTime(slot, hour12) : ""}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {users.map((user) => {
            const userShifts = dayShifts.filter((s) => s.user_id === user.id);
            return (
              <UserRow
                key={user.id}
                userName={user.displayName || user.fullName}
                userShifts={userShifts}
                slots={slots}
                granMinutes={granMinutes}
              />
            );
          })}

          {/* Coverage rows at the end */}
          {coverageData && coverageData.map(({ teamId, team, slotData }) => (
            <tr key={`cov-${teamId}`} className="print-coverage-row">
              <td className="print-name-col">{team.abbreviation}</td>
              {slotData.map((sd, i) => {
                let bgColor = "transparent";
                if (sd.required > 0) {
                  bgColor = sd.count >= sd.required ? "var(--color-success-light)" : "var(--color-destructive-light)";
                }
                const isHourStart = slots[i].getMinutes() === 0;
                return (
                  <td key={i} className={isHourStart ? "print-hour-start" : undefined} style={{ backgroundColor: bgColor }}>
                    {sd.required > 0 ? `${sd.count}/${sd.required}` : ""}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Renders a single user row with colspan-based shift cells */
function UserRow({
  userName,
  userShifts,
  slots,
  granMinutes,
}: {
  userName: string;
  userShifts: Shift[];
  slots: Date[];
  granMinutes: number;
}) {
  const cells: React.ReactNode[] = [];
  const rendered = new Set<string>();
  let skipUntil = -1;

  for (let i = 0; i < slots.length; i++) {
    if (i < skipUntil) continue;

    const slotMs = slots[i].getTime();
    const slotEndMs = slotMs + granMinutes * 60 * 1000;

    // Find shift covering this slot
    const shift = userShifts.find((s) => {
      if (rendered.has(s.id)) return false;
      const sStart = new Date(s.start_time).getTime();
      const sEnd = new Date(s.end_time).getTime();
      return sStart < slotEndMs && sEnd > slotMs;
    });

    if (shift) {
      rendered.add(shift.id);
      // Calculate colspan: how many slots does this shift cover within remaining day slots
      const shiftEndMs = new Date(shift.end_time).getTime();
      let span = 0;
      for (let j = i; j < slots.length; j++) {
        const jMs = slots[j].getTime();
        if (jMs >= shiftEndMs) break;
        span++;
      }
      span = Math.max(span, 1);
      skipUntil = i + span;

      const bgColor = shift.team_color + "33";

      const isHourStart = slots[i].getMinutes() === 0;
      cells.push(
        <td
          key={i}
          colSpan={span}
          className={isHourStart ? "print-shift-cell print-hour-start" : "print-shift-cell"}
          style={{ backgroundColor: bgColor }}
        >
          {shift.team_abbreviation}
        </td>
      );
    } else {
      const isHourStart = slots[i].getMinutes() === 0;
      cells.push(<td key={i} className={isHourStart ? "print-hour-start" : undefined} />);
    }
  }

  return (
    <tr>
      <td className="print-name-col">{userName}</td>
      {cells}
    </tr>
  );
}
