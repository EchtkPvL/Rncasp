import { Link } from "react-router";
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

      {/* Quick Links */}
      <h2 className="mt-8 text-lg font-semibold">{t("admin:dashboard.quick_links", "Quick Links")}</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <QuickLink to="/admin/settings" label={t("admin:settings.title")} />
        <QuickLink to="/teams" label={t("admin:teams.title")} />
        <QuickLink to="/admin/dummy-accounts" label={t("admin:dummy.title")} />
        <QuickLink to="/admin/oauth" label={t("admin:oauth.title")} />
        <QuickLink to="/admin/smtp" label={t("admin:smtp.title")} />
        <QuickLink to="/admin/audit-log" label={t("admin:audit.title")} />
      </div>
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

function QuickLink({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="rounded-lg border border-[var(--color-border)] p-3 text-sm font-medium hover:bg-[var(--color-muted)] transition-colors"
    >
      {label}
    </Link>
  );
}
