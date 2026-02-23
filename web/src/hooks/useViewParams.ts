import { useCallback } from "react";
import { useSearchParams } from "react-router";

export type ViewParam = "everything" | "by_team" | "my_shifts" | "per_user";

const VALID_VIEWS = new Set<string>(["everything", "by_team", "my_shifts", "per_user"]);

function parseDay(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value + "T00:00:00");
  return isNaN(d.getTime()) ? null : d;
}

function formatDay(d: Date | null): string | null {
  if (!d) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function useViewParams() {
  const [searchParams, setSearchParams] = useSearchParams();

  const rawView = searchParams.get("view");
  const view: ViewParam = rawView && VALID_VIEWS.has(rawView) ? (rawView as ViewParam) : "everything";
  const selectedTeamId = searchParams.get("team") || "";
  const selectedUserId = searchParams.get("user") || "";
  const selectedDay = parseDay(searchParams.get("day"));

  const update = useCallback(
    (updates: Record<string, string | null>) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        for (const [key, value] of Object.entries(updates)) {
          if (value === null || value === "") {
            next.delete(key);
          } else {
            next.set(key, value);
          }
        }
        return next;
      }, { replace: true });
    },
    [setSearchParams],
  );

  const setView = useCallback(
    (v: ViewParam) => {
      const updates: Record<string, string | null> = { view: v === "everything" ? null : v };
      // Clear sub-selections that don't apply to the new view
      if (v !== "by_team") updates.team = null;
      if (v !== "per_user") updates.user = null;
      update(updates);
    },
    [update],
  );

  const setSelectedTeamId = useCallback(
    (id: string) => update({ team: id || null }),
    [update],
  );

  const setSelectedUserId = useCallback(
    (id: string) => update({ user: id || null }),
    [update],
  );

  const setSelectedDay = useCallback(
    (d: Date | null) => update({ day: formatDay(d) }),
    [update],
  );

  return {
    view,
    selectedTeamId,
    selectedUserId,
    selectedDay,
    setView,
    setSelectedTeamId,
    setSelectedUserId,
    setSelectedDay,
  };
}
