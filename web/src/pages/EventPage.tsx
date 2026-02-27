import { useState, useMemo, useCallback, useRef } from "react";
import { useParams, Link } from "react-router";
import { useTranslation } from "react-i18next";
import { useEvent, useEventHiddenRanges, useEventTeams, useEventPinnedUsers } from "@/hooks/useEvents";
import { useGridData, useUpdateShift } from "@/hooks/useShifts";
import { useTeams } from "@/hooks/useTeams";
import { useAuth } from "@/contexts/AuthContext";
import { useTimeFormat } from "@/hooks/useTimeFormat";
import { useSSE } from "@/hooks/useSSE";
import { useViewParams } from "@/hooks/useViewParams";
import { useGridNavigation } from "@/hooks/useKeyboard";
import { generateTimeSlots } from "@/lib/time";
import { ShiftGrid } from "@/components/grid/ShiftGrid";
import { ShiftStats } from "@/components/grid/ShiftStats";
import { UserShiftList } from "@/components/grid/UserShiftList";
import { ViewSelector } from "@/components/grid/ViewSelector";
import { groupShiftsByUser } from "@/lib/time";
import { DayFilter } from "@/components/grid/DayFilter";
import { CreateShiftDialog } from "@/components/shifts/CreateShiftDialog";
import { ShiftDetailDialog } from "@/components/shifts/ShiftDetailDialog";
import { ExportMenu } from "@/components/export/ExportMenu";
import { PrintContainer } from "@/components/export/PrintContainer";
import { AvailabilityEditor } from "@/components/availability/AvailabilityEditor";
import { GridSkeleton } from "@/components/common/Skeleton";
import type { Shift, PrintConfig } from "@/api/types";

