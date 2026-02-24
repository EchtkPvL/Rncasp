import { useState, useMemo } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import { useEvents } from "@/hooks/useEvents";
import { useTimeFormat } from "@/hooks/useTimeFormat";
import { EventCard } from "@/components/events/EventCard";
import { CreateEventDialog } from "@/components/events/CreateEventDialog";
import { CardSkeleton } from "@/components/common/Skeleton";

export function EventsPage() {
  const { t } = useTranslation(["events", "common"]);
  const { user } = useAuth();
  const { data: events, isLoading } = useEvents();
  const hour12 = useTimeFormat();
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  const now = useMemo(() => new Date(), []);

  const activeEvents = useMemo(
    () => events?.filter((e) => new Date(e.end_time) > now) ?? [],
    [events, now],
  );

  const pastEvents = useMemo(
    () =>
      events
        ?.filter((e) => new Date(e.end_time) <= now)
        .sort(
          (a, b) =>
            new Date(b.end_time).getTime() - new Date(a.end_time).getTime(),
        ) ?? [],
    [events, now],
  );

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
        hour12,
      }),
    [hour12],
  );

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("events:title")}</h1>
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
          {isLoading ? (
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

      {/* Past events */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold">{t("events:past_events")}</h2>
        <div className="mt-3">
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="h-12 animate-pulse rounded-lg bg-[var(--color-muted)]"
                />
              ))}
            </div>
          ) : !pastEvents.length ? (
            <p className="text-[var(--color-muted-foreground)]">
              {t("events:no_past_events")}
            </p>
          ) : (
            <div className="space-y-2">
              {pastEvents.map((event) => (
                <Link
                  key={event.id}
                  to={`/events/${event.slug}`}
                  className="flex items-center justify-between rounded-lg border border-[var(--color-border)] p-3 transition-colors hover:bg-[var(--color-muted)]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{event.name}</div>
                    <div className="text-xs text-[var(--color-muted-foreground)]">
                      {dateFormatter.format(new Date(event.start_time))} -{" "}
                      {dateFormatter.format(new Date(event.end_time))}
                    </div>
                  </div>
                  {event.location && (
                    <span className="ml-4 text-xs text-[var(--color-muted-foreground)]">
                      {event.location}
                    </span>
                  )}
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
