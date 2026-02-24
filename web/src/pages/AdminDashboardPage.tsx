import { useTranslation } from "react-i18next";
import { useDashboardStats } from "@/hooks/useAdmin";
import { StatsSkeleton } from "@/components/common/Skeleton";

export function AdminDashboardPage() {
  const { t } = useTranslation(["admin", "common"]);
  const { data: stats, isLoading } = useDashboardStats();

  return (
    <div>
      <h1 className="text-2xl font-bold">{t("admin:dashboard.title", "Admin Dashboard")}</h1>

      {/* Stats Grid */}
      {isLoading ? (
        <div className="mt-6"><StatsSkeleton /></div>
      ) : stats ? (
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
      ) : null}

    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] p-4">
      <div className="text-sm text-[var(--color-muted-foreground)]">{label}</div>
      <div className="mt-1 text-3xl font-bold">{value}</div>
    </div>
  );
}

