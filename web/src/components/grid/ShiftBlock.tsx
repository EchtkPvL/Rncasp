import { useRef, useState, useCallback } from "react";
import { useDraggable } from "@dnd-kit/core";
import type { Shift } from "@/api/types";

interface ShiftBlockProps {
  shift: Shift;
  left: number;
  width: number;
  slotHeight: number;
  onClick?: (shift: Shift) => void;
  dragEnabled?: boolean;
  onResizeDelta?: (shiftId: string, deltaPixels: number) => void;
}

export function ShiftBlock({
  shift,
  left,
  width,
  slotHeight,
  onClick,
  dragEnabled,
  onResizeDelta,
}: ShiftBlockProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: shift.id,
    data: { shift, width },
    disabled: !dragEnabled,
  });

  const [resizeDelta, setResizeDelta] = useState(0);
  const resizingRef = useRef(false);

  const handleResizeStart = useCallback(
    (e: React.PointerEvent) => {
      if (!onResizeDelta) return;
      e.stopPropagation();
      e.preventDefault();
      resizingRef.current = true;
      const startX = e.clientX;

      const onPointerMove = (ev: PointerEvent) => {
        setResizeDelta(ev.clientX - startX);
      };

      const onPointerUp = (ev: PointerEvent) => {
        const delta = ev.clientX - startX;
        setResizeDelta(0);
        if (Math.abs(delta) > 2) {
          onResizeDelta(shift.id, delta);
        }
        requestAnimationFrame(() => {
          resizingRef.current = false;
        });
        document.removeEventListener("pointermove", onPointerMove);
        document.removeEventListener("pointerup", onPointerUp);
      };

      document.addEventListener("pointermove", onPointerMove);
      document.addEventListener("pointerup", onPointerUp);
    },
    [shift.id, onResizeDelta],
  );

  const actualWidth = Math.max(width + resizeDelta - 1, 4);

  return (
    <div
      ref={setNodeRef}
      className={`absolute overflow-hidden rounded-sm border border-[var(--color-text-on-color)]/30 text-[10px] font-medium leading-tight text-[var(--color-text-on-color)] ${
        isDragging ? "opacity-30" : "hover:opacity-90"
      } ${dragEnabled ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"}`}
      style={{
        left,
        width: actualWidth,
        height: slotHeight - 4,
        top: 2,
        backgroundColor: shift.team_color,
      }}
      title={`${shift.user_display_name || shift.user_full_name || shift.username} - ${shift.team_name}`}
      onClick={() => {
        if (!isDragging && !resizingRef.current) onClick?.(shift);
      }}
      {...listeners}
      {...attributes}
    >
      <div className="truncate px-1 py-0.5">{shift.team_abbreviation}</div>
      {onResizeDelta && (
        <div
          className="absolute right-0 top-0 h-full w-1.5 cursor-ew-resize hover:bg-[var(--color-text-on-color)]/40"
          onPointerDown={handleResizeStart}
        />
      )}
    </div>
  );
}
