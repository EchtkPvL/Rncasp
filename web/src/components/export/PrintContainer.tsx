import { useMemo, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { Event, Shift, CoverageRequirement, EventTeam, HiddenRange, PrintConfig } from "@/api/types";
import { getEventDays } from "@/lib/time";
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

  // Set format data attribute for CSS targeting (combines paper + orientation)
  useEffect(() => {
    if (portalRef.current && config) {
      const orientation = config.landscape ? "landscape" : "portrait";
      portalRef.current.dataset.format = `${config.paperSize}-${orientation}`;
    }
  }, [config]);

  // Derive days and range bounds from config.timeRange
  const rangeStart = useMemo(() => config ? new Date(config.timeRange.start) : null, [config]);
  const rangeEnd = useMemo(() => config ? new Date(config.timeRange.end) : null, [config]);
  const selectedDays = useMemo(() => {
    if (!config) return [];
    return getEventDays(config.timeRange.start, config.timeRange.end);
  }, [config]);

  // Filter shifts that overlap the time range (for coverage: all users)
  const dayFilteredShifts = useMemo(() => {
    if (!config || !rangeStart || !rangeEnd) return [];
    const rStart = rangeStart.getTime();
    const rEnd = rangeEnd.getTime();
    return shifts.filter((s) => {
      const sStart = new Date(s.start_time).getTime();
      const sEnd = new Date(s.end_time).getTime();
      return sStart < rEnd && sEnd > rStart;
    });
  }, [shifts, config, rangeStart, rangeEnd]);

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
        selectedDays.map((day, i) => (
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
            rangeStart={rangeStart ?? undefined}
            rangeEnd={rangeEnd ?? undefined}
          />
        ))
      ) : (
        <PrintListPage
          event={event}
          shifts={filteredShifts}
          selectedDays={selectedDays}
          onePerPage={config.onePerPage}
        />
      )
    ) : null,
    portalRef.current,
  );
}
