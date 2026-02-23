import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useDownloadCSV, useDownloadICal } from "@/hooks/useExport";
import { PrintDialog } from "./PrintDialog";

interface ExportMenuProps {
  slug: string;
}

export function ExportMenu({ slug }: ExportMenuProps) {
  const { t } = useTranslation(["events", "common"]);
  const [open, setOpen] = useState(false);
  const [showPrint, setShowPrint] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const downloadCSV = useDownloadCSV();
  const downloadICal = useDownloadICal();

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <>
      <div className="relative" ref={ref}>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="rounded-md bg-[var(--color-muted)] px-3 py-1.5 text-sm hover:bg-[var(--color-border)]"
        >
          {t("events:export")}
        </button>

        {open && (
          <div className="absolute right-0 z-20 mt-1 w-48 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] py-1 shadow-lg">
            <button
              type="button"
              onClick={() => {
                downloadCSV.mutate(slug);
                setOpen(false);
              }}
              disabled={downloadCSV.isPending}
              className="block w-full px-4 py-2 text-left text-sm hover:bg-[var(--color-muted)] disabled:opacity-50"
            >
              {t("events:export_csv")}
            </button>
            <button
              type="button"
              onClick={() => {
                downloadICal.mutate(slug);
                setOpen(false);
              }}
              disabled={downloadICal.isPending}
              className="block w-full px-4 py-2 text-left text-sm hover:bg-[var(--color-muted)] disabled:opacity-50"
            >
              {t("events:export_ical")}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowPrint(true);
                setOpen(false);
              }}
              className="block w-full px-4 py-2 text-left text-sm hover:bg-[var(--color-muted)]"
            >
              {t("events:print")}
            </button>
          </div>
        )}
      </div>

      {showPrint && <PrintDialog onClose={() => setShowPrint(false)} />}
    </>
  );
}
