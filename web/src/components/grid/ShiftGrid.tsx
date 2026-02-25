import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragStartEvent, DragEndEvent } from "@dnd-kit/core";
import type { Event, Shift, CoverageRequirement, HiddenRange, AvailabilityGridEntry, EventTeam } from "@/api/types";
import { generateTimeSlots, granularityToMinutes, groupShiftsByUser } from "@/lib/time";
import { useIsMobile } from "@/hooks/useIsMobile";
import { TimeRuler } from "./TimeRuler";
import { GridRow } from "./GridRow";
import { CoverageBar } from "./CoverageBar";

interface ShiftGridProps {
  event: Event;
  shifts: Shift[];
  allShifts?: Shift[];
  coverage: CoverageRequirement[];
  availability?: AvailabilityGridEntry[];
  hiddenRanges?: HiddenRange[];
  eventTeams?: EventTeam[];
  dayFilter?: Date | null;
  showAvailabilityUsers?: boolean;
  onCellClick?: (userId: string, slotTime: Date) => void;
  onShiftClick?: (shift: Shift) => void;
  onShiftMove?: (shiftId: string, newStartTime: string, newEndTime: string) => void;
  onShiftResize?: (shiftId: string, newEndTime: string) => void;
  focusedCell?: { row: number; col: number } | null;
  onGridKeyDown?: (e: React.KeyboardEvent) => void;
}

const NAME_COL_WIDTH = 110;
const SLOT_HEIGHT = 32;

