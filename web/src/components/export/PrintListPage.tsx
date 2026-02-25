import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { Event, Shift } from "@/api/types";
import { formatSlotTime, formatDayHeader, groupShiftsByUser } from "@/lib/time";
import { useTimeFormat } from "@/hooks/useTimeFormat";

interface PrintListPageProps {
  event: Event;
  shifts: Shift[];
  selectedDays: Date[];
  showTeamColors: boolean;
}

export function PrintListPage({ event, shifts, selectedDays, showTeamColors }: PrintListPageProps) {
  const { t } = useTranslation(["events"]);
  const hour12 = useTimeFormat();

  // Filter shifts that overlap any selected day
  const filteredShifts = useMemo(() => {
    return shifts.filter((s) => {
      const sStart = new Date(s.start_time).getTime();
      const sEnd = new Date(s.end_time).getTime();
      return selectedDays.some((d) => {
        const dayStart = d.getTime();
        const dayEnd = dayStart + 24 * 60 * 60 * 1000;
        return sStart < dayEnd && sEnd > dayStart;
      });
    });
  }, [shifts, selectedDays]);

  // Group by user
  const users = useMemo(() => groupShiftsByUser(filteredShifts), [filteredShifts]);

  // Group shifts by user then by day.
  // A cross-midnight shift appears under each selected day it overlaps.
  const userGroups = useMemo(() => {
    const sortedDays = [...selectedDays].sort((a, b) => a.getTime() - b.getTime());

    return users.map((user) => {
      const userShifts = filteredShifts
        .filter((s) => s.user_id === user.id)
        .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

      // For each selected day, collect shifts overlapping that day
      const days: { date: Date; shifts: Shift[] }[] = [];
      for (const day of sortedDays) {
        const dayStartMs = day.getTime();
        const dayEndMs = dayStartMs + 24 * 60 * 60 * 1000;
        const overlapping = userShifts.filter((s) => {
          const sStart = new Date(s.start_time).getTime();
          const sEnd = new Date(s.end_time).getTime();
          return sStart < dayEndMs && sEnd > dayStartMs;
        });
        if (overlapping.length > 0) {
          days.push({ date: day, shifts: overlapping });
        }
      }

      return { user, days };
    });
  }, [users, filteredShifts, selectedDays]);

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
          {t("events:printed_at")} {formatSlotTime(now, hour12)}
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
              {dayShifts.map((shift) => {
                const start = new Date(shift.start_time);
                const end = new Date(shift.end_time);
                const crossesMidnight = start.toDateString() !== end.toDateString();
                return (
                  <div key={shift.id} className="print-list-shift">
                    {showTeamColors && (
                      <span
                        className="print-team-dot"
                        style={{ backgroundColor: shift.team_color }}
                      />
                    )}
                    <span>
                      {formatSlotTime(start, hour12)}–{formatSlotTime(end, hour12)}
                      {crossesMidnight && ` (${formatDayHeader(end)})`}
                    </span>
                    <span>
                      {shift.team_name} ({shift.team_abbreviation})
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
