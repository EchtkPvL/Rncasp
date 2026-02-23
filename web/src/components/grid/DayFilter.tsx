import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { getEventDays, formatDayHeader } from "@/lib/time";

interface DayFilterProps {
  eventStartTime: string;
  eventEndTime: string;
  selectedDay: Date | null;
  onDayChange: (day: Date | null) => void;
}

export function DayFilter({
  eventStartTime,
  eventEndTime,
  selectedDay,
  onDayChange,
}: DayFilterProps) {
  const { t } = useTranslation(["shifts"]);

  const days = useMemo(
    () => getEventDays(eventStartTime, eventEndTime),
    [eventStartTime, eventEndTime],
  );

  // Don't show filter for single-day events
  if (days.length <= 1) return null;

  const isSelected = (day: Date) =>
    selectedDay !== null && day.toDateString() === selectedDay.toDateString();

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => onDayChange(null)}
        className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
          selectedDay === null
            ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
            : "bg-[var(--color-muted)] text-[var(--color-muted-foreground)] hover:bg-[var(--color-border)]"
        }`}
      >
        {t("shifts:all_days", "All days")}
      </button>
      {days.map((day) => (
        <button
          key={day.toISOString()}
          type="button"
          onClick={() => onDayChange(day)}
          className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
            isSelected(day)
              ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
              : "bg-[var(--color-muted)] text-[var(--color-muted-foreground)] hover:bg-[var(--color-border)]"
          }`}
        >
          {formatDayHeader(day)}
        </button>
      ))}
    </div>
  );
}
