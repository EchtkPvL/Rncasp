import { useState, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useEscapeKey } from "@/hooks/useKeyboard";
import { useDownloadPDF } from "@/hooks/useExport";
import { groupShiftsByUser } from "@/lib/time";
import { DateTimePicker } from "@/components/common/DateTimePicker";
import type { Event, Shift, CoverageRequirement, EventTeam, HiddenRange, PrintConfig } from "@/api/types";

type Layout = "grid" | "list";
type PaperSize = "A4" | "A3";
type FilterMode = "all" | "custom";

interface ExportModalProps {
  event: Event;
  shifts: Shift[];
  coverage: CoverageRequirement[];
  eventTeams: EventTeam[];
  hiddenRanges?: HiddenRange[];
  selectedDay: Date | null;
  slug: string;
  onPrint: (config: PrintConfig) => void;
  onClose: () => void;
  onDownloadPDF?: (slug: string, config: PrintConfig) => void;
}

export function ExportModal({
  event,
  shifts,
  eventTeams,
  selectedDay,
  slug,
  onPrint,
  onClose,
  onDownloadPDF,
}: ExportModalProps) {
  const { t } = useTranslation(["events", "common"]);
  const downloadPDF = useDownloadPDF();

  const [layout, setLayout] = useState<Layout>("grid");
  const [paperSize, setPaperSize] = useState<PaperSize>("A4");
  const [landscape, setLandscape] = useState(true);
  const [showCoverage, setShowCoverage] = useState(true);
  const [onePerPage, setOnePerPage] = useState(false);

  // List mode forces A4 portrait
  const effectivePaperSize: PaperSize = layout === "list" ? "A4" : paperSize;
  const effectiveLandscape = layout === "list" ? false : landscape;

  // Team filter
  const [teamMode, setTeamMode] = useState<FilterMode>("all");
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>(() =>
    eventTeams.map((t) => t.team_id)
  );

  // Time range filter
  const toLocalInput = (iso: string) => {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const eventStartLocal = useMemo(() => toLocalInput(event.start_time), [event.start_time]);
  const eventEndLocal = useMemo(() => toLocalInput(event.end_time), [event.end_time]);

  const [rangeMode, setRangeMode] = useState<FilterMode>(() =>
    selectedDay ? "custom" : "all"
  );
  const [rangeStart, setRangeStart] = useState<string>(() => {
    if (selectedDay) {
      return toLocalInput(selectedDay.toISOString());
    }
    return eventStartLocal;
  });
  const [rangeEnd, setRangeEnd] = useState<string>(() => {
    if (selectedDay) {
      const dayEnd = new Date(selectedDay);
      dayEnd.setDate(dayEnd.getDate() + 1);
      const eventEnd = new Date(event.end_time);
      const end = dayEnd < eventEnd ? dayEnd : eventEnd;
      return toLocalInput(end.toISOString());
    }
    return eventEndLocal;
  });

  // User filter
  const availableUsers = useMemo(
    () =>
      groupShiftsByUser(shifts).map((u) => ({
        id: u.id,
        username: u.username,
        name: u.displayName || u.fullName,
      })),
    [shifts]
  );
  const [userMode, setUserMode] = useState<FilterMode>("all");
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>(() =>
    availableUsers.map((u) => u.id)
  );
  const [userSearch, setUserSearch] = useState("");

  const filteredUsers = useMemo(() => {
    if (!userSearch.trim()) return availableUsers;
    const q = userSearch.toLowerCase();
    return availableUsers.filter(
      (u) => u.name.toLowerCase().includes(q) || u.username.toLowerCase().includes(q)
    );
  }, [availableUsers, userSearch]);

  useEscapeKey(useCallback(() => onClose(), [onClose]));

  function buildConfig(): PrintConfig {
    const start = rangeMode === "all" ? eventStartLocal : rangeStart;
    const end = rangeMode === "all" ? eventEndLocal : rangeEnd;
    return {
      layout,
      paperSize: effectivePaperSize,
      landscape: effectiveLandscape,
      showCoverage,
      onePerPage: layout === "list" ? onePerPage : false,
      timeRange: {
        start: new Date(start).toISOString(),
        end: new Date(end).toISOString(),
      },
      selectedUserIds: userMode === "all" ? null : selectedUserIds,
      selectedTeamIds: teamMode === "all" ? null : selectedTeamIds,
    };
  }

  function handlePrint() {
    onPrint(buildConfig());
  }

  function handlePDF() {
    const config = buildConfig();
    if (onDownloadPDF) {
      onDownloadPDF(slug, config);
    } else {
      downloadPDF.mutate({ slug, config });
    }
  }

  const effectiveUsers = userMode === "all" ? availableUsers.map((u) => u.id) : selectedUserIds;
  const effectiveTeams = teamMode === "all" ? eventTeams.map((t) => t.team_id) : selectedTeamIds;
  const rangeValid = rangeMode === "all" || new Date(rangeStart) < new Date(rangeEnd);
  const printDisabled =
    !rangeValid ||
    effectiveUsers.length === 0 ||
    effectiveTeams.length === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="flex max-h-[90vh] w-full max-w-xl flex-col rounded-t-lg sm:rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4">
          <h2 className="text-lg font-bold">{t("events:export_title")}</h2>
          <button
            type="button"
            onClick={onClose}
            className="touch-compact rounded-md p-1 text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* Scrollable body */}
        <div className="min-h-0 overflow-y-auto px-6 pb-4 space-y-4">
          {/* Layout row */}
          <div className={layout === "grid" ? "grid grid-cols-2 gap-4" : ""}>
            <div>
              <label className="mb-2 block text-sm font-medium">{t("events:print_layout")}</label>
              <div className="flex gap-2">
                {(["grid", "list"] as Layout[]).map((l) => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => setLayout(l)}
                    className={`rounded-md px-4 py-2 text-sm ${
                      layout === l
                        ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
                        : "bg-[var(--color-muted)] text-[var(--color-foreground)]"
                    }`}
                  >
                    {l === "grid" ? t("events:print_layout_grid") : t("events:print_layout_list")}
                  </button>
                ))}
              </div>
            </div>
            {/* Paper size — only for grid */}
            {layout === "grid" && (
              <div>
                <label className="mb-2 block text-sm font-medium">{t("events:paper_size")}</label>
                <div className="flex gap-2">
                  {(["A4", "A3"] as PaperSize[]).map((size) => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => setPaperSize(size)}
                      className={`rounded-md px-4 py-2 text-sm ${
                        paperSize === size
                          ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
                          : "bg-[var(--color-muted)] text-[var(--color-foreground)]"
                      }`}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Grid options: landscape + coverage */}
          {layout === "grid" && (
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={landscape}
                  onChange={(e) => setLandscape(e.target.checked)}
                  className="rounded"
                />
                {t("events:landscape")}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={showCoverage}
                  onChange={(e) => setShowCoverage(e.target.checked)}
                  className="rounded"
                />
                {t("events:print_show_coverage")}
              </label>
            </div>
          )}

          {/* List option: one user per page */}
          {layout === "list" && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={onePerPage}
                onChange={(e) => setOnePerPage(e.target.checked)}
                className="rounded"
              />
              {t("events:print_one_per_page")}
            </label>
          )}

          {/* Team filter */}
          {eventTeams.length > 0 && (
            <FilterSection
              label={t("events:print_select_teams")}
              mode={teamMode}
              onModeChange={(m) => {
                setTeamMode(m);
                if (m === "custom") setSelectedTeamIds(eventTeams.map((t) => t.team_id));
              }}
              count={teamMode === "custom" ? selectedTeamIds.length : undefined}
              total={eventTeams.length}
              allLabel={t("events:print_filter_all")}
              customLabel={t("events:print_filter_custom")}
              selectAllLabel={t("events:print_all_teams")}
              selectNoneLabel={t("events:print_no_teams")}
              onSelectAll={() => setSelectedTeamIds(eventTeams.map((t) => t.team_id))}
              onSelectNone={() => setSelectedTeamIds([])}
            >
              <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                {eventTeams.map((team) => (
                  <label key={team.team_id} className="flex items-center gap-1 text-sm">
                    <input
                      type="checkbox"
                      checked={selectedTeamIds.includes(team.team_id)}
                      onChange={() =>
                        setSelectedTeamIds((prev) =>
                          prev.includes(team.team_id)
                            ? prev.filter((id) => id !== team.team_id)
                            : [...prev, team.team_id]
                        )
                      }
                      className="rounded"
                    />
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: team.team_color }}
                    />
                    {team.team_name}
                  </label>
                ))}
              </div>
            </FilterSection>
          )}

          {/* Time range filter */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="block text-sm font-medium">{t("events:print_time_range")}</label>
              <div className="flex rounded-md border border-[var(--color-border)] text-xs">
                <button
                  type="button"
                  onClick={() => setRangeMode("all")}
                  className={`touch-compact px-3 py-1 transition-colors ${
                    rangeMode === "all"
                      ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
                      : "hover:bg-[var(--color-muted)]"
                  }`}
                >
                  {t("events:print_filter_all")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRangeMode("custom");
                    setRangeStart(eventStartLocal);
                    setRangeEnd(eventEndLocal);
                  }}
                  className={`touch-compact border-l border-[var(--color-border)] px-3 py-1 transition-colors ${
                    rangeMode === "custom"
                      ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
                      : "hover:bg-[var(--color-muted)]"
                  }`}
                >
                  {t("events:print_filter_custom")}
                </button>
              </div>
            </div>
            {rangeMode === "custom" && (
              <div className="rounded-md border border-[var(--color-border)] p-3 space-y-3">
                <div className="flex items-center gap-3">
                  <label className="text-sm w-12 shrink-0">{t("events:print_range_start")}</label>
                  <DateTimePicker
                    value={rangeStart}
                    onChange={setRangeStart}
                    min={eventStartLocal}
                    max={eventEndLocal}
                    granularity={event.time_granularity}
                    className="flex-1"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <label className="text-sm w-12 shrink-0">{t("events:print_range_end")}</label>
                  <DateTimePicker
                    value={rangeEnd}
                    onChange={setRangeEnd}
                    min={eventStartLocal}
                    max={eventEndLocal}
                    granularity={event.time_granularity}
                    className="flex-1"
                  />
                </div>
              </div>
            )}
          </div>

          {/* User filter */}
          {availableUsers.length > 0 && (
            <FilterSection
              label={t("events:print_select_users")}
              mode={userMode}
              onModeChange={(m) => {
                setUserMode(m);
                if (m === "custom") setSelectedUserIds(availableUsers.map((u) => u.id));
              }}
              count={userMode === "custom" ? selectedUserIds.length : undefined}
              total={availableUsers.length}
              allLabel={t("events:print_filter_all")}
              customLabel={t("events:print_filter_custom")}
              selectAllLabel={t("events:print_all_users")}
              selectNoneLabel={t("events:print_no_users")}
              onSelectAll={() => setSelectedUserIds(availableUsers.map((u) => u.id))}
              onSelectNone={() => setSelectedUserIds([])}
            >
              <>
                {availableUsers.length > 8 && (
                  <input
                    type="text"
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    placeholder={t("events:search_user")}
                    className="mb-2 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-1.5 text-sm"
                  />
                )}
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {filteredUsers.map((user) => (
                    <label key={user.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={selectedUserIds.includes(user.id)}
                        onChange={() =>
                          setSelectedUserIds((prev) =>
                            prev.includes(user.id)
                              ? prev.filter((id) => id !== user.id)
                              : [...prev, user.id]
                          )
                        }
                        className="rounded"
                      />
                      <span>
                        {user.name}
                        {user.username !== user.name && (
                          <span className="ml-1 text-[var(--color-muted-foreground)]">({user.username})</span>
                        )}
                      </span>
                    </label>
                  ))}
                </div>
              </>
            </FilterSection>
          )}

          {/* PDF error */}
          {downloadPDF.isError && (
            <div className="rounded-md border border-[var(--color-error)] bg-[var(--color-error)]/10 px-3 py-2 text-sm text-[var(--color-error)]">
              {t("events:pdf_error")}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-[var(--color-border)] px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-[var(--color-border)] px-4 py-2 text-sm"
          >
            {t("common:cancel")}
          </button>
          <button
            type="button"
            onClick={handlePDF}
            disabled={printDisabled || downloadPDF.isPending}
            className="rounded-md border border-[var(--color-primary)] px-4 py-2 text-sm text-[var(--color-primary)] disabled:opacity-50"
          >
            {downloadPDF.isPending ? t("common:loading") : t("events:download_pdf")}
          </button>
          <button
            type="button"
            onClick={handlePrint}
            disabled={printDisabled}
            className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm text-[var(--color-primary-foreground)] disabled:opacity-50"
          >
            {t("events:print")}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Collapsible filter section with All/Custom toggle */
function FilterSection({
  label,
  mode,
  onModeChange,
  count,
  total,
  allLabel,
  customLabel,
  selectAllLabel,
  selectNoneLabel,
  onSelectAll,
  onSelectNone,
  children,
}: {
  label: string;
  mode: FilterMode;
  onModeChange: (mode: FilterMode) => void;
  count?: number;
  total: number;
  allLabel: string;
  customLabel: string;
  selectAllLabel: string;
  selectNoneLabel: string;
  onSelectAll: () => void;
  onSelectNone: () => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <label className="block text-sm font-medium">
          {label}
          {mode === "custom" && count !== undefined && (
            <span className="ml-1.5 text-xs text-[var(--color-muted-foreground)]">
              {count}/{total}
            </span>
          )}
        </label>
        <div className="flex rounded-md border border-[var(--color-border)] text-xs">
          <button
            type="button"
            onClick={() => onModeChange("all")}
            className={`touch-compact px-3 py-1 transition-colors ${
              mode === "all"
                ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
                : "hover:bg-[var(--color-muted)]"
            }`}
          >
            {allLabel}
          </button>
          <button
            type="button"
            onClick={() => onModeChange("custom")}
            className={`touch-compact border-l border-[var(--color-border)] px-3 py-1 transition-colors ${
              mode === "custom"
                ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
                : "hover:bg-[var(--color-muted)]"
            }`}
          >
            {customLabel}
          </button>
        </div>
      </div>
      {mode === "custom" && (
        <div className="rounded-md border border-[var(--color-border)] p-3">
          <div className="mb-2 flex gap-2 justify-end">
            <button
              type="button"
              onClick={onSelectAll}
              className="text-xs text-[var(--color-primary)] hover:underline"
            >
              {selectAllLabel}
            </button>
            <button
              type="button"
              onClick={onSelectNone}
              className="text-xs text-[var(--color-primary)] hover:underline"
            >
              {selectNoneLabel}
            </button>
          </div>
          {children}
        </div>
      )}
    </div>
  );
}
