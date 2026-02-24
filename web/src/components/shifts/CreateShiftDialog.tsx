import { useState, useCallback, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useCreateShift } from "@/hooks/useShifts";
import { useTeams } from "@/hooks/useTeams";
import { useSearchUsers } from "@/hooks/useUsers";
import { useAuth } from "@/contexts/AuthContext";
import { useEscapeKey } from "@/hooks/useKeyboard";
import { ApiError } from "@/api/client";
import type { Event } from "@/api/types";
import { granularityToMinutes, granularityToStep, snapToGranularity } from "@/lib/time";

interface CreateShiftDialogProps {
  event: Event;
  initialTime?: Date;
  targetUserId?: string;
  canSelectUser?: boolean;
  visibleTeamIds?: Set<string>;
  onClose: () => void;
}

function toLocalDatetime(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function CreateShiftDialog({ event, initialTime, targetUserId, canSelectUser, visibleTeamIds, onClose }: CreateShiftDialogProps) {
  const { t } = useTranslation(["shifts", "common"]);
  const { user } = useAuth();
  const createShift = useCreateShift();
  const { data: teams } = useTeams();
  useEscapeKey(useCallback(() => onClose(), [onClose]));

  const granMinutes = granularityToMinutes(event.time_granularity);
  const step = granularityToStep(event.time_granularity);
  const defaultStart = initialTime || new Date(event.start_time);
  const defaultEnd = new Date(defaultStart.getTime() + granMinutes * 60 * 1000);
  const eventMin = toLocalDatetime(new Date(event.start_time));
  const eventMax = toLocalDatetime(new Date(event.end_time));

  const snap = (v: string) => snapToGranularity(v, event.time_granularity);

  const [teamId, setTeamId] = useState("");
  const [startTime, setStartTime] = useState(snap(toLocalDatetime(defaultStart)));
  const [endTime, setEndTime] = useState(snap(toLocalDatetime(defaultEnd)));
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);

  // User selector state (for admins)
  const [selectedUserId, setSelectedUserId] = useState(targetUserId || user?.id || "");
  const [selectedUserLabel, setSelectedUserLabel] = useState("");
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const { data: searchResults } = useSearchUsers(userSearchQuery);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowUserDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setWarnings([]);

    if (!user) return;
    if (!teamId) {
      setError(t("shifts:team") + " is required");
      return;
    }

    const userId = canSelectUser ? selectedUserId : user.id;
    if (!userId) {
      setError(t("shifts:assign_to") + " is required");
      return;
    }

    try {
      const res = await createShift.mutateAsync({
        slug: event.slug,
        data: {
          team_id: teamId,
          user_id: userId,
          start_time: new Date(startTime).toISOString(),
          end_time: new Date(endTime).toISOString(),
        },
      });
      if (res.data?.warnings && res.data.warnings.length > 0) {
        setWarnings(res.data.warnings);
        // Still close after a brief delay so user sees the shift was created
        setTimeout(onClose, 1500);
      } else {
        onClose();
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.field ? `${err.field}: ${err.message}` : err.message);
      } else {
        setError(t("common:error"));
      }
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-t-lg sm:rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] p-6 shadow-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile drag handle */}
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[var(--color-border)] sm:hidden" />
        <h2 className="text-lg font-bold">{t("shifts:create")}</h2>

        {error && (
          <div className="mt-3 rounded-md border border-[var(--color-destructive-border)] bg-[var(--color-destructive-light)] px-4 py-2 text-sm text-[var(--color-destructive)]">
            {error}
          </div>
        )}

        {warnings.length > 0 && (
          <div className="mt-3 rounded-md border border-[var(--color-warning-border)] bg-[var(--color-warning-light)] px-4 py-2 text-sm text-[var(--color-warning-foreground)]">
            {warnings.map((w, i) => (
              <div key={i}>{w}</div>
            ))}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">{t("shifts:team")}</label>
            <select
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
              required
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
            >
              <option value="">{t("common:select", "Select...")}</option>
              {teams?.filter((team) => !visibleTeamIds || visibleTeamIds.has(team.id)).map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name} ({team.abbreviation})
                </option>
              ))}
            </select>
          </div>

          {canSelectUser && (
            <div ref={dropdownRef} className="relative">
              <label className="mb-1 block text-sm font-medium">{t("shifts:assign_to")}</label>
              <input
                type="text"
                value={showUserDropdown ? userSearchQuery : selectedUserLabel || userSearchQuery}
                onChange={(e) => {
                  setUserSearchQuery(e.target.value);
                  setShowUserDropdown(true);
                }}
                onFocus={() => setShowUserDropdown(true)}
                placeholder={t("shifts:search_user")}
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
              />
              {showUserDropdown && searchResults && searchResults.length > 0 && (
                <ul className="absolute z-10 mt-1 max-h-40 w-full overflow-y-auto rounded-md border border-[var(--color-border)] bg-[var(--color-background)] shadow-lg">
                  {searchResults.map((u) => (
                    <li key={u.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedUserId(u.id);
                          setSelectedUserLabel(u.display_name || u.full_name);
                          setUserSearchQuery(u.display_name || u.full_name);
                          setShowUserDropdown(false);
                        }}
                        className="w-full px-3 py-2 text-left text-sm hover:bg-[var(--color-muted)]"
                      >
                        <span className="font-medium">{u.display_name || u.full_name}</span>
                        <span className="ml-2 text-[var(--color-muted-foreground)]">@{u.username}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">{t("shifts:start_time")}</label>
              <input
                type="datetime-local"
                value={startTime}
                min={eventMin}
                max={eventMax}
                step={step}
                onChange={(e) => setStartTime(snap(e.target.value))}
                required
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">{t("shifts:end_time")}</label>
              <input
                type="datetime-local"
                value={endTime}
                min={eventMin}
                max={eventMax}
                step={step}
                onChange={(e) => setEndTime(snap(e.target.value))}
                required
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
              />
            </div>
          </div>

          {event.is_locked && (
            <p className="text-sm text-[var(--color-warning-foreground)]">{t("shifts:event_locked")}</p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-[var(--color-border)] px-4 py-2 text-sm"
            >
              {t("common:cancel")}
            </button>
            <button
              type="submit"
              disabled={createShift.isPending}
              className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm text-[var(--color-primary-foreground)] disabled:opacity-50"
            >
              {t("shifts:create")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
