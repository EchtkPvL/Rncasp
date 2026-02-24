import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useDeleteShift, useUpdateShift } from "@/hooks/useShifts";
import { useTeams } from "@/hooks/useTeams";
import { useAuth } from "@/contexts/AuthContext";
import { useEscapeKey } from "@/hooks/useKeyboard";
import { ApiError } from "@/api/client";
import { granularityToStep, snapToGranularity } from "@/lib/time";
import type { Shift } from "@/api/types";

interface ShiftDetailDialogProps {
  shift: Shift;
  eventSlug: string;
  canManageShifts?: boolean;
  timeGranularity?: "15min" | "30min" | "1hour";
  onClose: () => void;
}

function toLocalDatetime(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function ShiftDetailDialog({ shift, eventSlug, canManageShifts, timeGranularity, onClose }: ShiftDetailDialogProps) {
  const { t } = useTranslation(["shifts", "common"]);
  const { user } = useAuth();
  const deleteShift = useDeleteShift();
  const updateShift = useUpdateShift();
  const { data: teams } = useTeams();
  useEscapeKey(useCallback(() => onClose(), [onClose]));

  const step = timeGranularity ? granularityToStep(timeGranularity) : undefined;
  const snap = (v: string) => timeGranularity ? snapToGranularity(v, timeGranularity) : v;

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");

  // Edit form state
  const [editTeamId, setEditTeamId] = useState(shift.team_id);
  const [editStartTime, setEditStartTime] = useState(snap(toLocalDatetime(new Date(shift.start_time))));
  const [editEndTime, setEditEndTime] = useState(snap(toLocalDatetime(new Date(shift.end_time))));

  const isOwner = user?.id === shift.user_id;
  const isSuperAdmin = user?.role === "super_admin";
  const isReadOnly = user?.role === "read_only";
  const canEdit = !isReadOnly && (isOwner || isSuperAdmin || canManageShifts);
  const canDelete = canEdit;

  const startDate = new Date(shift.start_time);
  const endDate = new Date(shift.end_time);
  const dateFormatter = new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  async function handleDelete() {
    setError("");
    try {
      await deleteShift.mutateAsync({ slug: eventSlug, shiftId: shift.id });
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError(t("common:error"));
      }
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const data: Record<string, string> = {};
      if (editTeamId !== shift.team_id) data.team_id = editTeamId;
      const newStart = new Date(editStartTime).toISOString();
      const newEnd = new Date(editEndTime).toISOString();
      if (newStart !== shift.start_time) data.start_time = newStart;
      if (newEnd !== shift.end_time) data.end_time = newEnd;

      if (Object.keys(data).length === 0) {
        setEditing(false);
        return;
      }

      await updateShift.mutateAsync({ slug: eventSlug, shiftId: shift.id, data });
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError(t("common:error"));
      }
    }
  }

  // Edit mode
  if (editing) {
    return (
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50" onClick={onClose}>
        <div
          className="w-full max-w-md rounded-t-lg sm:rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] p-6 shadow-lg max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[var(--color-border)] sm:hidden" />
          <h2 className="text-lg font-bold">{t("shifts:edit")}</h2>

          {error && (
            <div className="mt-3 rounded-md border border-[var(--color-destructive-border)] bg-[var(--color-destructive-light)] px-4 py-2 text-sm text-[var(--color-destructive)]">
              {error}
            </div>
          )}

          <form onSubmit={handleSave} className="mt-4 space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium">{t("shifts:team")}</label>
              <select
                value={editTeamId}
                onChange={(e) => setEditTeamId(e.target.value)}
                required
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
              >
                {teams?.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name} ({team.abbreviation})
                  </option>
                ))}
              </select>
            </div>

            <div className="text-sm text-[var(--color-muted-foreground)]">
              {t("common:user", "User")}: <span className="font-medium text-[var(--color-foreground)]">{shift.user_display_name || shift.user_full_name}</span>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium">{t("shifts:start_time")}</label>
                <input
                  type="datetime-local"
                  value={editStartTime}
                  step={step}
                  onChange={(e) => setEditStartTime(snap(e.target.value))}
                  required
                  className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">{t("shifts:end_time")}</label>
                <input
                  type="datetime-local"
                  value={editEndTime}
                  step={step}
                  onChange={(e) => setEditEndTime(snap(e.target.value))}
                  required
                  className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => { setEditing(false); setError(""); }}
                className="rounded-md border border-[var(--color-border)] px-4 py-2 text-sm"
              >
                {t("common:cancel")}
              </button>
              <button
                type="submit"
                disabled={updateShift.isPending}
                className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm text-[var(--color-primary-foreground)] disabled:opacity-50"
              >
                {t("common:save")}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // View mode
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-t-lg sm:rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] p-6 shadow-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile drag handle */}
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[var(--color-border)] sm:hidden" />
        <div className="flex items-center gap-3">
          <div
            className="h-4 w-4 rounded-full"
            style={{ backgroundColor: shift.team_color }}
          />
          <h2 className="text-lg font-bold">{shift.team_name}</h2>
        </div>

        {error && (
          <div className="mt-3 rounded-md border border-[var(--color-destructive-border)] bg-[var(--color-destructive-light)] px-4 py-2 text-sm text-[var(--color-destructive)]">
            {error}
          </div>
        )}

        <div className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-[var(--color-muted-foreground)]">{t("common:user", "User")}</span>
            <span className="font-medium">{shift.user_display_name || shift.user_full_name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--color-muted-foreground)]">{t("shifts:start_time")}</span>
            <span className="font-medium">{dateFormatter.format(startDate)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--color-muted-foreground)]">{t("shifts:end_time")}</span>
            <span className="font-medium">{dateFormatter.format(endDate)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--color-muted-foreground)]">{t("shifts:team")}</span>
            <span className="font-medium">{shift.team_abbreviation}</span>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          {canDelete && !confirmDelete && (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="rounded-md bg-[var(--color-destructive)] px-4 py-2 text-sm text-[var(--color-destructive-foreground)] hover:opacity-90"
            >
              {t("shifts:delete")}
            </button>
          )}

          {confirmDelete && (
            <div className="flex w-full flex-col gap-2">
              <p className="text-sm text-[var(--color-destructive)]">{t("shifts:delete_confirm")}</p>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="rounded-md border border-[var(--color-border)] px-4 py-2 text-sm"
                >
                  {t("common:cancel")}
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleteShift.isPending}
                  className="rounded-md bg-[var(--color-destructive)] px-4 py-2 text-sm text-[var(--color-destructive-foreground)] hover:opacity-90 disabled:opacity-50"
                >
                  {t("common:confirm", "Confirm")}
                </button>
              </div>
            </div>
          )}

          {!confirmDelete && canEdit && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm text-[var(--color-primary-foreground)]"
            >
              {t("common:edit")}
            </button>
          )}

          {!confirmDelete && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-[var(--color-border)] px-4 py-2 text-sm"
            >
              {t("common:close", "Close")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
