import { useState, useMemo } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import { useEvents } from "@/hooks/useEvents";
import { useMyShifts } from "@/hooks/useShifts";
import { useTimeFormat } from "@/hooks/useTimeFormat";
import { EventCard } from "@/components/events/EventCard";
import { CreateEventDialog } from "@/components/events/CreateEventDialog";
import { CardSkeleton } from "@/components/common/Skeleton";

export function DashboardPage() {
  const { t, i18n } = useTranslation(["common", "events"]);
  const { user } = useAuth();
  const { data: events, isLoading: eventsLoading } = useEvents();
  const { data: allShifts, isLoading: shiftsLoading } = useMyShifts();
  const hour12 = useTimeFormat();
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  const now = useMemo(() => new Date(), []);

  const activeEvents = useMemo(
    () => events?.filter((e) => new Date(e.end_time) > now) ?? [],
    [events, now],
  );

  const upcomingShifts = useMemo(
    () =>
      allShifts
        ?.filter((s) => new Date(s.start_time) > now)
        .sort(
          (a, b) =>
            new Date(a.start_time).getTime() - new Date(b.start_time).getTime(),
        ) ?? [],
    [allShifts, now],
  );

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language, {
        dateStyle: "medium",
        timeStyle: "short",
        hour12,
      }),
    [hour12, i18n.language],
  );

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("common:nav.dashboard")}</h1>
          {user && (
            <p className="mt-1 text-[var(--color-muted-foreground)]">
              Welcome, {user.full_name}
            </p>
          )}
        </div>
        {user?.role === "super_admin" && (
          <button
            onClick={() => setShowCreateDialog(true)}
            className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm text-[var(--color-primary-foreground)]"
          >
            {t("events:create")}
          </button>
        )}
      </div>

      {/* Active events */}
      <div className="mt-6">
        <h2 className="text-lg font-semibold">{t("events:active_events")}</h2>
        <div className="mt-3">
          {eventsLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <CardSkeleton key={i} />
              ))}
            </div>
          ) : !activeEvents.length ? (
            <p className="text-[var(--color-muted-foreground)]">
              {t("events:no_events")}
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {activeEvents.map((event) => (
                <EventCard key={event.id} event={event} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Upcoming shifts */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold">
          {t("common:nav.upcoming_shifts")}
        </h2>
        <div className="mt-3">
          {shiftsLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="h-12 animate-pulse rounded-lg bg-[var(--color-muted)]"
                />
              ))}
            </div>
          ) : !upcomingShifts.length ? (
            <p className="text-[var(--color-muted-foreground)]">
              {t("common:nav.no_upcoming_shifts")}
            </p>
          ) : (
            <div className="space-y-2">
              {upcomingShifts.map((shift) => (
                <Link
                  key={shift.id}
                  to={`/events/${shift.event_slug}`}
                  className="flex items-center gap-3 rounded-lg border border-[var(--color-border)] p-3 transition-colors hover:bg-[var(--color-muted)]"
                >
                  <span
                    className="inline-flex h-7 w-7 items-center justify-center rounded text-xs font-bold text-white"
                    style={{ backgroundColor: shift.team_color }}
                  >
                    {shift.team_abbreviation}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">
                      {shift.event_name}
                    </div>
                    <div className="text-xs text-[var(--color-muted-foreground)]">
                      {dateFormatter.format(new Date(shift.start_time))} -{" "}
                      {dateFormatter.format(new Date(shift.end_time))}
                    </div>
                  </div>
                  <span className="text-xs text-[var(--color-muted-foreground)]">
                    {shift.team_name}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {showCreateDialog && (
        <CreateEventDialog onClose={() => setShowCreateDialog(false)} />
      )}
    </div>
  );
}
