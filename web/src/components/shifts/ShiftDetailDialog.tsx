import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useDeleteShift } from "@/hooks/useShifts";
import { useAuth } from "@/contexts/AuthContext";
import { useEscapeKey } from "@/hooks/useKeyboard";
import { ApiError } from "@/api/client";
import type { Shift } from "@/api/types";

interface ShiftDetailDialogProps {
  shift: Shift;
  eventSlug: string;
  canManageShifts?: boolean;
  onClose: () => void;
}

export function ShiftDetailDialog({ shift, eventSlug, canManageShifts, onClose }: ShiftDetailDialogProps) {
  const { t } = useTranslation(["shifts", "common"]);
  const { user } = useAuth();
  const deleteShift = useDeleteShift();
  useEscapeKey(useCallback(() => onClose(), [onClose]));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");

  const isOwner = user?.id === shift.user_id;
  const isSuperAdmin = user?.role === "super_admin";
  const isReadOnly = user?.role === "read_only";
  const canDelete = !isReadOnly && (isOwner || isSuperAdmin || canManageShifts);

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
