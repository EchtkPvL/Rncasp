import { useMemo } from "react";
import type { Shift, AvailabilityGridEntry } from "@/api/types";
import { ShiftBlock } from "./ShiftBlock";
import { isNewDay } from "@/lib/time";

interface GridRowProps {
  userId: string;
  userName: string;
  isDummy?: boolean;
  shifts: Shift[];
  availability?: AvailabilityGridEntry[];
  slots: Date[];
  slotWidth: number;
  slotHeight: number;
  nameColumnWidth: number;
  onCellClick?: (userId: string, slotTime: Date) => void;
  onShiftClick?: (shift: Shift) => void;
  dragEnabled?: boolean;
  onResizeDelta?: (shiftId: string, deltaPixels: number) => void;
  focusedColIndex?: number | null;
}

const AVAILABILITY_COLORS: Record<string, string> = {
  available: "var(--color-availability-available)",
  preferred: "var(--color-availability-preferred)",
  unavailable: "var(--color-availability-unavailable)",
};

export function GridRow({
  userId,
  userName,
  isDummy,
  shifts,
  availability = [],
  slots,
  slotWidth,
  slotHeight,
  nameColumnWidth,
  onCellClick,
  onShiftClick,
  dragEnabled,
  onResizeDelta,
  focusedColIndex,
}: GridRowProps) {
  // Calculate shift positions
  const shiftPositions = useMemo(() => {
    if (slots.length === 0) return [];

    const slotDurationMs = slots.length > 1
      ? slots[1].getTime() - slots[0].getTime()
      : 60 * 60 * 1000;

    return shifts
      .filter((s) => s.user_id === userId)
      .map((shift) => {
        const startMs = new Date(shift.start_time).getTime();
        const endMs = new Date(shift.end_time).getTime();

        // Find the visual position by mapping through visible slots
        let leftSlotIndex = -1;
        let rightSlotIndex = -1;

        for (let i = 0; i < slots.length; i++) {
          const slotMs = slots[i].getTime();
          const slotEndMs = slotMs + slotDurationMs;
          if (startMs < slotEndMs && leftSlotIndex === -1) {
            leftSlotIndex = i;
          }
          if (endMs > slotMs) {
            rightSlotIndex = i;
          }
        }

        if (leftSlotIndex === -1) return null;

        const left = leftSlotIndex * slotWidth;
        // Fractional positioning for shifts that don't align to slot boundaries
        const startFraction = Math.max(0, (startMs - slots[leftSlotIndex].getTime()) / slotDurationMs);
        const adjustedLeft = left + startFraction * slotWidth;

        const endFraction = rightSlotIndex >= 0
          ? Math.min(1, (endMs - slots[rightSlotIndex].getTime()) / slotDurationMs)
          : 1;
        const adjustedRight = (rightSlotIndex * slotWidth) + endFraction * slotWidth;

        const width = adjustedRight - adjustedLeft;

        return { shift, left: adjustedLeft, width };
      })
      .filter(Boolean) as { shift: Shift; left: number; width: number }[];
  }, [shifts, userId, slots, slotWidth]);

  // Pre-compute availability lookup for this user's slots
  const slotAvailability = useMemo(() => {
    if (availability.length === 0 || slots.length === 0) return {};
    const userAvail = availability.filter((a) => a.user_id === userId);
    if (userAvail.length === 0) return {};

    const slotDurationMs = slots.length > 1
      ? slots[1].getTime() - slots[0].getTime()
      : 60 * 60 * 1000;

    const result: Record<number, string> = {};
    for (let i = 0; i < slots.length; i++) {
      const slotStart = slots[i].getTime();
      const slotEnd = slotStart + slotDurationMs;
      for (const a of userAvail) {
        const aStart = new Date(a.start_time).getTime();
        const aEnd = new Date(a.end_time).getTime();
        if (aStart < slotEnd && aEnd > slotStart) {
          result[i] = a.status;
          break;
        }
      }
    }
    return result;
  }, [availability, userId, slots]);

  return (
    <div className="flex border-b border-[var(--color-border)]" style={{ height: slotHeight }}>
      {/* Sticky name column */}
      <div
        className="sticky left-0 z-10 flex shrink-0 items-center border-r border-[var(--color-border)] bg-[var(--color-background)] px-2 text-xs font-medium"
        style={{ width: nameColumnWidth }}
        title={userName}
      >
        <span className={`truncate${isDummy ? " italic text-[var(--color-muted-foreground)]" : ""}`}>{userName}</span>
      </div>

      {/* Time slot cells */}
      <div className="relative flex">
        {slots.map((slot, i) => {
          const dayBorder = isNewDay(slot, i > 0 ? slots[i - 1] : null);
          const availStatus = slotAvailability[i];
          const bgColor = availStatus ? AVAILABILITY_COLORS[availStatus] : undefined;
          return (
            <div
              key={i}
              className={`shrink-0 border-r border-[var(--color-border)] ${
                dayBorder ? "border-l-2 border-l-[var(--color-foreground)]" : ""
              } ${!bgColor && slot.getHours() % 2 === 0 ? "bg-[var(--color-muted)]/30" : ""} ${
                i === focusedColIndex ? "ring-2 ring-inset ring-[var(--color-primary)]" : ""
              }`}
              style={{ width: slotWidth, height: slotHeight, backgroundColor: bgColor }}
              onClick={() => onCellClick?.(userId, slot)}
            />
          );
        })}

        {/* Shift blocks */}
        {shiftPositions.map(({ shift, left, width }) => (
          <ShiftBlock
            key={shift.id}
            shift={shift}
            left={left}
            width={width}
            slotHeight={slotHeight}
            onClick={onShiftClick}
            dragEnabled={dragEnabled}
            onResizeDelta={onResizeDelta}
          />
        ))}
      </div>
    </div>
  );
}