export function EventPage() {
  const { slug } = useParams<{ slug: string }>();
  const { t, i18n } = useTranslation(["events", "shifts", "common"]);
  const { data: event, isLoading } = useEvent(slug!);
  const { data: gridData, isLoading: isGridLoading } = useGridData(slug!);
  const { data: hiddenRanges } = useEventHiddenRanges(slug!);
  const { data: teams } = useTeams();
  const { data: eventTeams } = useEventTeams(slug!);
  // Connect to SSE for real-time updates on this event
  useSSE({ slug, enabled: !!slug });
  const { user } = useAuth();
  const { data: pinnedUsersData } = useEventPinnedUsers(slug!, !!user && (user.role === "super_admin" || !!event?.is_event_admin));
  const hour12 = useTimeFormat();
  const updateShift = useUpdateShift();

  // View state (synced with URL search params for shareable links)
  const {
    view, setView,
    selectedTeamId, setSelectedTeamId,
    selectedUserIds, setSelectedUserIds,
    selectedDay, setSelectedDay,
  } = useViewParams();
  const [showAvailUsers, setShowAvailUsers] = useState(false);

  // Dialog state
  const [createDialogState, setCreateDialogState] = useState<{ time: Date; userId?: string } | null>(null);
  const [selectedShift, setSelectedShift] = useState<Shift | null>(null);
  const [showAvailability, setShowAvailability] = useState(false);
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

    // Inject dynamic @page style
    const style = document.createElement("style");
    style.id = "print-page-override";
    const orientation = config.landscape ? "landscape" : "portrait";
    style.textContent = `@page { size: ${config.paperSize} ${orientation}; margin: 8mm; }`;
    document.head.appendChild(style);

    // Wait one more frame to ensure portal content is painted
    requestAnimationFrame(() => {
      window.print();
      // Cleanup
      document.getElementById("print-page-override")?.remove();
      setPrintConfig(null);
    });
  }, []);

  // Map pinned users to grid format
  const pinnedUsers = useMemo(
    () => (pinnedUsersData || []).map((p) => ({
      id: p.user_id,
      username: p.username,
      fullName: p.full_name,
      displayName: p.display_name,
    })),
    [pinnedUsersData],
  );

  // All event teams (unfiltered — for grid display)
  const allEventTeams = useMemo(() => eventTeams || [], [eventTeams]);

  // Visible event teams only (for stats and view selector)
  const visibleEventTeams = useMemo(
    () => allEventTeams.filter((et) => et.is_visible),
    [allEventTeams],
  );

  const visibleTeamIds = useMemo(
    () => new Set(visibleEventTeams.map((et) => et.team_id)),
    [visibleEventTeams],
  );

  // Build user list from shifts + availability (for per-user search dropdown)
  const allUsers = useMemo(() => {
    const shifts = gridData?.shifts || [];
    const users = new Map<string, { id: string; name: string; username: string }>();
    for (const u of groupShiftsByUser(shifts)) {
      users.set(u.id, { id: u.id, name: u.displayName || u.fullName, username: u.username });
    }
    // Also include users who only have availability
    for (const a of gridData?.availability || []) {
      if (!users.has(a.user_id)) {
        users.set(a.user_id, {
          id: a.user_id,
          name: a.user_display_name || a.user_full_name,
          username: a.username,
        });
      }
    }
    return Array.from(users.values()).sort((a, b) => a.username.localeCompare(b.username));
  }, [gridData?.shifts, gridData?.availability]);

  // Filter shifts based on current view (grid — shows ALL teams including hidden)
  const filteredShifts = useMemo(() => {
    const shifts = gridData?.shifts || [];
    switch (view) {
      case "by_team":
        return selectedTeamId ? shifts.filter((s) => s.team_id === selectedTeamId) : shifts;
      case "my_shifts":
        return user ? shifts.filter((s) => s.user_id === user.id) : shifts;
      case "per_user": {
        if (selectedUserIds.length === 0) return shifts;
        const idSet = new Set(selectedUserIds);
        return shifts.filter((s) => idSet.has(s.user_id));
      }
      default:
        return shifts;
    }
  }, [gridData?.shifts, view, selectedTeamId, selectedUserIds, user]);

  // Stats shifts — only visible teams (hidden teams excluded from statistics)
  const statsShifts = useMemo(() => {
    return filteredShifts.filter((s) => visibleTeamIds.has(s.team_id));
  }, [filteredShifts, visibleTeamIds]);

  // Compute grid slots and users for keyboard navigation (must be before early returns)
  const gridSlots = useMemo(() => {
    if (!event) return [];
    const range = (() => {
      if (!selectedDay) return { start: event.start_time, end: event.end_time };
      const dayStart = new Date(selectedDay);
      const dayEnd = new Date(selectedDay);
      dayEnd.setDate(dayEnd.getDate() + 1);
      const eventStart = new Date(event.start_time);
      const eventEnd = new Date(event.end_time);
      return {
        start: (dayStart > eventStart ? dayStart : eventStart).toISOString(),
        end: (dayEnd < eventEnd ? dayEnd : eventEnd).toISOString(),
      };
    })();
    return generateTimeSlots(range.start, range.end, event.time_granularity, hiddenRanges || []);
  }, [event, selectedDay, hiddenRanges]);

  const gridUsers = useMemo(() => groupShiftsByUser(filteredShifts), [filteredShifts]);

  const gridNavEnabled = !createDialogState && !selectedShift && !showAvailability && view !== "per_user";
  const gridNavOnEnter = useCallback((row: number, col: number) => {
    if (!event) return;
    const isRo = user?.role === "read_only";
    if (isRo || event.is_locked) return;
    const u = gridUsers[row];
    const slot = gridSlots[col];
    if (u && slot) {
      const canManage = user?.role === "super_admin" || event.is_event_admin;
      setCreateDialogState({ time: slot, userId: canManage ? u.id : undefined });
    }
  }, [gridUsers, gridSlots, event, user]);
  const { focusedCell, handleGridKeyDown } = useGridNavigation(
    gridUsers.length,
    gridSlots.length,
    { onEnter: gridNavOnEnter, enabled: gridNavEnabled },
  );

  if (isLoading) {
    return <p className="text-[var(--color-muted-foreground)]">{t("common:loading")}</p>;
  }

  if (!event) {
    return <p className="text-[var(--color-muted-foreground)]">{t("events:not_found")}</p>;
  }

  const startDate = new Date(event.start_time);
  const endDate = new Date(event.end_time);
  const dateFormatter = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: "full",
    timeStyle: "short",
    hour12,
  });

  const isSuperAdmin = user?.role === "super_admin";
  const isReadOnly = user?.role === "read_only";
  const isEventAdmin = event.is_event_admin;
  const canManageShifts = isSuperAdmin || isEventAdmin;
  const canEdit = !isReadOnly && !event.is_locked;

  function handleCellClick(userId: string, slotTime: Date) {
    if (!canEdit) return;
    setCreateDialogState({ time: slotTime, userId: canManageShifts ? userId : undefined });
  }

  function handleShiftClick(shift: Shift) {
    setSelectedShift(shift);
  }

  function handleShiftMove(shiftId: string, newStartTime: string, newEndTime: string) {
    if (!slug) return;
    updateShift.mutate({
      slug,
      shiftId,
      data: { start_time: newStartTime, end_time: newEndTime },
    });
  }

  function handleShiftResize(shiftId: string, newEndTime: string) {
    if (!slug) return;
    updateShift.mutate({
      slug,
      shiftId,
      data: { end_time: newEndTime },
    });
  }

  return (
    <div>
      <div className="mb-2">
        <Link to="/" className="text-sm text-[var(--color-primary)] hover:underline">
          {t("common:back")}
        </Link>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{event.name}</h1>
          <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">/{event.slug}</p>
        </div>
        <div className="flex gap-2">
          {event.is_locked && (
            <span className="rounded-full bg-[var(--color-warning-light)] px-2.5 py-1 text-xs text-[var(--color-warning-foreground)]">
              {t("events:locked")}
            </span>
          )}
          {event.is_public && (
            <a
              href={`/public/events/${event.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full bg-[var(--color-success-light)] px-2.5 py-1 text-xs text-[var(--color-success)] hover:bg-[var(--color-success-border)]"
              title={t("events:open_public_link")}
            >
              {t("events:public")}
            </a>
          )}
          <ExportMenu
            slug={event.slug}
            event={event}
            shifts={gridData?.shifts || []}
            coverage={gridData?.coverage || []}
            eventTeams={allEventTeams}
            hiddenRanges={hiddenRanges || []}
            selectedDay={selectedDay}
            onPrint={handlePrint}
          />
          {canManageShifts && (
            <Link
              to={`/events/${event.slug}/settings`}
              className="rounded-md bg-[var(--color-muted)] px-3 py-1.5 text-sm hover:bg-[var(--color-border)]"
            >
              {t("events:settings")}
            </Link>
          )}
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

      {/* Shift Grid — full-width breakout */}
      <div className="relative left-1/2 mt-8 w-screen -translate-x-1/2 px-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{t("shifts:title")}</h2>
          <div className="flex flex-wrap items-center gap-3">
            <DayFilter
              eventStartTime={event.start_time}
              eventEndTime={event.end_time}
              selectedDay={selectedDay}
              onDayChange={setSelectedDay}
            />
            <ViewSelector
              view={view}
              onViewChange={setView}
              teams={teams?.filter((t) => visibleTeamIds.has(t.id))}
              selectedTeamId={selectedTeamId}
              onTeamChange={setSelectedTeamId}
              users={allUsers}
              selectedUserIds={selectedUserIds}
              onUserChange={setSelectedUserIds}
            />
            <button
              type="button"
              onClick={() => setShowAvailUsers((v) => !v)}
              className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                showAvailUsers
                  ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
                  : "border-[var(--color-border)] hover:bg-[var(--color-muted)]"
              }`}
              title={t("events:show_availability_users")}
            >
              {t("events:show_availability_users")}
            </button>
            {!isReadOnly && (
              <button
                type="button"
                onClick={() => setShowAvailability(true)}
                className="rounded-md bg-[var(--color-muted)] px-3 py-1.5 text-sm hover:bg-[var(--color-border)]"
              >
                {t("events:edit_availability")}
              </button>
            )}
            {canEdit && (
              <button
                type="button"
                onClick={() => setCreateDialogState({ time: new Date(event.start_time) })}
                className="rounded-md bg-[var(--color-primary)] px-3 py-1.5 text-sm text-[var(--color-primary-foreground)]"
              >
                + {t("shifts:create")}
              </button>
            )}
          </div>
        </div>

        {isGridLoading ? (
          <GridSkeleton />
        ) : gridData ? (
          view === "per_user" && selectedUserIds.length === 1 ? (
            <UserShiftList
              shifts={filteredShifts}
              userName={allUsers.find((u) => u.id === selectedUserIds[0])?.name || ""}
            />
          ) : (
            <ShiftGrid
              event={event}
              shifts={filteredShifts}
              allShifts={gridData.shifts || []}
              coverage={gridData.coverage || []}
              availability={showAvailUsers ? (gridData.availability || []) : []}
              hiddenRanges={hiddenRanges || []}
              eventTeams={allEventTeams}
              pinnedUsers={pinnedUsers}
              dayFilter={selectedDay}
              showAvailabilityUsers={showAvailUsers}
              onCellClick={handleCellClick}
              onShiftClick={handleShiftClick}
              onShiftMove={canEdit ? handleShiftMove : undefined}
              onShiftResize={canEdit ? handleShiftResize : undefined}
              focusedCell={focusedCell}
              onGridKeyDown={handleGridKeyDown}
            />
          )
        ) : (
          <div className="rounded-lg border border-dashed border-[var(--color-border)] p-8 text-center text-[var(--color-muted-foreground)]">
            {t("shifts:no_shifts", "No shift data available")}
          </div>
        )}
      </div>

      {/* Stats (only visible teams) */}
      {gridData && gridData.shifts.length > 0 && (
        <ShiftStats
          shifts={statsShifts}
          coverage={gridData.coverage || []}
          eventTeams={visibleEventTeams}
          eventStartTime={event.start_time}
          eventEndTime={event.end_time}
        />
      )}

      {/* Create Shift Dialog */}
      {createDialogState && (
        <CreateShiftDialog
          event={event}
          initialTime={createDialogState.time}
          targetUserId={createDialogState.userId}
          canSelectUser={canManageShifts}
          visibleTeamIds={visibleTeamIds}
          onClose={() => setCreateDialogState(null)}
        />
      )}

      {/* Shift Detail / Delete Dialog */}
      {selectedShift && (
        <ShiftDetailDialog
          shift={selectedShift}
          eventSlug={event.slug}
          canManageShifts={canManageShifts}
          timeGranularity={event.time_granularity}
          onClose={() => setSelectedShift(null)}
        />
      )}

      {/* Availability Editor */}
      {showAvailability && (
        <AvailabilityEditor
          event={event}
          onClose={() => setShowAvailability(false)}
        />
      )}

      {/* Print Container (hidden on screen, visible for print) */}
      <PrintContainer
        event={event}
        shifts={gridData?.shifts || []}
        coverage={gridData?.coverage || []}
        eventTeams={allEventTeams}
        hiddenRanges={hiddenRanges || []}
        config={printConfig}
        onReady={handlePrintReady}
      />
    </div>
  );
}
