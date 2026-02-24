import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useEscapeKey } from "@/hooks/useKeyboard";

interface KeyboardShortcutHelpProps {
  open: boolean;
  onClose: () => void;
}

export function KeyboardShortcutHelp({ open, onClose }: KeyboardShortcutHelpProps) {
  const { t } = useTranslation(["common"]);
  useEscapeKey(useCallback(() => { if (open) onClose(); }, [open, onClose]));

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-t-lg sm:rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold">{t("common:keyboard.title")}</h2>

        {/* Global */}
        <h3 className="mt-4 text-xs font-medium uppercase tracking-wide text-[var(--color-muted-foreground)]">
          {t("common:keyboard.global")}
        </h3>
        <dl className="mt-2 space-y-2">
          <ShortcutRow keys={["?"]} description={t("common:keyboard.show_help")} />
          <ShortcutRow keys={["Esc"]} description={t("common:keyboard.close_dialog")} />
        </dl>

        {/* Grid */}
        <h3 className="mt-4 text-xs font-medium uppercase tracking-wide text-[var(--color-muted-foreground)]">
          {t("common:keyboard.grid")}
        </h3>
        <dl className="mt-2 space-y-2">
          <ShortcutRow keys={["\u2190", "\u2191", "\u2192", "\u2193"]} description={t("common:keyboard.navigate_cells")} />
          <ShortcutRow keys={["Enter"]} description={t("common:keyboard.create_shift_at_cell")} />
        </dl>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-[var(--color-border)] px-4 py-2 text-sm hover:bg-[var(--color-muted)]"
          >
            {t("common:cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}

function ShortcutRow({ keys, description }: { keys: string[]; description: string }) {
  return (
    <div className="flex items-center justify-between">
      <dd className="text-sm">{description}</dd>
      <dt className="flex gap-1">
        {keys.map((k) => (
          <kbd
            key={k}
            className="inline-flex min-w-[1.5rem] items-center justify-center rounded border border-[var(--color-border)] bg-[var(--color-muted)] px-1.5 py-0.5 text-xs font-mono"
          >
            {k}
          </kbd>
        ))}
      </dt>
    </div>
  );
}