export function ShiftGrid({
  event,
  shifts,
  allShifts,
  coverage,
  availability = [],
  hiddenRanges = [],
  eventTeams = [],
  dayFilter,
  showAvailabilityUsers = false,
  onCellClick,
  onShiftClick,
  onShiftMove,
  onShiftResize,
  focusedCell,
  onGridKeyDown,
}: ShiftGridProps) {
  const { t } = useTranslation(["shifts"]);

  // Compute slot width based on granularity
  const granMinutes = granularityToMinutes(event.time_granularity);
  const slotWidth = granMinutes === 15 ? 16 : granMinutes === 30 ? 24 : 36;

  // Compute effective time range (restricted to selected day if filtered)
  const effectiveRange = useMemo(() => {
    if (!dayFilter) return { start: event.start_time, end: event.end_time };
    const dayStart = new Date(dayFilter);
    const dayEnd = new Date(dayFilter);
    dayEnd.setDate(dayEnd.getDate() + 1);
    // Clamp to event boundaries
    const eventStart = new Date(event.start_time);
    const eventEnd = new Date(event.end_time);
    return {
      start: (dayStart > eventStart ? dayStart : eventStart).toISOString(),
      end: (dayEnd < eventEnd ? dayEnd : eventEnd).toISOString(),
    };
  }, [dayFilter, event.start_time, event.end_time]);

  // Generate time slots
  const slots = useMemo(
    () => generateTimeSlots(effectiveRange.start, effectiveRange.end, event.time_granularity, hiddenRanges),
    [effectiveRange.start, effectiveRange.end, event.time_granularity, hiddenRanges]
  );

  // Group users from shifts, optionally including availability-only users
  const users = useMemo(() => {
    const shiftUsers = groupShiftsByUser(shifts);
    if (!showAvailabilityUsers || availability.length === 0) return shiftUsers;

    const userIds = new Set(shiftUsers.map((u) => u.id));
    const extraUsers = new Map<string, { id: string; username: string; fullName: string; displayName: string | null }>();
    for (const a of availability) {
      if (!userIds.has(a.user_id) && !extraUsers.has(a.user_id)) {
        extraUsers.set(a.user_id, {
          id: a.user_id,
          username: a.username,
          fullName: a.user_full_name,
          displayName: a.user_display_name,
        });
      }
    }
    return [...shiftUsers, ...Array.from(extraUsers.values())]
      .sort((a, b) => a.username.localeCompare(b.username));
  }, [shifts, availability, showAvailabilityUsers]);

  // Get all teams: start with event teams, supplement with shift data
  const teams = useMemo(() => {
    const teamMap = new Map<string, { id: string; name: string; color: string }>();
    // Add all event teams first
    for (const et of eventTeams) {
      teamMap.set(et.team_id, { id: et.team_id, name: et.team_name, color: et.team_color });
    }
    // Supplement from shifts (in case eventTeams isn't loaded yet)
    for (const s of shifts) {
      if (!teamMap.has(s.team_id)) {
        teamMap.set(s.team_id, { id: s.team_id, name: s.team_name, color: s.team_color });
      }
    }
    return Array.from(teamMap.values());
  }, [eventTeams, shifts]);

  // DnD state — disabled on mobile to avoid unintended changes
  const isMobile = useIsMobile();
  const [activeDrag, setActiveDrag] = useState<{ shift: Shift; width: number } | null>(null);
  const dragEnabled = !isMobile && !!(onShiftMove || onShiftResize);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  // Snap modifier for visual feedback during drag
  const snapModifier = useCallback(
    ({ transform }: { transform: { x: number; y: number; scaleX: number; scaleY: number } }) => ({
      ...transform,
      x: Math.round(transform.x / slotWidth) * slotWidth,
    }),
    [slotWidth],
  );

  function handleDragStart(event: DragStartEvent) {
    const data = event.active.data.current as { shift: Shift; width: number } | undefined;
    if (data?.shift) {
      setActiveDrag({ shift: data.shift, width: data.width });
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveDrag(null);

    if (!onShiftMove) return;
    const data = event.active.data.current as { shift: Shift } | undefined;
    if (!data?.shift) return;

    const shift = data.shift;
    const slotsDelta = Math.round(event.delta.x / slotWidth);
    if (slotsDelta === 0) return;

    const msDelta = slotsDelta * granMinutes * 60 * 1000;
    const newStart = new Date(new Date(shift.start_time).getTime() + msDelta);
    const newEnd = new Date(new Date(shift.end_time).getTime() + msDelta);

    onShiftMove(shift.id, newStart.toISOString(), newEnd.toISOString());
  }

  // Handle resize delta from ShiftBlock pointer events
  const handleResizeDelta = useCallback(
    (shiftId: string, deltaPixels: number) => {
      if (!onShiftResize) return;
      const shift = shifts.find((s) => s.id === shiftId);
      if (!shift) return;

      const slotsDelta = Math.round(deltaPixels / slotWidth);
      if (slotsDelta === 0) return;

      const msDelta = slotsDelta * granMinutes * 60 * 1000;
      const newEnd = new Date(new Date(shift.end_time).getTime() + msDelta);

      // Don't allow end time before or equal to start time
      if (newEnd.getTime() <= new Date(shift.start_time).getTime()) return;

      onShiftResize(shiftId, newEnd.toISOString());
    },
    [shifts, slotWidth, granMinutes, onShiftResize],
  );

  // Scroll focused cell into view
  const gridContainerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!focusedCell || !gridContainerRef.current) return;
    const el = gridContainerRef.current;
    const x = NAME_COL_WIDTH + focusedCell.col * slotWidth;
    const y = focusedCell.row * SLOT_HEIGHT;
    // Only scroll if the cell is outside the visible area
    const visibleLeft = el.scrollLeft + NAME_COL_WIDTH;
    const visibleRight = el.scrollLeft + el.clientWidth;
    const visibleTop = el.scrollTop;
    const visibleBottom = el.scrollTop + el.clientHeight;
    let scrollX = el.scrollLeft;
    let scrollY = el.scrollTop;
    if (x < visibleLeft) scrollX = x - NAME_COL_WIDTH;
    if (x + slotWidth > visibleRight) scrollX = x + slotWidth - el.clientWidth;
    if (y < visibleTop) scrollY = y;
    if (y + SLOT_HEIGHT > visibleBottom) scrollY = y + SLOT_HEIGHT - el.clientHeight;
    if (scrollX !== el.scrollLeft || scrollY !== el.scrollTop) {
      el.scrollTo({ left: scrollX, top: scrollY, behavior: "smooth" });
    }
  }, [focusedCell, slotWidth]);

  if (slots.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--color-border)] p-8 text-center text-[var(--color-muted-foreground)]">
        {t("shifts:no_time_slots", "No time slots to display")}
      </div>
    );
  }

  const gridContent = (
    <div style={{ minWidth: NAME_COL_WIDTH + slots.length * slotWidth }}>
      {/* Time ruler header */}
      <TimeRuler
        slots={slots}
        slotWidth={slotWidth}
        nameColumnWidth={NAME_COL_WIDTH}
      />

      {/* User rows */}
      {users.length === 0 ? (
        <div className="flex border-b border-[var(--color-border)]" style={{ height: SLOT_HEIGHT }}>
          <div
            className="flex items-center justify-center text-xs text-[var(--color-muted-foreground)]"
            style={{ width: NAME_COL_WIDTH + slots.length * slotWidth }}
          >
            {t("shifts:no_shifts", "No shifts assigned yet")}
          </div>
        </div>
      ) : (
        users.map((user, rowIndex) => (
          <GridRow
            key={user.id}
            userId={user.id}
            userName={user.displayName || user.fullName}
            isDummy={false}
            shifts={shifts}
            availability={availability}
            slots={slots}
            slotWidth={slotWidth}
            slotHeight={SLOT_HEIGHT}
            nameColumnWidth={NAME_COL_WIDTH}
            onCellClick={onCellClick}
            onShiftClick={onShiftClick}
            dragEnabled={dragEnabled}
            onResizeDelta={!isMobile && onShiftResize ? handleResizeDelta : undefined}
            focusedColIndex={focusedCell?.row === rowIndex ? focusedCell.col : null}
          />
        ))
      )}

      {/* Coverage bars (show all teams) */}
      {teams.length > 0 && (
        <div className="border-t-2 border-[var(--color-border)]">
          {teams.map((team) => (
            <CoverageBar
              key={team.id}
              teamId={team.id}
              teamName={team.name}
              teamColor={team.color}
              coverage={coverage}
              shifts={allShifts || shifts}
              slots={slots}
              slotWidth={slotWidth}
              nameColumnWidth={NAME_COL_WIDTH}
            />
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div
      ref={gridContainerRef}
      tabIndex={0}
      onKeyDown={onGridKeyDown}
      className="overflow-auto rounded-lg border border-[var(--color-border)] outline-none"
    >
      {dragEnabled ? (
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          {gridContent}
          <DragOverlay modifiers={[snapModifier]}>
            {activeDrag ? (
              <div
                className="cursor-grabbing overflow-hidden rounded-sm border border-[var(--color-text-on-color)]/30 text-[10px] font-medium leading-tight text-[var(--color-text-on-color)] shadow-lg"
                style={{
                  width: Math.max(activeDrag.width - 1, 4),
                  height: SLOT_HEIGHT - 4,
                  backgroundColor: activeDrag.shift.team_color,
                }}
              >
                <div className="truncate px-1 py-0.5">
                  {activeDrag.shift.team_abbreviation}
                </div>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      ) : (
        gridContent
      )}
    </div>
  );
}
