import { useEffect, useState, useCallback, useRef } from "react";

/** Close on Escape key press */
export function useEscapeKey(onClose: () => void) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);
}

/** Returns true when the event target is an editable element (input, textarea, select, contentEditable) */
function isEditableTarget(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  return false;
}

/** Document-level listener for a single key. Skips editable targets by default. */
export function useHotkey(
  key: string,
  callback: () => void,
  options?: { enabled?: boolean },
) {
  const enabled = options?.enabled ?? true;
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    if (!enabled) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (isEditableTarget(e)) return;
      if (e.key === key) {
        e.preventDefault();
        callbackRef.current();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [key, enabled]);
}

interface GridNavigationOptions {
  onEnter?: (row: number, col: number) => void;
  enabled?: boolean;
}

/** Manages focused cell state for keyboard grid navigation */
export function useGridNavigation(
  rowCount: number,
  colCount: number,
  options?: GridNavigationOptions,
) {
  const [focusedCell, setFocusedCell] = useState<{ row: number; col: number } | null>(null);
  const enabled = options?.enabled ?? true;
  const onEnterRef = useRef(options?.onEnter);
  onEnterRef.current = options?.onEnter;

  // Clear focus when disabled (e.g. dialog opens)
  useEffect(() => {
    if (!enabled) setFocusedCell(null);
  }, [enabled]);

  const handleGridKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!enabled) return;

      switch (e.key) {
        case "ArrowUp":
        case "ArrowDown":
        case "ArrowLeft":
        case "ArrowRight": {
          e.preventDefault();
          setFocusedCell((prev) => {
            const cur = prev ?? { row: 0, col: 0 };
            let { row, col } = cur;
            if (e.key === "ArrowUp") row = Math.max(0, row - 1);
            if (e.key === "ArrowDown") row = Math.min(rowCount - 1, row + 1);
            if (e.key === "ArrowLeft") col = Math.max(0, col - 1);
            if (e.key === "ArrowRight") col = Math.min(colCount - 1, col + 1);
            return { row, col };
          });
          break;
        }
        case "Enter": {
          e.preventDefault();
          if (focusedCell && onEnterRef.current) {
            onEnterRef.current(focusedCell.row, focusedCell.col);
          }
          break;
        }
        case "Escape": {
          e.preventDefault();
          setFocusedCell(null);
          break;
        }
      }
    },
    [enabled, rowCount, colCount, focusedCell],
  );

  return { focusedCell, setFocusedCell, handleGridKeyDown };
}
