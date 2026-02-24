import { useState, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useEscapeKey } from "@/hooks/useKeyboard";
import { useDownloadCSV, useDownloadICal, useDownloadPDF } from "@/hooks/useExport";
import { getEventDays, formatDayHeader, groupShiftsByUser } from "@/lib/time";
import type { Event, Shift, CoverageRequirement, EventTeam, HiddenRange, PrintConfig } from "@/api/types";

type Tab = "print" | "csv" | "ical";
type Layout = "grid" | "list";
type PaperSize = "A4" | "A3";

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
  onDownloadCSV?: (slug: string) => void;
  onDownloadICal?: (slug: string) => void;
}

export function ExportModal({
  event,
  shifts,
  selectedDay,
  slug,
  onPrint,
  onClose,
  onDownloadCSV,
  onDownloadICal,
}: ExportModalProps) {
  const { t } = useTranslation(["events", "common"]);
  const downloadCSV = useDownloadCSV();
  const downloadICal = useDownloadICal();
  const downloadPDF = useDownloadPDF();

  const [tab, setTab] = useState<Tab>("print");
  const [layout, setLayout] = useState<Layout>("grid");
  const [paperSize, setPaperSize] = useState<PaperSize>("A4");
  const [landscape, setLandscape] = useState(true);
  const [showCoverage, setShowCoverage] = useState(true);
  const [showTeamColors, setShowTeamColors] = useState(true);

  // All event days
  const allDays = useMemo(
    () => getEventDays(event.start_time, event.end_time),
    [event.start_time, event.end_time]
  );

  // Initialize selected days: if a day filter is active, pre-select just that day
  const [selectedDays, setSelectedDays] = useState<Date[]>(() => {
    if (selectedDay) {
      const match = allDays.find((d) => d.toDateString() === selectedDay.toDateString());
      return match ? [match] : allDays;
    }
    return allDays;
  });

  // User selection: null = all users
  const availableUsers = useMemo(
    () => groupShiftsByUser(shifts).map((u) => ({
      id: u.id,
      name: u.displayName || u.fullName,
    })),
    [shifts]
  );
  const [selectedUserIds, setSelectedUserIds] = useState<string[] | null>(null);

  useEscapeKey(useCallback(() => onClose(), [onClose]));

  function handlePrint() {
    onPrint({
      layout,
      paperSize,
      landscape,
      showCoverage,
      showTeamColors,
      selectedDays,
      selectedUserIds,
    });
  }

  function handlePDF() {
    downloadPDF.mutate({
      slug,
      config: {
        layout,
        paperSize,
        landscape,
        showCoverage,
        showTeamColors,
        selectedDays,
        selectedUserIds,
      },
    });
  }

  function toggleDay(day: Date) {
    setSelectedDays((prev) => {
      const exists = prev.some((d) => d.toDateString() === day.toDateString());
      if (exists) return prev.filter((d) => d.toDateString() !== day.toDateString());
      return [...prev, day].sort((a, b) => a.getTime() - b.getTime());
    });
  }

  function selectAllDays() {
    setSelectedDays(allDays);
  }

  function selectNoDays() {
    setSelectedDays([]);
  }

  function toggleUser(userId: string) {
    setSelectedUserIds((prev) => {
      if (prev === null) {
        // Currently "all" — expand to all-except-toggled
        return availableUsers.map((u) => u.id).filter((id) => id !== userId);
      }
      const exists = prev.includes(userId);
      if (exists) return prev.filter((id) => id !== userId);
      return [...prev, userId];
    });
  }

  function selectAllUsers() {
    setSelectedUserIds(null);
  }

  function selectNoUsers() {
    setSelectedUserIds([]);
  }

  function handleCSV() {
    if (onDownloadCSV) {
      onDownloadCSV(slug);
    } else {
      downloadCSV.mutate(slug);
    }
    onClose();
  }

  function handleICal() {
    if (onDownloadICal) {
      onDownloadICal(slug);
    } else {
      downloadICal.mutate(slug);
    }
    onClose();
  }

  const csvPending = onDownloadCSV ? false : downloadCSV.isPending;
  const icalPending = onDownloadICal ? false : downloadICal.isPending;

  const printDisabled = selectedDays.length === 0 || (selectedUserIds !== null && selectedUserIds.length === 0);

  const tabs: { key: Tab; label: string }[] = [
    { key: "print", label: t("events:export_tab_print") },
    { key: "csv", label: t("events:export_tab_csv") },
    { key: "ical", label: t("events:export_tab_ical") },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-xl rounded-t-lg sm:rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold">{t("events:export_title")}</h2>

        {/* Tabs */}
        <div className="mt-4 flex gap-1 border-b border-[var(--color-border)]">
          {tabs.map((tb) => (
            <button
              key={tb.key}
              type="button"
              onClick={() => setTab(tb.key)}
              className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors ${
                tab === tb.key
                  ? "border-[var(--color-primary)] text-[var(--color-primary)]"
                  : "border-transparent text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] hover:border-[var(--color-border)]"
              }`}
            >
              {tb.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="mt-4">
          {tab === "print" && (
            <div className="space-y-4">
              {/* Layout toggle */}
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

              {/* Paper size */}
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

              {/* Landscape toggle */}
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={landscape}
                  onChange={(e) => setLandscape(e.target.checked)}
                  className="rounded"
                />
                {t("events:landscape")}
              </label>

              {/* Show coverage toggle (only for grid) */}
              {layout === "grid" && (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={showCoverage}
                    onChange={(e) => setShowCoverage(e.target.checked)}
                    className="rounded"
                  />
                  {t("events:print_show_coverage")}
                </label>
              )}

              {/* Show team colors toggle */}
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={showTeamColors}
                  onChange={(e) => setShowTeamColors(e.target.checked)}
                  className="rounded"
                />
                {t("events:print_show_team_colors")}
              </label>

              {/* Day selection */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="block text-sm font-medium">{t("events:print_select_days")}</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={selectAllDays}
                      className="text-xs text-[var(--color-primary)] hover:underline"
                    >
                      {t("events:print_all_days")}
                    </button>
                    <button
                      type="button"
                      onClick={selectNoDays}
                      className="text-xs text-[var(--color-primary)] hover:underline"
                    >
                      {t("events:print_no_days")}
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {allDays.map((day) => {
                    const checked = selectedDays.some((d) => d.toDateString() === day.toDateString());
                    return (
                      <label key={day.toISOString()} className="flex items-center gap-1 text-sm">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleDay(day)}
                          className="rounded"
                        />
                        {formatDayHeader(day)}
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* User selection */}
              {availableUsers.length > 0 && (
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <label className="block text-sm font-medium">{t("events:print_select_users")}</label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={selectAllUsers}
                        className="text-xs text-[var(--color-primary)] hover:underline"
                      >
                        {t("events:print_all_users")}
                      </button>
                      <button
                        type="button"
                        onClick={selectNoUsers}
                        className="text-xs text-[var(--color-primary)] hover:underline"
                      >
                        {t("events:print_no_users")}
                      </button>
                    </div>
                  </div>
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {availableUsers.map((user) => {
                      const checked = selectedUserIds === null || selectedUserIds.includes(user.id);
                      return (
                        <label key={user.id} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleUser(user.id)}
                            className="rounded"
                          />
                          {user.name}
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Print / PDF buttons */}
              <div className="flex justify-end gap-2 pt-2">
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
          )}

          {tab === "csv" && (
            <div className="space-y-4">
              <p className="text-sm text-[var(--color-muted-foreground)]">
                {t("events:csv_description")}
              </p>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-md border border-[var(--color-border)] px-4 py-2 text-sm"
                >
                  {t("common:cancel")}
                </button>
                <button
                  type="button"
                  onClick={handleCSV}
                  disabled={csvPending}
                  className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm text-[var(--color-primary-foreground)] disabled:opacity-50"
                >
                  {t("events:download_csv")}
                </button>
              </div>
            </div>
          )}

          {tab === "ical" && (
            <div className="space-y-4">
              <p className="text-sm text-[var(--color-muted-foreground)]">
                {t("events:ical_description")}
              </p>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-md border border-[var(--color-border)] px-4 py-2 text-sm"
                >
                  {t("common:cancel")}
                </button>
                <button
                  type="button"
                  onClick={handleICal}
                  disabled={icalPending}
                  className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm text-[var(--color-primary-foreground)] disabled:opacity-50"
                >
                  {t("events:download_ical")}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
