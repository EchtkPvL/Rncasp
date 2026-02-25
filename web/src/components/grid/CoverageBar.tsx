import { useMemo } from "react";
import type { Shift, CoverageRequirement } from "@/api/types";
import { isNewDay } from "@/lib/time";

/** Pre-computed per-slot coverage data for a single team */
export interface SlotCoverageData {
  count: number;
  required: number;
  hasReq: boolean;
}

/** Pre-computed coverage map: teamId -> slotIndex -> data */
export type CoverageMap = Map<string, SlotCoverageData[]>;

/**
 * Build a pre-computed coverage map for all teams at once.
 * Called once in ShiftGrid to avoid O(teams * slots * shifts) per-CoverageBar.
 */
export function buildCoverageMap(
  shifts: Shift[],
  coverage: CoverageRequirement[],
  slots: Date[],
): CoverageMap {
  if (slots.length === 0) return new Map();

  const slotDurationMs = slots.length > 1
    ? slots[1].getTime() - slots[0].getTime()
    : 60 * 60 * 1000;

  // Pre-compute slot timestamps once
  const slotTimes = slots.map((s) => s.getTime());

  // Group shifts by team and pre-parse timestamps
  const shiftsByTeam = new Map<string, { start: number; end: number }[]>();
  for (const s of shifts) {
    let list = shiftsByTeam.get(s.team_id);
    if (!list) {
      list = [];
      shiftsByTeam.set(s.team_id, list);
    }
    list.push({ start: new Date(s.start_time).getTime(), end: new Date(s.end_time).getTime() });
  }

  // Group coverage by team and pre-parse timestamps
  const covByTeam = new Map<string, { start: number; end: number; required: number }[]>();
  for (const c of coverage) {
    let list = covByTeam.get(c.team_id);
    if (!list) {
      list = [];
      covByTeam.set(c.team_id, list);
    }
    list.push({ start: new Date(c.start_time).getTime(), end: new Date(c.end_time).getTime(), required: c.required_count });
  }

  // Collect all unique team IDs
  const allTeamIds = new Set([...shiftsByTeam.keys(), ...covByTeam.keys()]);

  const result: CoverageMap = new Map();
  for (const teamId of allTeamIds) {
    const teamShifts = shiftsByTeam.get(teamId) || [];
    const teamCov = covByTeam.get(teamId) || [];

    const slotData: SlotCoverageData[] = new Array(slots.length);
    for (let i = 0; i < slots.length; i++) {
      const slotMs = slotTimes[i];
      const slotEndMs = slotMs + slotDurationMs;

      let count = 0;
      for (const s of teamShifts) {
        if (s.start < slotEndMs && s.end > slotMs) count++;
      }

      let required = 0;
      let hasReq = false;
      for (const c of teamCov) {
        if (c.start < slotEndMs && c.end > slotMs) {
          required = c.required;
          hasReq = true;
          break;
        }
      }

      slotData[i] = { count, required, hasReq };
    }
    result.set(teamId, slotData);
  }

  return result;
}

type CoverageStatus = "none" | "understaffed" | "satisfied" | "overstaffed";

interface CoverageBarProps {
  teamId: string;
  teamName: string;
  teamColor: string;
  coverageData?: SlotCoverageData[];
  slots: Date[];
  slotWidth: number;
  nameColumnWidth: number;
}

export function CoverageBar({
  teamId: _teamId,
  teamName,
  teamColor,
  coverageData,
  slots,
  slotWidth,
  nameColumnWidth,
}: CoverageBarProps) {
  const slotStatuses = useMemo(() => {
    if (!coverageData || coverageData.length === 0) return [];

    return coverageData.map((d) => {
      if (!d.hasReq) return { status: "none" as CoverageStatus, count: d.count, required: 0, hasReq: false };

      let status: CoverageStatus;
      if (d.count < d.required) status = "understaffed";
      else if (d.count === d.required) status = "satisfied";
      else status = "overstaffed";

      return { status, count: d.count, required: d.required, hasReq: true };
    });
  }, [coverageData]);

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
