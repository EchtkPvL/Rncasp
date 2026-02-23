import { useMemo } from "react";
import type { Shift, CoverageRequirement } from "@/api/types";
import { isNewDay } from "@/lib/time";

interface CoverageBarProps {
  teamId: string;
  teamName: string;
  teamColor: string;
  coverage: CoverageRequirement[];
  shifts: Shift[];
  slots: Date[];
  slotWidth: number;
  nameColumnWidth: number;
}

type CoverageStatus = "none" | "understaffed" | "satisfied" | "overstaffed";

export function CoverageBar({
  teamId,
  teamName,
  teamColor,
  coverage,
  shifts,
  slots,
  slotWidth,
  nameColumnWidth,
}: CoverageBarProps) {
  const slotStatuses = useMemo(() => {
    if (slots.length === 0) return [];

    const slotDurationMs = slots.length > 1
      ? slots[1].getTime() - slots[0].getTime()
      : 60 * 60 * 1000;

    return slots.map((slot) => {
      const slotMs = slot.getTime();
      const slotEndMs = slotMs + slotDurationMs;

      // Count shifts for this team overlapping this slot
      const count = shifts.filter((s) => {
        if (s.team_id !== teamId) return false;
        const shiftStart = new Date(s.start_time).getTime();
        const shiftEnd = new Date(s.end_time).getTime();
        return shiftStart < slotEndMs && shiftEnd > slotMs;
      }).length;

      // Find coverage requirement for this slot
      const req = coverage.find((c) => {
        const covStart = new Date(c.start_time).getTime();
        const covEnd = new Date(c.end_time).getTime();
        return c.team_id === teamId && covStart < slotEndMs && covEnd > slotMs;
      });

      if (!req) return { status: "none" as CoverageStatus, count, required: 0, hasReq: false };

      const required = req.required_count;

      let status: CoverageStatus;
      if (count < required) status = "understaffed";
      else if (count === required) status = "satisfied";
      else status = "overstaffed";

      return { status, count, required, hasReq: true };
    });
  }, [teamId, coverage, shifts, slots]);

  const statusStyle = (status: CoverageStatus): React.CSSProperties => {
    switch (status) {
      case "understaffed": return { backgroundColor: "color-mix(in srgb, var(--color-destructive) 40%, transparent)" };
      case "satisfied": return { backgroundColor: "color-mix(in srgb, var(--color-success) 40%, transparent)" };
      case "overstaffed": return { backgroundColor: "color-mix(in srgb, var(--color-warning) 40%, transparent)" };
      case "none": return {};
    }
  };

  // Show cell label: "count/required" or "-" if no requirement
  const showCompact = slotWidth < 30;

  return (
    <div className="flex border-b border-[var(--color-border)]" style={{ height: 24 }}>
      <div
        className="sticky left-0 z-10 flex shrink-0 items-center border-r border-[var(--color-border)] bg-[var(--color-background)] px-2"
        style={{ width: nameColumnWidth }}
      >
        <div
          className="mr-1.5 h-2.5 w-2.5 rounded-sm"
          style={{ backgroundColor: teamColor }}
        />
        <span className="truncate text-[10px] font-medium text-[var(--color-muted-foreground)]">
          {teamName}
        </span>
      </div>
      <div className="flex">
        {slotStatuses.map((s, i) => {
          const dayBorder = isNewDay(slots[i], i > 0 ? slots[i - 1] : null);
          const label = s.hasReq
            ? (showCompact ? `${s.count}` : `${s.count}/${s.required}`)
            : (s.count > 0 ? `${s.count}` : "");
          return (
            <div
              key={i}
              className={`relative flex shrink-0 items-center justify-center border-r border-[var(--color-border)] ${
                dayBorder ? "border-l-2 border-l-[var(--color-foreground)]" : ""
              }`}
              style={{ width: slotWidth, height: 24, ...statusStyle(s.status) }}
              title={s.hasReq ? `${s.count}/${s.required}` : s.count > 0 ? `${s.count} assigned` : undefined}
            >
              {label && (
                <span
                  className="text-[9px] font-medium leading-none"
                  style={{
                    color: s.status === "understaffed" ? "var(--color-destructive)"
                      : s.status === "satisfied" ? "var(--color-success)"
                      : s.status === "overstaffed" ? "var(--color-warning-foreground)"
                      : "var(--color-muted-foreground)",
                  }}
                >
                  {label}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
