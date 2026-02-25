import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n/config";
import type { Shift, CoverageRequirement, EventTeam } from "@/api/types";

interface ShiftStatsProps {
  shifts: Shift[];
  coverage: CoverageRequirement[];
  eventTeams: EventTeam[];
  eventStartTime: string;
  eventEndTime: string;
}

interface TeamInfo {
  id: string;
  name: string;
  color: string;
}

function hoursFromMs(ms: number): number {
  return Math.round((ms / (1000 * 60 * 60)) * 10) / 10;
}

function shiftDurationMs(s: Shift): number {
  return new Date(s.end_time).getTime() - new Date(s.start_time).getTime();
}

export function ShiftStats({ shifts, coverage, eventTeams, eventStartTime, eventEndTime }: ShiftStatsProps) {
  const { t } = useTranslation(["shifts"]);

  const stats = useMemo(() => {
    if (shifts.length === 0) return null;

    // Build team map
    const teamMap = new Map<string, TeamInfo>();
    for (const et of eventTeams) {
      teamMap.set(et.team_id, { id: et.team_id, name: et.team_name, color: et.team_color });
    }
    for (const s of shifts) {
      if (!teamMap.has(s.team_id)) {
        teamMap.set(s.team_id, { id: s.team_id, name: s.team_name, color: s.team_color });
      }
    }

    // Total hours
    const totalMs = shifts.reduce((sum, s) => sum + shiftDurationMs(s), 0);
    const totalHours = hoursFromMs(totalMs);

    // Total shifts
    const totalShifts = shifts.length;

    // Unique users with shifts
    const userIds = new Set(shifts.map((s) => s.user_id));
    const usersWithShifts = userIds.size;

    // Avg hours per user
    const avgHoursPerUser = usersWithShifts > 0 ? Math.round((totalHours / usersWithShifts) * 10) / 10 : 0;

    // Per-team stats
    const perTeam: {
      team: TeamInfo;
      totalHours: number;
      shiftCount: number;
      userCount: number;
      avgHoursPerUser: number;
    }[] = [];

    for (const [teamId, team] of teamMap) {
      const teamShifts = shifts.filter((s) => s.team_id === teamId);
      const teamTotalMs = teamShifts.reduce((sum, s) => sum + shiftDurationMs(s), 0);
      const teamTotalHours = hoursFromMs(teamTotalMs);
      const teamUserIds = new Set(teamShifts.map((s) => s.user_id));
      const teamUserCount = teamUserIds.size;
      perTeam.push({
        team,
        totalHours: teamTotalHours,
        shiftCount: teamShifts.length,
        userCount: teamUserCount,
        avgHoursPerUser: teamUserCount > 0 ? Math.round((teamTotalHours / teamUserCount) * 10) / 10 : 0,
      });
    }

    // Per-day stats
    const dayMap = new Map<string, { totalMs: number; shiftCount: number; userIds: Set<string> }>();
    for (const s of shifts) {
      const dayKey = new Date(s.start_time).toLocaleDateString(i18n.language, {
        weekday: "short",
        day: "numeric",
        month: "short",
      });
      if (!dayMap.has(dayKey)) {
        dayMap.set(dayKey, { totalMs: 0, shiftCount: 0, userIds: new Set() });
      }
      const day = dayMap.get(dayKey)!;
      day.totalMs += shiftDurationMs(s);
      day.shiftCount++;
      day.userIds.add(s.user_id);
    }
    const perDay = Array.from(dayMap.entries()).map(([label, d]) => ({
      label,
      totalHours: hoursFromMs(d.totalMs),
      shiftCount: d.shiftCount,
      userCount: d.userIds.size,
    }));

    // Per-user stats (top contributors)
    const userMap = new Map<string, { name: string; totalMs: number; shiftCount: number }>();
    for (const s of shifts) {
      const name = s.user_display_name || s.user_full_name || s.username;
      if (!userMap.has(s.user_id)) {
        userMap.set(s.user_id, { name, totalMs: 0, shiftCount: 0 });
      }
      const u = userMap.get(s.user_id)!;
      u.totalMs += shiftDurationMs(s);
      u.shiftCount++;
    }
    const perUser = Array.from(userMap.values())
      .map((u) => ({ ...u, totalHours: hoursFromMs(u.totalMs) }))
      .sort((a, b) => b.totalHours - a.totalHours);

    // Coverage fulfillment
    const totalRequired = coverage.reduce((sum, c) => sum + c.required_count, 0);

    // Event duration
    const eventDurationMs = new Date(eventEndTime).getTime() - new Date(eventStartTime).getTime();
    const eventDurationHours = hoursFromMs(eventDurationMs);

    return {
      totalHours,
      totalShifts,
      usersWithShifts,
      avgHoursPerUser,
      perTeam,
      perDay,
      perUser,
      totalRequired,
      eventDurationHours,
    };
  }, [shifts, coverage, eventTeams, eventStartTime, eventEndTime]);

  if (!stats) return null;

  return (
    <div className="mt-8">
      <h2 className="mb-4 text-lg font-semibold">{t("shifts:statistics", "Statistics")}</h2>

      {/* Summary cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={t("shifts:stats_total_hours", "Total Hours")}
          value={`${stats.totalHours}h`}
        />
        <StatCard
          label={t("shifts:stats_total_shifts", "Total Shifts")}
          value={String(stats.totalShifts)}
        />
        <StatCard
          label={t("shifts:stats_users", "Users with Shifts")}
          value={String(stats.usersWithShifts)}
        />
        <StatCard
          label={t("shifts:stats_avg_hours", "Avg Hours / User")}
          value={`${stats.avgHoursPerUser}h`}
        />
      </div>

      {/* Per-team breakdown */}
      {stats.perTeam.length > 0 && (
        <div className="mt-6">
          <h3 className="mb-2 text-sm font-medium text-[var(--color-muted-foreground)]">
            {t("shifts:stats_by_team", "By Team")}
          </h3>
          <div className="overflow-hidden rounded-lg border border-[var(--color-border)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-muted)]">
                  <th className="px-3 py-2 text-left font-medium">{t("shifts:stats_team", "Team")}</th>
                  <th className="px-3 py-2 text-right font-medium">{t("shifts:stats_shifts", "Shifts")}</th>
                  <th className="px-3 py-2 text-right font-medium">{t("shifts:stats_hours", "Hours")}</th>
                  <th className="px-3 py-2 text-right font-medium">{t("shifts:stats_users_col", "Users")}</th>
                  <th className="px-3 py-2 text-right font-medium">{t("shifts:stats_avg", "Avg/User")}</th>
                </tr>
              </thead>
              <tbody>
                {stats.perTeam.map((t) => (
                  <tr key={t.team.id} className="border-b border-[var(--color-border)] last:border-b-0">
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-sm"
                          style={{ backgroundColor: t.team.color }}
                        />
                        {t.team.name}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">{t.shiftCount}</td>
                    <td className="px-3 py-2 text-right">{t.totalHours}h</td>
                    <td className="px-3 py-2 text-right">{t.userCount}</td>
                    <td className="px-3 py-2 text-right">{t.avgHoursPerUser}h</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Per-day breakdown */}
      {stats.perDay.length > 1 && (
        <div className="mt-6">
          <h3 className="mb-2 text-sm font-medium text-[var(--color-muted-foreground)]">
            {t("shifts:stats_by_day", "By Day")}
          </h3>
          <div className="overflow-hidden rounded-lg border border-[var(--color-border)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-muted)]">
                  <th className="px-3 py-2 text-left font-medium">{t("shifts:stats_day", "Day")}</th>
                  <th className="px-3 py-2 text-right font-medium">{t("shifts:stats_shifts", "Shifts")}</th>
                  <th className="px-3 py-2 text-right font-medium">{t("shifts:stats_hours", "Hours")}</th>
                  <th className="px-3 py-2 text-right font-medium">{t("shifts:stats_users_col", "Users")}</th>
                </tr>
              </thead>
              <tbody>
                {stats.perDay.map((d) => (
                  <tr key={d.label} className="border-b border-[var(--color-border)] last:border-b-0">
                    <td className="px-3 py-2 font-medium">{d.label}</td>
                    <td className="px-3 py-2 text-right">{d.shiftCount}</td>
                    <td className="px-3 py-2 text-right">{d.totalHours}h</td>
                    <td className="px-3 py-2 text-right">{d.userCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Per-user breakdown */}
      {stats.perUser.length > 0 && (
        <div className="mt-6">
          <h3 className="mb-2 text-sm font-medium text-[var(--color-muted-foreground)]">
            {t("shifts:stats_by_user", "By User")}
          </h3>
          <div className="overflow-hidden rounded-lg border border-[var(--color-border)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-muted)]">
                  <th className="px-3 py-2 text-left font-medium">{t("shifts:stats_user", "User")}</th>
                  <th className="px-3 py-2 text-right font-medium">{t("shifts:stats_shifts", "Shifts")}</th>
                  <th className="px-3 py-2 text-right font-medium">{t("shifts:stats_hours", "Hours")}</th>
                </tr>
              </thead>
              <tbody>
                {stats.perUser.map((u) => (
                  <tr key={u.name} className="border-b border-[var(--color-border)] last:border-b-0">
                    <td className="px-3 py-2">{u.name}</td>
                    <td className="px-3 py-2 text-right">{u.shiftCount}</td>
                    <td className="px-3 py-2 text-right">{u.totalHours}h</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] p-3">
      <div className="text-xs text-[var(--color-muted-foreground)]">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
    </div>
  );
}
