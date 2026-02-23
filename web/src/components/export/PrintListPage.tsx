import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { Event, Shift } from "@/api/types";
import { formatSlotTime, formatDayHeader, groupShiftsByUser } from "@/lib/time";

interface PrintListPageProps {
  event: Event;
  shifts: Shift[];
  selectedDays: Date[];
  showTeamColors: boolean;
}

export function PrintListPage({ event, shifts, selectedDays, showTeamColors }: PrintListPageProps) {
  const { t } = useTranslation(["events"]);

  // Filter shifts to selected days
  const filteredShifts = useMemo(() => {
    return shifts.filter((s) => {
      const shiftDate = new Date(s.start_time);
      return selectedDays.some((d) => d.toDateString() === shiftDate.toDateString());
    });
  }, [shifts, selectedDays]);

  // Group by user
  const users = useMemo(() => groupShiftsByUser(filteredShifts), [filteredShifts]);

  // Group shifts by user then by day
  const userGroups = useMemo(() => {
    return users.map((user) => {
      const userShifts = filteredShifts
        .filter((s) => s.user_id === user.id)
        .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

      // Group by day
      const dayMap = new Map<string, Shift[]>();
      for (const shift of userShifts) {
        const dayKey = new Date(shift.start_time).toDateString();
        if (!dayMap.has(dayKey)) dayMap.set(dayKey, []);
        dayMap.get(dayKey)!.push(shift);
      }

      const days = Array.from(dayMap.entries())
        .sort(([a], [b]) => new Date(a).getTime() - new Date(b).getTime())
        .map(([, dayShifts]) => ({
          date: new Date(dayShifts[0].start_time),
          shifts: dayShifts,
        }));

      return { user, days };
    });
  }, [users, filteredShifts]);

  const now = new Date();

  // Date range label
  const dateRange = selectedDays.length > 0
    ? `${formatDayHeader(selectedDays[0])} – ${formatDayHeader(selectedDays[selectedDays.length - 1])}`
    : "";

  return (
    <div>
      {/* Page header */}
      <div className="print-page-header">
        <span className="print-event-name">{event.name}</span>
        <span>{dateRange}</span>
        <span>
          {t("events:printed_at")} {formatSlotTime(now)}
        </span>
      </div>

      {/* User blocks */}
      {userGroups.map(({ user, days }) => (
        <div key={user.id} className="print-list-user">
          <div className="print-list-user-name">
            {user.displayName || user.fullName}
          </div>
          {days.map(({ date, shifts: dayShifts }) => (
            <div key={date.toISOString()}>
              <div className="print-list-day-header">{formatDayHeader(date)}</div>
              {dayShifts.map((shift) => (
                <div key={shift.id} className="print-list-shift">
                  {showTeamColors && (
                    <span
                      className="print-team-dot"
                      style={{ backgroundColor: shift.team_color }}
                    />
                  )}
                  <span>
                    {formatSlotTime(new Date(shift.start_time))}–{formatSlotTime(new Date(shift.end_time))}
                  </span>
                  <span>
                    {shift.team_name} ({shift.team_abbreviation})
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
