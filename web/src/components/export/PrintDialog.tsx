import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useEscapeKey } from "@/hooks/useKeyboard";

interface PrintDialogProps {
  onClose: () => void;
}

type PaperSize = "A4" | "A3";

export function PrintDialog({ onClose }: PrintDialogProps) {
  const { t } = useTranslation(["events", "common"]);
  const [paperSize, setPaperSize] = useState<PaperSize>("A4");
  const [landscape, setLandscape] = useState(true);
  useEscapeKey(useCallback(() => onClose(), [onClose]));

  function handlePrint() {
    // Apply print class to body so CSS @page rules can use it
    document.body.dataset.printSize = paperSize;
    document.body.dataset.printOrientation = landscape ? "landscape" : "portrait";
    onClose();
    // Small delay to let the dialog close before print
    requestAnimationFrame(() => {
      window.print();
      delete document.body.dataset.printSize;
      delete document.body.dataset.printOrientation;
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-t-lg sm:rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold">{t("events:print_settings")}</h2>

        <div className="mt-4 space-y-4">
          {/* Paper Size */}
          <div>
            <label className="mb-2 block text-sm font-medium">{t("events:paper_size")}</label>
            <div className="flex gap-2">
              {(["A4", "A3"] as PaperSize[]).map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => setPaperSize(size)}
                  className={`rounded-md px-4 py-2 text-sm ${
                    paperSize === size
                      ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
                      : "bg-[var(--color-muted)] text-[var(--color-foreground)]"
                  }`}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>

          {/* Orientation */}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={landscape}
              onChange={(e) => setLandscape(e.target.checked)}
              className="rounded"
            />
            {t("events:landscape", "Landscape")}
          </label>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-[var(--color-border)] px-4 py-2 text-sm"
          >
            {t("common:cancel")}
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm text-[var(--color-primary-foreground)]"
          >
            {t("events:print")}
          </button>
        </div>
      </div>
    </div>
  );
}
