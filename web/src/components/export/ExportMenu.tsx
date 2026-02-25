import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ExportModal } from "./ExportModal";
import type { Event, Shift, CoverageRequirement, EventTeam, HiddenRange, PrintConfig } from "@/api/types";

interface ExportMenuProps {
  slug: string;
  event: Event;
  shifts: Shift[];
  coverage: CoverageRequirement[];
  eventTeams: EventTeam[];
  hiddenRanges?: HiddenRange[];
  selectedDay: Date | null;
  onPrint: (config: PrintConfig) => void;
  onDownloadCSV?: (slug: string) => void;
  onDownloadICal?: (slug: string) => void;
  onDownloadPDF?: (slug: string, config: PrintConfig) => void;
}

export function ExportMenu({
  slug,
  event,
  shifts,
  coverage,
  eventTeams,
  hiddenRanges,
  selectedDay,
  onPrint,
  onDownloadCSV,
  onDownloadICal,
  onDownloadPDF,
}: ExportMenuProps) {
  const { t } = useTranslation(["events"]);
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setShowModal(true)}
        className="rounded-md bg-[var(--color-muted)] px-3 py-1.5 text-sm hover:bg-[var(--color-border)]"
      >
        {t("events:export")}
      </button>

      {showModal && (
        <ExportModal
          event={event}
          shifts={shifts}
          coverage={coverage}
          eventTeams={eventTeams}
          hiddenRanges={hiddenRanges}
          selectedDay={selectedDay}
          slug={slug}
          onPrint={onPrint}
          onClose={() => setShowModal(false)}
          onDownloadCSV={onDownloadCSV}
          onDownloadICal={onDownloadICal}
          onDownloadPDF={onDownloadPDF}
        />
      )}
    </>
  );
}
