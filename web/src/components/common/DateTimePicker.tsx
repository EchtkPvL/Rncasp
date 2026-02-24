import { useState, useRef, useEffect } from "react";
import { useTimeFormat } from "@/hooks/useTimeFormat";

interface DateTimePickerProps {
  value: string; // datetime-local format: YYYY-MM-DDTHH:MM
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  granularity: "15min" | "30min" | "1hour";
  required?: boolean;
  className?: string;
}

const pad = (n: number) => n.toString().padStart(2, "0");

function formatDisplay(value: string, hour12: boolean): string {
  if (!value) return "";
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  const dateStr = d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  const timeStr = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12 });
  return `${dateStr} ${timeStr}`;
}

function getMinuteOptions(granularity: "15min" | "30min" | "1hour"): number[] {
  switch (granularity) {
    case "1hour": return [0];
    case "30min": return [0, 30];
    case "15min": return [0, 15, 30, 45];
  }
}

function parseDatetimeLocal(value: string): { date: string; hour: number; minute: number } {
  if (!value) return { date: "", hour: 0, minute: 0 };
  const [datePart, timePart] = value.split("T");
  const [h, m] = (timePart || "00:00").split(":").map(Number);
  return { date: datePart || "", hour: h, minute: m };
}

function buildDatetimeLocal(date: string, hour: number, minute: number): string {
  return `${date}T${pad(hour)}:${pad(minute)}`;
}

export function DateTimePicker({
  value,
  onChange,
  min,
  max,
  granularity,
  required,
  className,
}: DateTimePickerProps) {
  const hour12 = useTimeFormat();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const parsed = parseDatetimeLocal(value);
  const minuteOptions = getMinuteOptions(granularity);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  function handleDateChange(newDate: string) {
    onChange(buildDatetimeLocal(newDate, parsed.hour, parsed.minute));
  }

  function handleHourChange(newHour: number) {
    onChange(buildDatetimeLocal(parsed.date, newHour, parsed.minute));
  }

  function handleMinuteChange(newMinute: number) {
    onChange(buildDatetimeLocal(parsed.date, parsed.hour, newMinute));
  }

  function formatHour(h: number): string {
    if (!hour12) return pad(h);
    if (h === 0) return "12 AM";
    if (h < 12) return `${h} AM`;
    if (h === 12) return "12 PM";
    return `${h - 12} PM`;
  }

  // Compute min/max date strings for the date input
  const minDate = min ? min.split("T")[0] : undefined;
  const maxDate = max ? max.split("T")[0] : undefined;

  return (
    <div ref={containerRef} className="relative">
      {/* Display input */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-left text-sm ${className || ""}`}
      >
        {value ? formatDisplay(value, hour12) : <span className="text-[var(--color-muted-foreground)]">Select...</span>}
      </button>
      {required && <input type="hidden" value={value} required />}

      {/* Dropdown panel */}
      {open && (
        <div className="absolute left-0 z-50 mt-1 w-72 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] p-3 shadow-lg">
          {/* Date */}
          <div className="mb-3">
            <label className="mb-1 block text-xs font-medium text-[var(--color-muted-foreground)]">Date</label>
            <input
              type="date"
              value={parsed.date}
              min={minDate}
              max={maxDate}
              onChange={(e) => handleDateChange(e.target.value)}
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-2 py-1.5 text-sm"
            />
          </div>

          {/* Hour */}
          <div className="mb-3">
            <label className="mb-1 block text-xs font-medium text-[var(--color-muted-foreground)]">Hour</label>
            <div className="grid grid-cols-6 gap-1 max-h-32 overflow-y-auto">
              {Array.from({ length: 24 }, (_, i) => i).map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => handleHourChange(h)}
                  className={`rounded px-1 py-1 text-xs transition-colors ${
                    h === parsed.hour
                      ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
                      : "hover:bg-[var(--color-muted)]"
                  }`}
                >
                  {formatHour(h)}
                </button>
              ))}
            </div>
          </div>

          {/* Minute (only if not 1hour) */}
          {minuteOptions.length > 1 && (
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--color-muted-foreground)]">Minute</label>
              <div className="flex gap-1">
                {minuteOptions.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => handleMinuteChange(m)}
                    className={`flex-1 rounded px-2 py-1.5 text-sm transition-colors ${
                      m === parsed.minute
                        ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
                        : "hover:bg-[var(--color-muted)]"
                    }`}
                  >
                    :{pad(m)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
