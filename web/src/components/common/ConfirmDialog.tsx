import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useEscapeKey } from "@/hooks/useKeyboard";

interface ConfirmDialogProps {
  open: boolean;
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  destructive,
  loading,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { t } = useTranslation(["common"]);
  useEscapeKey(useCallback(() => { if (open) onCancel(); }, [open, onCancel]));

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50" onClick={onCancel}>
      <div
        className="w-full max-w-sm rounded-t-lg sm:rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold">{title ?? t("common:confirm")}</h2>
        <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">{message}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="rounded-md border border-[var(--color-border)] px-4 py-2 text-sm hover:bg-[var(--color-muted)] disabled:opacity-50"
          >
            {cancelLabel ?? t("common:cancel")}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`rounded-md px-4 py-2 text-sm disabled:opacity-50 ${
              destructive
                ? "bg-[var(--color-destructive)] text-[var(--color-destructive-foreground)] hover:opacity-90"
                : "bg-[var(--color-primary)] text-[var(--color-primary-foreground)] hover:opacity-90"
            }`}
          >
            {confirmLabel ?? t("common:confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
