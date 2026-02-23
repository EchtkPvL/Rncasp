import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import { useEvents } from "@/hooks/useEvents";
import { EventCard } from "@/components/events/EventCard";
import { CreateEventDialog } from "@/components/events/CreateEventDialog";
import { CardSkeleton } from "@/components/common/Skeleton";

export function DashboardPage() {
  const { t } = useTranslation(["common", "events"]);
  const { user } = useAuth();
  const { data: events, isLoading } = useEvents();
  const [showCreateDialog, setShowCreateDialog] = useState(false);

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

      <div className="mt-6">
        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        ) : !events?.length ? (
          <p className="text-[var(--color-muted-foreground)]">{t("events:no_events")}</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {events.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        )}
      </div>

      {showCreateDialog && (
        <CreateEventDialog onClose={() => setShowCreateDialog(false)} />
      )}
    </div>
  );
}
