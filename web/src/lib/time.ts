import type { HiddenRange } from "@/api/types";

/** Convert granularity string to minutes */
export function granularityToMinutes(granularity: "15min" | "30min" | "1hour"): number {
  switch (granularity) {
    case "15min": return 15;
    case "30min": return 30;
    case "1hour": return 60;
  }
}

/** Step value (in seconds) for datetime-local inputs */
export function granularityToStep(granularity: "15min" | "30min" | "1hour"): number {
  return granularityToMinutes(granularity) * 60;
}

/** Snap a datetime-local value string to the nearest granularity boundary */
export function snapToGranularity(value: string, granularity: "15min" | "30min" | "1hour"): string {
  if (!value) return value;
  const minutes = granularityToMinutes(granularity);
  const date = new Date(value);
  const m = date.getMinutes();
  const snapped = Math.round(m / minutes) * minutes;
  date.setMinutes(snapped, 0, 0);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Generate time slots between start and end at the given granularity */
export function generateTimeSlots(
  startTime: string,
  endTime: string,
  granularity: "15min" | "30min" | "1hour",
  hiddenRanges: HiddenRange[] = []
): Date[] {
  const start = new Date(startTime);
  const end = new Date(endTime);
  const minutes = granularityToMinutes(granularity);
  const slots: Date[] = [];

  const current = new Date(start);
  while (current < end) {
    const hour = current.getHours();
    const isHidden = hiddenRanges.some(
      (r) => hour >= r.hide_start_hour && hour < r.hide_end_hour
    );
    if (!isHidden) {
      slots.push(new Date(current));
    }
    current.setMinutes(current.getMinutes() + minutes);
  }

  return slots;
}

/** Check if a slot is at the start of a new day */
export function isNewDay(slot: Date, prevSlot: Date | null): boolean {
  if (!prevSlot) return true;
  return slot.toDateString() !== prevSlot.toDateString();
}

/** Format a time slot for display (e.g., "14:00" or "2:00 PM") */
export function formatSlotTime(date: Date, hour12 = false): string {
  return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12 });
}

/** Format a date header (e.g., "Mon 15 Jan") */
export function formatDayHeader(date: Date): string {
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

/** Calculate how many slots a shift spans */
export function shiftSlotSpan(
  shiftStart: string,
  shiftEnd: string,
  slotStart: Date,
  granularityMinutes: number
): { startOffset: number; span: number } {
  const shiftStartMs = new Date(shiftStart).getTime();
  const shiftEndMs = new Date(shiftEnd).getTime();
  const slotMs = slotStart.getTime();
  const slotDuration = granularityMinutes * 60 * 1000;

  const startOffset = Math.max(0, (shiftStartMs - slotMs) / slotDuration);
  const endOffset = (shiftEndMs - slotMs) / slotDuration;
  const span = endOffset - startOffset;

  return { startOffset, span };
}

/** Get the slot index for a given time */
export function getSlotIndex(time: string, slots: Date[]): number {
  const timeMs = new Date(time).getTime();
  for (let i = 0; i < slots.length; i++) {
    if (slots[i].getTime() >= timeMs) return Math.max(0, i);
  }
  return slots.length - 1;
}

/** Get the distinct calendar days spanned by an event */
export function getEventDays(startTime: string, endTime: string): Date[] {
  const start = new Date(startTime);
  const end = new Date(endTime);
  const days: Date[] = [];

  const current = new Date(start);
  current.setHours(0, 0, 0, 0);

  while (current < end) {
    days.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }

  return days;
}

/** Group shifts by user */
export function groupShiftsByUser(shifts: { user_id: string; username: string; user_full_name: string; user_display_name: string | null }[]) {
  const users = new Map<string, { id: string; username: string; fullName: string; displayName: string | null }>();
  for (const shift of shifts) {
    if (!users.has(shift.user_id)) {
      users.set(shift.user_id, {
        id: shift.user_id,
        username: shift.username,
        fullName: shift.user_full_name,
        displayName: shift.user_display_name,
      });
    }
  }
  return Array.from(users.values()).sort((a, b) => a.username.localeCompare(b.username));
}
