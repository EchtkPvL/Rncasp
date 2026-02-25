import { useState, useMemo, useRef, useCallback } from "react";
import { useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { publicApi } from "@/api/public";
import { useViewParams } from "@/hooks/useViewParams";
import { ShiftGrid } from "@/components/grid/ShiftGrid";
import { ShiftStats } from "@/components/grid/ShiftStats";
import { UserShiftList } from "@/components/grid/UserShiftList";
import { DayFilter } from "@/components/grid/DayFilter";
import { GridSkeleton } from "@/components/common/Skeleton";
import { ExportMenu } from "@/components/export/ExportMenu";
import { PrintContainer } from "@/components/export/PrintContainer";
import { groupShiftsByUser } from "@/lib/time";
import { useTimeFormat } from "@/hooks/useTimeFormat";
import type { EventTeam, PrintConfig } from "@/api/types";

type PublicView = "everything" | "by_team" | "per_user";

export function PublicEventPage() {
  const { slug } = useParams<{ slug: string }>();
  const { t } = useTranslation(["events", "shifts", "common"]);
  const hour12 = useTimeFormat();

  const { data: event, isLoading: isEventLoading, error: eventError } = useQuery({
    queryKey: ["public-event", slug],
    queryFn: () => publicApi.getEvent(slug!),
    enabled: !!slug,
  });

  const { data: gridData, isLoading: isGridLoading } = useQuery({
    queryKey: ["public-grid", slug],
    queryFn: () => publicApi.getGrid(slug!),
    enabled: !!slug && !!event,
  });

  // View state (synced with URL search params for shareable links)
  const {
    view: rawView, setView: setRawView,
    selectedTeamId, setSelectedTeamId,
    selectedUserId, setSelectedUserId,
    selectedDay, setSelectedDay,
  } = useViewParams();
  // Public page doesn't support "my_shifts", fall back to "everything"
  const view: PublicView = rawView === "my_shifts" ? "everything" : rawView as PublicView;
  const setView = setRawView;

  const eventTeams = useMemo(() => (gridData?.event_teams || []) as EventTeam[], [gridData?.event_teams]);

  // Build user list from shifts for per_user view
  const shiftUsers = useMemo(() => {
    const shifts = gridData?.shifts || [];
    return groupShiftsByUser(shifts).map((u) => ({
      id: u.id,
      name: u.displayName || u.fullName,
    }));
  }, [gridData?.shifts]);

  // Filter shifts based on current view
  const filteredShifts = useMemo(() => {
    const shifts = gridData?.shifts || [];
    switch (view) {
      case "by_team":
        return selectedTeamId ? shifts.filter((s) => s.team_id === selectedTeamId) : shifts;
      case "per_user":
        return selectedUserId ? shifts.filter((s) => s.user_id === selectedUserId) : shifts;
      default:
        return shifts;
    }
  }, [gridData?.shifts, view, selectedTeamId, selectedUserId]);

  // Print state (same pattern as EventPage)
  const [printConfig, setPrintConfig] = useState<PrintConfig | null>(null);
  const pendingPrintRef = useRef<PrintConfig | null>(null);

  function handlePrint(config: PrintConfig) {
    pendingPrintRef.current = config;
    setPrintConfig(config);
  }

  const handlePrintReady = useCallback(() => {
    const config = pendingPrintRef.current;
    if (!config) return;
    pendingPrintRef.current = null;

    const style = document.createElement("style");
    style.id = "print-page-override";
    const orientation = config.landscape ? "landscape" : "portrait";
    style.textContent = `@page { size: ${config.paperSize} ${orientation}; margin: 8mm; }`;
    document.head.appendChild(style);

    requestAnimationFrame(() => {
      window.print();
      document.getElementById("print-page-override")?.remove();
      setPrintConfig(null);
    });
  }, []);

  // Public download callbacks
  const downloadCSV = useMutation({
    mutationFn: async (eventSlug: string) => {
      const blob = await publicApi.downloadCSV(eventSlug);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${eventSlug}-shifts.csv`;
      a.click();
      URL.revokeObjectURL(url);
    },
  });

  const downloadICal = useMutation({
    mutationFn: async (eventSlug: string) => {
      const blob = await publicApi.downloadICal(eventSlug);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${eventSlug}-shifts.ics`;
      a.click();
      URL.revokeObjectURL(url);
    },
  });

  const handleDownloadCSV = useCallback((s: string) => downloadCSV.mutate(s), [downloadCSV]);
  const handleDownloadICal = useCallback((s: string) => downloadICal.mutate(s), [downloadICal]);

  if (isEventLoading) {
    return <p className="text-[var(--color-muted-foreground)]">{t("common:loading")}</p>;
  }

  if (eventError || !event) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--color-border)] p-8 text-center">
        <p className="text-[var(--color-muted-foreground)]">{t("events:not_found")}</p>
      </div>
    );
  }

  const startDate = new Date(event.start_time);
  const endDate = new Date(event.end_time);
  const dateFormatter = new Intl.DateTimeFormat(undefined, {
    dateStyle: "full",
    timeStyle: "short",
    hour12,
  });

  return (
    <div>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{event.name}</h1>
          <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">/{event.slug}</p>
        </div>
        <div className="flex gap-2">
          <span className="rounded-full bg-[var(--color-info-light)] px-2.5 py-1 text-xs text-[var(--color-info)]">
            {t("events:public")}
          </span>
          <ExportMenu
            slug={event.slug}
            event={event}
            shifts={gridData?.shifts || []}
            coverage={gridData?.coverage || []}
            eventTeams={eventTeams}
            selectedDay={selectedDay}
            onPrint={handlePrint}
            onDownloadCSV={handleDownloadCSV}
            onDownloadICal={handleDownloadICal}
          />
        </div>
      </div>

      {event.description && (
        <p className="mt-4 text-[var(--color-muted-foreground)]">{event.description}</p>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-[var(--color-border)] p-3">
          <div className="text-xs text-[var(--color-muted-foreground)]">{t("events:start_time")}</div>
          <div className="mt-1 text-sm font-medium">{dateFormatter.format(startDate)}</div>
        </div>
        <div className="rounded-lg border border-[var(--color-border)] p-3">
          <div className="text-xs text-[var(--color-muted-foreground)]">{t("events:end_time")}</div>
          <div className="mt-1 text-sm font-medium">{dateFormatter.format(endDate)}</div>
        </div>
        <div className="rounded-lg border border-[var(--color-border)] p-3">
          <div className="text-xs text-[var(--color-muted-foreground)]">{t("events:granularity")}</div>
          <div className="mt-1 text-sm font-medium">{event.time_granularity}</div>
        </div>
        {event.location && (
          <div className="rounded-lg border border-[var(--color-border)] p-3">
            <div className="text-xs text-[var(--color-muted-foreground)]">{t("events:location")}</div>
            <div className="mt-1 text-sm font-medium">{event.location}</div>
          </div>
        )}
      </div>

      {/* Shift Grid */}
      <div className="mt-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{t("shifts:title")}</h2>
          <div className="flex flex-wrap items-center gap-3">
            <DayFilter
              eventStartTime={event.start_time}
              eventEndTime={event.end_time}
              selectedDay={selectedDay}
              onDayChange={setSelectedDay}
            />
            <PublicViewSelector
              view={view}
              onViewChange={setView}
              eventTeams={eventTeams}
              selectedTeamId={selectedTeamId}
              onTeamChange={setSelectedTeamId}
              users={shiftUsers}
              selectedUserId={selectedUserId}
              onUserChange={setSelectedUserId}
            />
          </div>
        </div>

        {isGridLoading ? (
          <GridSkeleton />
        ) : gridData ? (
          view === "per_user" && selectedUserId ? (
            <UserShiftList
              shifts={filteredShifts}
              userName={shiftUsers.find((u) => u.id === selectedUserId)?.name || ""}
            />
          ) : (
            <ShiftGrid
              event={event}
              shifts={filteredShifts}
              allShifts={gridData.shifts || []}
              coverage={gridData.coverage || []}
              availability={[]}
              hiddenRanges={[]}
              eventTeams={eventTeams}
              dayFilter={selectedDay}
            />
          )
        ) : (
          <div className="rounded-lg border border-dashed border-[var(--color-border)] p-8 text-center text-[var(--color-muted-foreground)]">
            {t("shifts:no_shifts", "No shift data available")}
          </div>
        )}
      </div>

      {/* Stats */}
      {gridData && gridData.shifts.length > 0 && (
        <ShiftStats
          shifts={gridData.shifts}
          coverage={gridData.coverage || []}
          eventTeams={eventTeams}
          eventStartTime={event.start_time}
          eventEndTime={event.end_time}
        />
      )}

      {/* Print Container (hidden on screen, visible for print) */}
      <PrintContainer
        event={event}
        shifts={gridData?.shifts || []}
        coverage={gridData?.coverage || []}
        eventTeams={eventTeams}
        hiddenRanges={[]}
        config={printConfig}
        onReady={handlePrintReady}
      />
    </div>
  );
}

/** View selector for public page (no "my_shifts" option) */
function PublicViewSelector({
  view,
  onViewChange,
  eventTeams,
  selectedTeamId,
  onTeamChange,
  users,
  selectedUserId,
  onUserChange,
}: {
  view: PublicView;
  onViewChange: (v: PublicView) => void;
  eventTeams: EventTeam[];
  selectedTeamId: string;
  onTeamChange: (id: string) => void;
  users: { id: string; name: string }[];
  selectedUserId: string;
  onUserChange: (id: string) => void;
}) {
  const { t } = useTranslation(["shifts", "events"]);

  const views: { key: PublicView; label: string }[] = [
    { key: "everything", label: t("shifts:views.everything") },
    { key: "by_team", label: t("shifts:views.by_team") },
    { key: "per_user", label: t("events:per_user") },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex rounded-md border border-[var(--color-border)]">
        {views.map((v, i) => (
          <button
            key={v.key}
            type="button"
            onClick={() => onViewChange(v.key)}
            className={`px-3 py-1.5 text-sm transition-colors ${
              view === v.key
                ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
                : "hover:bg-[var(--color-muted)]"
            } ${i !== 0 ? "border-l border-[var(--color-border)]" : ""}`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {view === "by_team" && eventTeams.length > 0 && (
        <select
          value={selectedTeamId}
          onChange={(e) => onTeamChange(e.target.value)}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-1.5 text-sm"
        >
          <option value="">{t("shifts:views.everything")}</option>
          {eventTeams.map((et) => (
            <option key={et.team_id} value={et.team_id}>
              {et.team_name}
            </option>
          ))}
        </select>
      )}

      {view === "per_user" && users.length > 0 && (
        <select
          value={selectedUserId}
          onChange={(e) => onUserChange(e.target.value)}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-1.5 text-sm"
        >
          <option value="">{t("events:select_user")}</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
