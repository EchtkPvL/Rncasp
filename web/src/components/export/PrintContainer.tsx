import { useMemo, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { Event, Shift, CoverageRequirement, EventTeam, HiddenRange, PrintConfig } from "@/api/types";
import { PrintGridPage } from "./PrintGridPage";
import { PrintListPage } from "./PrintListPage";

interface PrintContainerProps {
  event: Event;
  shifts: Shift[];
  coverage: CoverageRequirement[];
  eventTeams: EventTeam[];
  hiddenRanges: HiddenRange[];
  config: PrintConfig | null;
  onReady?: () => void;
}

export function PrintContainer({
  event,
  shifts,
  coverage,
  eventTeams,
  hiddenRanges,
  config,
  onReady,
}: PrintContainerProps) {
  const portalRef = useRef<HTMLDivElement | null>(null);

  // Create a persistent portal container on body
  useEffect(() => {
    const el = document.createElement("div");
    el.id = "print-root";
    el.className = "print-container";
    document.body.appendChild(el);
    portalRef.current = el;
    return () => {
      document.body.removeChild(el);
      portalRef.current = null;
    };
  }, []);

  // Filter shifts that overlap any selected day (for coverage: all users)
  const dayFilteredShifts = useMemo(() => {
    if (!config) return [];
    return shifts.filter((s) => {
      const sStart = new Date(s.start_time).getTime();
      const sEnd = new Date(s.end_time).getTime();
      return config.selectedDays.some((d) => {
        const dayStart = d.getTime();
        const dayEnd = dayStart + 24 * 60 * 60 * 1000;
        return sStart < dayEnd && sEnd > dayStart;
      });
    });
  }, [shifts, config]);

  // Filter by selected teams
  const teamFilteredShifts = useMemo(() => {
    if (!config || config.selectedTeamIds === null) return dayFilteredShifts;
    const teamSet = new Set(config.selectedTeamIds);
    return dayFilteredShifts.filter((s) => teamSet.has(s.team_id));
  }, [dayFilteredShifts, config]);

  // Further filter by selected users (for grid rows display)
  const filteredShifts = useMemo(() => {
    if (!config || config.selectedUserIds === null) return teamFilteredShifts;
    const userSet = new Set(config.selectedUserIds);
    return teamFilteredShifts.filter((s) => userSet.has(s.user_id));
  }, [teamFilteredShifts, config]);

  // Filter eventTeams to only selected teams
  const filteredEventTeams = useMemo(() => {
    if (!config || config.selectedTeamIds === null) return eventTeams;
    const teamSet = new Set(config.selectedTeamIds);
    return eventTeams.filter((t) => teamSet.has(t.team_id));
  }, [eventTeams, config]);

  // Notify parent when content has rendered
  useEffect(() => {
    if (config && onReady) {
      onReady();
    }
  }, [config, onReady]);

  if (!portalRef.current) return null;

  return createPortal(
    config ? (
      config.layout === "grid" ? (
        config.selectedDays.map((day, i) => (
          <PrintGridPage
            key={day.toISOString()}
            event={event}
            shifts={filteredShifts}
            allShifts={teamFilteredShifts}
            coverage={coverage}
            eventTeams={filteredEventTeams}
            hiddenRanges={hiddenRanges}
            day={day}
            showCoverage={config.showCoverage}
            isFirstPage={i === 0}
          />
        ))
      ) : (
        <PrintListPage
          event={event}
          shifts={filteredShifts}
          selectedDays={config.selectedDays}
        />
      )
    ) : null,
    portalRef.current,
  );
}
