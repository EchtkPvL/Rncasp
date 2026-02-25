import { useState, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useMyAvailability, useSetMyAvailability } from "@/hooks/useAvailability";
import { useEscapeKey } from "@/hooks/useKeyboard";
import { generateTimeSlots, granularityToMinutes, formatSlotTime, formatDayHeader, isNewDay } from "@/lib/time";
import { useTimeFormat } from "@/hooks/useTimeFormat";
import type { Event, AvailabilityEntry } from "@/api/types";

type AvailabilityStatus = "available" | "preferred" | "unavailable";

interface AvailabilityEditorProps {
  event: Event;
  onClose: () => void;
}

const STATUS_COLORS: Record<AvailabilityStatus, { bg: string; border: string; cls: string }> = {
  available: { bg: "#bfdbfe", border: "#3b82f6", cls: "bg-[#bfdbfe] border-[#3b82f6]" },
  preferred: { bg: "#bbf7d0", border: "#22c55e", cls: "bg-[#bbf7d0] border-[#22c55e]" },
  unavailable: { bg: "#fecaca", border: "#ef4444", cls: "bg-[#fecaca] border-[#ef4444]" },
};

const STATUS_LABELS: Record<AvailabilityStatus, string> = {
  available: "admin:availability.available",
  preferred: "admin:availability.preferred",
  unavailable: "admin:availability.unavailable",
};

