import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { formatDayHeader, formatSlotTime } from "@/lib/time";
import type { Shift } from "@/api/types";

interface UserShiftListProps {
  shifts: Shift[];
  userName: string;
}

export function UserShiftList({ shifts, userName }: UserShiftListProps) {
  const { t } = useTranslation(["shifts"]);

  // Group shifts by day
  const shiftsByDay = useMemo(() => {
    const groups = new Map<string, Shift[]>();
    const sorted = [...shifts].sort(
      (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime(),
    );
    for (const shift of sorted) {
      const dayKey = new Date(shift.start_time).toDateString();
      const list = groups.get(dayKey) ?? [];
      list.push(shift);
      groups.set(dayKey, list);
    }
    return Array.from(groups.entries());
  }, [shifts]);

  if (shifts.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--color-border)] p-8 text-center text-[var(--color-muted-foreground)]">
        {t("shifts:no_shifts")}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="text-sm font-medium text-[var(--color-muted-foreground)]">
        {userName} — {shifts.length} {t("shifts:title").toLowerCase()}
      </div>

      {shiftsByDay.map(([dayKey, dayShifts]) => (
        <div key={dayKey} className="rounded-lg border border-[var(--color-border)]">
          <div className="border-b border-[var(--color-border)] bg-[var(--color-muted)] px-4 py-2 text-sm font-medium">
            {formatDayHeader(new Date(dayKey))}
          </div>
          <div className="divide-y divide-[var(--color-border)]">
            {dayShifts.map((shift) => {
              const start = new Date(shift.start_time);
              const end = new Date(shift.end_time);
              const crossesMidnight = start.toDateString() !== end.toDateString();
              return (
                <div key={shift.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div
                    className="h-3 w-3 shrink-0 rounded"
                    style={{ backgroundColor: shift.team_color }}
                  />
                  <span className="text-sm font-medium">
                    {formatSlotTime(start)}–{formatSlotTime(end)}
                    {crossesMidnight && (
                      <span className="ml-1 text-xs font-normal text-[var(--color-muted-foreground)]">
                        ({formatDayHeader(end)})
                      </span>
                    )}
                  </span>
                  <span className="rounded-full px-2 py-0.5 text-xs" style={{
                    backgroundColor: shift.team_color + "20",
                    color: shift.team_color,
                  }}>
                    {shift.team_name}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
