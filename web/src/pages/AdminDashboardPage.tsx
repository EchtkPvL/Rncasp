import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useDashboardStats, useRunCleanup } from "@/hooks/useAdmin";
import { StatsSkeleton } from "@/components/common/Skeleton";
import type { CleanupResult } from "@/api/admin";

export function AdminDashboardPage() {
  const { t } = useTranslation(["admin", "common"]);
  const { data: stats, isLoading } = useDashboardStats();
  const runCleanup = useRunCleanup();
  const [cleanupResult, setCleanupResult] = useState<CleanupResult | null>(null);

  function handlePurge() {
    runCleanup.mutate(undefined, {
      onSuccess: (res) => {
        if (res.data) {
          setCleanupResult(res.data);
        }
      },
    });
  }

  return (
    <div>
      <h1 className="text-2xl font-bold">{t("admin:dashboard.title", "Admin Dashboard")}</h1>

      {/* Stats Grid */}
      {isLoading ? (
        <div className="mt-6"><StatsSkeleton /></div>
      ) : stats ? (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard
              label={t("admin:dashboard.total_users", "Total Users")}
              value={stats.total_users}
            />
            <StatCard
              label={t("admin:dashboard.total_events", "Total Events")}
              value={stats.total_events}
            />
            <StatCard
              label={t("admin:dashboard.active_events", "Active Events")}
              value={stats.active_events}
            />
            <StatCard
              label={t("admin:dashboard.total_shifts", "Total Shifts")}
              value={stats.total_shifts}
            />
            <StatCard
              label={t("admin:dashboard.total_teams", "Total Teams")}
              value={stats.total_teams}
            />
          </div>

          {/* Storage Section */}
          <h2 className="mt-8 text-lg font-semibold">{t("admin:dashboard.storage")}</h2>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard
              label={t("admin:dashboard.total_sessions")}
              value={stats.total_sessions}
              badge={stats.expired_sessions > 0 ? `${stats.expired_sessions} ${t("admin:dashboard.expired_sessions")}` : undefined}
            />
            <StatCard
              label={t("admin:dashboard.audit_entries")}
              value={stats.total_audit_entries}
            />
            <StatCard
              label={t("admin:dashboard.notifications_total")}
              value={stats.total_notifications}
              badge={stats.read_notifications > 0 ? `${stats.read_notifications} ${t("admin:dashboard.notifications_read")}` : undefined}
            />
          </div>

          <div className="mt-4 flex items-center gap-4">
            <button
              onClick={handlePurge}
              disabled={runCleanup.isPending}
              className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm text-[var(--color-primary-foreground)] disabled:opacity-50"
            >
              {runCleanup.isPending ? t("common:loading") : t("admin:dashboard.purge_now")}
            </button>
            {cleanupResult && (
              <span className="text-sm text-[var(--color-muted-foreground)]">
                {t("admin:dashboard.purge_result", {
                  sessions: cleanupResult.expired_sessions,
                  audit: cleanupResult.old_audit_entries,
                  notifications: cleanupResult.old_notifications,
                  recovery: cleanupResult.used_recovery_codes,
                })}
              </span>
            )}
          </div>
        </>
      ) : null}

    </div>
  );
}

function StatCard({ label, value, badge }: { label: string; value: number; badge?: string }) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] p-4">
      <div className="text-sm text-[var(--color-muted-foreground)]">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-3xl font-bold">{value}</span>
        {badge && (
          <span className="rounded-full bg-[var(--color-warning)] px-2 py-0.5 text-xs font-medium text-[var(--color-warning-foreground)]">
            {badge}
          </span>
        )}
      </div>
    </div>
  );
}

