import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { publicApi } from "@/api/public";
import { useViewParams } from "@/hooks/useViewParams";
import { ShiftGrid } from "@/components/grid/ShiftGrid";
import { ShiftStats } from "@/components/grid/ShiftStats";
import { UserShiftList } from "@/components/grid/UserShiftList";
import { DayFilter } from "@/components/grid/DayFilter";
import { useEscapeKey } from "@/hooks/useKeyboard";
import { GridSkeleton } from "@/components/common/Skeleton";
import { groupShiftsByUser } from "@/lib/time";
import type { EventTeam } from "@/api/types";

type PublicView = "everything" | "by_team" | "per_user";

export function PublicEventPage() {
  const { slug } = useParams<{ slug: string }>();
  const { t } = useTranslation(["events", "shifts", "common"]);

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

  const eventTeams = useMemo(() => gridData?.event_teams || [], [gridData?.event_teams]);

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
          <PublicExportMenu slug={event.slug} />
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

/** Export menu for public page (CSV, iCal, Print) */
function PublicExportMenu({ slug }: { slug: string }) {
  const { t } = useTranslation(["events", "common"]);
  const [open, setOpen] = useState(false);
  const [showPrint, setShowPrint] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const downloadCSV = useMutation({
    mutationFn: async () => {
      const blob = await publicApi.downloadCSV(slug);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${slug}-shifts.csv`;
      a.click();
      URL.revokeObjectURL(url);
    },
  });

  const downloadICal = useMutation({
    mutationFn: async () => {
      const blob = await publicApi.downloadICal(slug);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${slug}-shifts.ics`;
      a.click();
      URL.revokeObjectURL(url);
    },
  });

  const handleClose = useCallback(() => setOpen(false), []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        handleClose();
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open, handleClose]);

  return (
    <>
      <div className="relative" ref={ref}>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="rounded-md bg-[var(--color-muted)] px-3 py-1.5 text-sm hover:bg-[var(--color-border)]"
        >
          {t("events:export")}
        </button>

        {open && (
          <div className="absolute right-0 z-20 mt-1 w-48 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] py-1 shadow-lg">
            <button
              type="button"
              onClick={() => {
                downloadCSV.mutate();
                setOpen(false);
              }}
              disabled={downloadCSV.isPending}
              className="block w-full px-4 py-2 text-left text-sm hover:bg-[var(--color-muted)] disabled:opacity-50"
            >
              {t("events:export_csv")}
            </button>
            <button
              type="button"
              onClick={() => {
                downloadICal.mutate();
                setOpen(false);
              }}
              disabled={downloadICal.isPending}
              className="block w-full px-4 py-2 text-left text-sm hover:bg-[var(--color-muted)] disabled:opacity-50"
            >
              {t("events:export_ical")}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowPrint(true);
                setOpen(false);
              }}
              className="block w-full px-4 py-2 text-left text-sm hover:bg-[var(--color-muted)]"
            >
              {t("events:print")}
            </button>
          </div>
        )}
      </div>

      {showPrint && <PublicPrintDialog onClose={() => setShowPrint(false)} />}
    </>
  );
}

/** Simple print dialog for public page */
function PublicPrintDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation(["events", "common"]);
  useEscapeKey(useCallback(() => onClose(), [onClose]));

  function handlePrint() {
    onClose();
    requestAnimationFrame(() => window.print());
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-t-lg sm:rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold">{t("events:print_settings")}</h2>
        <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">
          {t("events:print")}
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-[var(--color-border)] px-4 py-2 text-sm"
          >
            {t("common:cancel")}
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm text-[var(--color-primary-foreground)]"
          >
            {t("events:print")}
          </button>
        </div>
      </div>
    </div>
  );
}
