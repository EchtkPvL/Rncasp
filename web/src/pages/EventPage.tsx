import { useState, useMemo } from "react";
import { useParams, Link } from "react-router";
import { useTranslation } from "react-i18next";
import { useEvent, useEventAdmins, useEventHiddenRanges, useEventTeams } from "@/hooks/useEvents";
import { useGridData, useUpdateShift } from "@/hooks/useShifts";
import { useTeams } from "@/hooks/useTeams";
import { useAuth } from "@/contexts/AuthContext";
import { useSSE } from "@/hooks/useSSE";
import { useViewParams } from "@/hooks/useViewParams";
import { ShiftGrid } from "@/components/grid/ShiftGrid";
import { ShiftStats } from "@/components/grid/ShiftStats";
import { UserShiftList } from "@/components/grid/UserShiftList";
import { ViewSelector, type GridView } from "@/components/grid/ViewSelector";
import { groupShiftsByUser } from "@/lib/time";
import { DayFilter } from "@/components/grid/DayFilter";
import { CreateShiftDialog } from "@/components/shifts/CreateShiftDialog";
import { ShiftDetailDialog } from "@/components/shifts/ShiftDetailDialog";
import { ExportMenu } from "@/components/export/ExportMenu";
import { AvailabilityEditor } from "@/components/availability/AvailabilityEditor";
import { GridSkeleton } from "@/components/common/Skeleton";
import type { Shift } from "@/api/types";

export function EventPage() {
  const { slug } = useParams<{ slug: string }>();
  const { t } = useTranslation(["events", "shifts", "common"]);
  const { data: event, isLoading } = useEvent(slug!);
  const { data: gridData, isLoading: isGridLoading } = useGridData(slug!);
  const { data: hiddenRanges } = useEventHiddenRanges(slug!);
  const { data: teams } = useTeams();
  const { data: eventTeams } = useEventTeams(slug!);
  const { data: admins } = useEventAdmins(slug!);

  // Connect to SSE for real-time updates on this event
  useSSE({ slug, enabled: !!slug });
  const { user } = useAuth();
  const updateShift = useUpdateShift();

  // View state (synced with URL search params for shareable links)
  const {
    view, setView,
    selectedTeamId, setSelectedTeamId,
    selectedUserId, setSelectedUserId,
    selectedDay, setSelectedDay,
  } = useViewParams();

  // Dialog state
  const [createDialogState, setCreateDialogState] = useState<{ time: Date; userId?: string } | null>(null);
  const [selectedShift, setSelectedShift] = useState<Shift | null>(null);
  const [showAvailability, setShowAvailability] = useState(false);

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
      case "my_shifts":
        return user ? shifts.filter((s) => s.user_id === user.id) : shifts;
      case "per_user":
        return selectedUserId ? shifts.filter((s) => s.user_id === selectedUserId) : shifts;
      default:
        return shifts;
    }
  }, [gridData?.shifts, view, selectedTeamId, selectedUserId, user]);

  if (isLoading) {
    return <p className="text-[var(--color-muted-foreground)]">{t("common:loading")}</p>;
  }

  if (!event) {
    return <p className="text-[var(--color-muted-foreground)]">{t("events:not_found")}</p>;
  }

  const startDate = new Date(event.start_time);
  const endDate = new Date(event.end_time);
  const dateFormatter = new Intl.DateTimeFormat(undefined, {
    dateStyle: "full",
    timeStyle: "short",
  });

  const isSuperAdmin = user?.role === "super_admin";
  const isReadOnly = user?.role === "read_only";
  const isEventAdmin = admins?.some((a) => a.user_id === user?.id) ?? false;
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
            <span className="rounded-full bg-[var(--color-info-light)] px-2.5 py-1 text-xs text-[var(--color-info)]">
              {t("events:public")}
            </span>
          )}
          <ExportMenu slug={event.slug} />
          {isSuperAdmin && (
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
            <ViewSelector
              view={view}
              onViewChange={setView}
              teams={teams}
              selectedTeamId={selectedTeamId}
              onTeamChange={setSelectedTeamId}
              users={shiftUsers}
              selectedUserId={selectedUserId}
              onUserChange={setSelectedUserId}
            />
            {!isReadOnly && (
              <button
                type="button"
                onClick={() => setShowAvailability(true)}
                className="rounded-md bg-[var(--color-muted)] px-3 py-1.5 text-sm hover:bg-[var(--color-border)]"
              >
                {t("events:edit_availability", "Edit Availability")}
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
              availability={gridData.availability || []}
              hiddenRanges={hiddenRanges || []}
              eventTeams={eventTeams || []}
              dayFilter={selectedDay}
              onCellClick={handleCellClick}
              onShiftClick={handleShiftClick}
              onShiftMove={canEdit ? handleShiftMove : undefined}
              onShiftResize={canEdit ? handleShiftResize : undefined}
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
          eventTeams={eventTeams || []}
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
          onClose={() => setCreateDialogState(null)}
        />
      )}

      {/* Shift Detail / Delete Dialog */}
      {selectedShift && (
        <ShiftDetailDialog
          shift={selectedShift}
          eventSlug={event.slug}
          canManageShifts={canManageShifts}
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
    </div>
  );
}