export function AvailabilityEditor({ event, onClose }: AvailabilityEditorProps) {
  const { t } = useTranslation(["admin", "common"]);
  const hour12 = useTimeFormat();
  const { data: myAvailability } = useMyAvailability(event.slug);
  const setAvailability = useSetMyAvailability();
  useEscapeKey(useCallback(() => onClose(), [onClose]));

  const granMinutes = granularityToMinutes(event.time_granularity);
  const slots = useMemo(
    () => generateTimeSlots(event.start_time, event.end_time, event.time_granularity),
    [event.start_time, event.end_time, event.time_granularity],
  );

  // Current painting tool
  const [paintStatus, setPaintStatus] = useState<AvailabilityStatus>("available");
  const [isPainting, setIsPainting] = useState(false);

  // Build local availability map: slot ISO string -> status
  const [slotMap, setSlotMap] = useState<Map<string, AvailabilityStatus>>(() => {
    const map = new Map<string, AvailabilityStatus>();
    if (myAvailability) {
      for (const entry of myAvailability) {
        // Mark all slots covered by this entry
        const start = new Date(entry.start_time).getTime();
        const end = new Date(entry.end_time).getTime();
        const slotMs = granMinutes * 60 * 1000;
        for (let t = start; t < end; t += slotMs) {
          map.set(new Date(t).toISOString(), entry.status);
        }
      }
    }
    return map;
  });

  // Re-sync when myAvailability loads
  useMemo(() => {
    if (!myAvailability) return;
    const map = new Map<string, AvailabilityStatus>();
    for (const entry of myAvailability) {
      const start = new Date(entry.start_time).getTime();
      const end = new Date(entry.end_time).getTime();
      const slotMs = granMinutes * 60 * 1000;
      for (let t = start; t < end; t += slotMs) {
        map.set(new Date(t).toISOString(), entry.status);
      }
    }
    setSlotMap(map);
  }, [myAvailability, granMinutes]);

  const toggleSlot = useCallback((slotIso: string) => {
    setSlotMap((prev) => {
      const next = new Map(prev);
      if (next.get(slotIso) === paintStatus) {
        next.delete(slotIso);
      } else {
        next.set(slotIso, paintStatus);
      }
      return next;
    });
  }, [paintStatus]);

  const paintSlot = useCallback((slotIso: string) => {
    setSlotMap((prev) => {
      const next = new Map(prev);
      next.set(slotIso, paintStatus);
      return next;
    });
  }, [paintStatus]);

  function handleMouseDown(slotIso: string) {
    setIsPainting(true);
    toggleSlot(slotIso);
  }

  function handleMouseEnter(slotIso: string) {
    if (isPainting) {
      paintSlot(slotIso);
    }
  }

  function handleMouseUp() {
    setIsPainting(false);
  }

  // Convert slot map to contiguous entries for the API
  function toEntries(): AvailabilityEntry[] {
    const entries: AvailabilityEntry[] = [];
    const sortedSlots = Array.from(slotMap.entries()).sort(
      (a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime(),
    );

    if (sortedSlots.length === 0) return entries;

    const slotDuration = granMinutes * 60 * 1000;
    let currentStart = sortedSlots[0][0];
    let currentStatus = sortedSlots[0][1];
    let currentEnd = new Date(new Date(currentStart).getTime() + slotDuration).toISOString();

    for (let i = 1; i < sortedSlots.length; i++) {
      const [slotIso, status] = sortedSlots[i];
      const slotEnd = new Date(new Date(slotIso).getTime() + slotDuration).toISOString();

      if (status === currentStatus && slotIso === currentEnd) {
        // Extend the current range
        currentEnd = slotEnd;
      } else {
        // Push current range and start a new one
        entries.push({ start_time: currentStart, end_time: currentEnd, status: currentStatus });
        currentStart = slotIso;
        currentStatus = status;
        currentEnd = slotEnd;
      }
    }
    entries.push({ start_time: currentStart, end_time: currentEnd, status: currentStatus });

    return entries;
  }

  async function handleSave() {
    const entries = toEntries();
    await setAvailability.mutateAsync({ slug: event.slug, data: { entries } });
    onClose();
  }

  function handleClearAll() {
    setSlotMap(new Map());
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50"
      onClick={onClose}
      onMouseUp={handleMouseUp}
    >
      <div
        className="w-full max-w-2xl rounded-t-lg sm:rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] p-6 shadow-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold">{t("admin:availability.title")}</h2>
        <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
          {t("admin:availability.editor_description", "Click or drag to set your availability for each time slot.")}
        </p>

        {/* Tool selector */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {(["available", "preferred", "unavailable"] as AvailabilityStatus[]).map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setPaintStatus(status)}
              className={`rounded-md border-2 px-3 py-1.5 text-xs font-medium transition-colors ${STATUS_COLORS[status].cls} ${
                paintStatus === status ? "ring-2 ring-[var(--color-primary)] ring-offset-1" : "opacity-70"
              }`}
            >
              {t(STATUS_LABELS[status])}
            </button>
          ))}
          <button
            type="button"
            onClick={handleClearAll}
            className="ml-auto rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs hover:bg-[var(--color-muted)]"
          >
            {t("admin:availability.clear_all", "Clear all")}
          </button>
        </div>

        {/* Slot grid */}
        <div
          className="mt-4 flex flex-wrap gap-y-1 select-none"
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {slots.map((slot, i) => {
            const iso = slot.toISOString();
            const status = slotMap.get(iso);
            const showDay = isNewDay(slot, i > 0 ? slots[i - 1] : null);

            return (
              <div key={iso} className="contents">
                {showDay && (
                  <div className="w-full mt-3 mb-0.5 text-xs font-semibold text-[var(--color-muted-foreground)]">
                    {formatDayHeader(slot)}
                  </div>
                )}
                <div
                  className={`w-12 h-7 border cursor-pointer text-[10px] leading-7 text-center transition-colors ${
                    status
                      ? `border-[${STATUS_COLORS[status].border}]`
                      : "border-[var(--color-border)] bg-[var(--color-background)] hover:bg-[var(--color-muted)]"
                  }`}
                  style={status ? { backgroundColor: STATUS_COLORS[status].bg, borderColor: STATUS_COLORS[status].border } : undefined}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleMouseDown(iso);
                  }}
                  onMouseEnter={() => handleMouseEnter(iso)}
                  title={`${formatSlotTime(slot, hour12)} - ${status || "unset"}`}
                >
                  {formatSlotTime(slot, hour12)}
                </div>
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="mt-4 flex flex-wrap gap-3 text-xs text-[var(--color-muted-foreground)]">
          {(["available", "preferred", "unavailable"] as AvailabilityStatus[]).map((status) => (
            <div key={status} className="flex items-center gap-1">
              <div
                className="h-3 w-3 rounded-sm border"
                style={{ backgroundColor: STATUS_COLORS[status].bg, borderColor: STATUS_COLORS[status].border }}
              />
              {t(STATUS_LABELS[status])}
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-[var(--color-border)] px-4 py-2 text-sm"
          >
            {t("common:cancel")}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={setAvailability.isPending}
            className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm text-[var(--color-primary-foreground)] disabled:opacity-50"
          >
            {t("common:save")}
          </button>
        </div>
      </div>
    </div>
  );
}
