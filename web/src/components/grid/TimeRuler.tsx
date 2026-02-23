import { formatSlotTime, formatDayHeader, isNewDay } from "@/lib/time";

interface TimeRulerProps {
  slots: Date[];
  slotWidth: number;
  nameColumnWidth: number;
}

export function TimeRuler({ slots, slotWidth, nameColumnWidth }: TimeRulerProps) {
  // Group slots by day for day headers
  const dayGroups: { date: Date; startIndex: number; count: number }[] = [];
  let currentGroup: { date: Date; startIndex: number; count: number } | null = null;

  for (let i = 0; i < slots.length; i++) {
    if (isNewDay(slots[i], i > 0 ? slots[i - 1] : null)) {
      if (currentGroup) dayGroups.push(currentGroup);
      currentGroup = { date: slots[i], startIndex: i, count: 1 };
    } else {
      currentGroup!.count++;
    }
  }
  if (currentGroup) dayGroups.push(currentGroup);

  return (
    <div className="sticky top-0 z-20 bg-[var(--color-background)]">
      {/* Day headers */}
      <div className="flex border-b border-[var(--color-border)]">
        <div
          className="shrink-0 border-r border-[var(--color-border)]"
          style={{ width: nameColumnWidth }}
        />
        <div className="flex">
          {dayGroups.map((group) => (
            <div
              key={group.startIndex}
              className="border-r border-[var(--color-border)] px-2 py-1 text-xs font-semibold text-[var(--color-foreground)]"
              style={{ width: group.count * slotWidth }}
            >
              {formatDayHeader(group.date)}
            </div>
          ))}
        </div>
      </div>

      {/* Time slot headers */}
      <div className="flex border-b border-[var(--color-border)]">
        <div
          className="shrink-0 border-r border-[var(--color-border)]"
          style={{ width: nameColumnWidth }}
        />
        <div className="flex">
          {slots.map((slot, i) => {
            const showBorder = isNewDay(slot, i > 0 ? slots[i - 1] : null);
            return (
              <div
                key={i}
                className={`shrink-0 border-r border-[var(--color-border)] py-1 text-center text-[10px] text-[var(--color-muted-foreground)] ${
                  showBorder ? "border-l-2 border-l-[var(--color-foreground)]" : ""
                }`}
                style={{ width: slotWidth }}
              >
                {slot.getMinutes() === 0 ? formatSlotTime(slot) : ""}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
