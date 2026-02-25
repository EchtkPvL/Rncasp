import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { useTimeFormat } from "@/hooks/useTimeFormat";
import type { Event } from "@/api/types";

interface EventCardProps {
  event: Event;
}

export function EventCard({ event }: EventCardProps) {
  const { t, i18n } = useTranslation("events");
  const hour12 = useTimeFormat();

  const startDate = new Date(event.start_time);
  const endDate = new Date(event.end_time);
  const dateFormatter = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: "medium",
    timeStyle: "short",
    hour12,
  });

  return (
    <Link
      to={`/events/${event.slug}`}
      className="block rounded-lg border border-[var(--color-border)] p-4 transition-colors hover:bg-[var(--color-muted)]"
    >
      <div className="flex items-start justify-between">
        <h3 className="text-lg font-semibold text-[var(--color-foreground)]">
          {event.name}
        </h3>
        <div className="flex gap-1.5">
          {event.is_locked && (
            <span className="rounded-full bg-[var(--color-warning-light)] px-2 py-0.5 text-xs text-[var(--color-warning-foreground)]">
              {t("locked")}
            </span>
          )}
          {event.is_public && (
            <span
              role="link"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                window.open(`/public/events/${event.slug}`, "_blank");
              }}
              className="cursor-pointer rounded-full bg-[var(--color-info-light)] px-2 py-0.5 text-xs text-[var(--color-info-foreground)] hover:bg-[var(--color-info-border)]"
            >
              {t("public")}
            </span>
          )}
        </div>
      </div>

      {event.description && (
        <p className="mt-1 text-sm text-[var(--color-muted-foreground)] line-clamp-2">
          {event.description}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--color-muted-foreground)]">
        <span>{dateFormatter.format(startDate)} - {dateFormatter.format(endDate)}</span>
        {event.location && <span>{event.location}</span>}
        {event.participant_count && (
          <span>{event.participant_count} participants</span>
        )}
      </div>
    </Link>
  );
}
