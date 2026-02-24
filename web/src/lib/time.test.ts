import { describe, it, expect } from "vitest";
import {
  granularityToMinutes,
  granularityToStep,
  snapToGranularity,
  generateTimeSlots,
  isNewDay,
  shiftSlotSpan,
  getSlotIndex,
  getEventDays,
  groupShiftsByUser,
} from "./time";

describe("granularityToMinutes", () => {
  it("returns 15 for 15min", () => {
    expect(granularityToMinutes("15min")).toBe(15);
  });

  it("returns 30 for 30min", () => {
    expect(granularityToMinutes("30min")).toBe(30);
  });

  it("returns 60 for 1hour", () => {
    expect(granularityToMinutes("1hour")).toBe(60);
  });
});

describe("granularityToStep", () => {
  it("returns seconds for each granularity", () => {
    expect(granularityToStep("15min")).toBe(900);
    expect(granularityToStep("30min")).toBe(1800);
    expect(granularityToStep("1hour")).toBe(3600);
  });
});

describe("snapToGranularity", () => {
  it("snaps to 30min boundaries", () => {
    expect(snapToGranularity("2025-01-15T14:20", "30min")).toBe("2025-01-15T14:30");
    expect(snapToGranularity("2025-01-15T14:10", "30min")).toBe("2025-01-15T14:00");
  });

  it("snaps to 15min boundaries", () => {
    expect(snapToGranularity("2025-01-15T14:08", "15min")).toBe("2025-01-15T14:15");
    expect(snapToGranularity("2025-01-15T14:22", "15min")).toBe("2025-01-15T14:15");
  });

  it("snaps to 1hour boundaries", () => {
    expect(snapToGranularity("2025-01-15T14:29", "1hour")).toBe("2025-01-15T14:00");
    expect(snapToGranularity("2025-01-15T14:31", "1hour")).toBe("2025-01-15T15:00");
  });

  it("returns empty string for empty input", () => {
    expect(snapToGranularity("", "30min")).toBe("");
  });
});

describe("generateTimeSlots", () => {
  it("generates correct number of slots", () => {
    const slots = generateTimeSlots(
      "2025-01-15T10:00:00Z",
      "2025-01-15T12:00:00Z",
      "30min"
    );
    expect(slots).toHaveLength(4); // 10:00, 10:30, 11:00, 11:30
  });

  it("generates hourly slots", () => {
    const slots = generateTimeSlots(
      "2025-01-15T10:00:00Z",
      "2025-01-15T13:00:00Z",
      "1hour"
    );
    expect(slots).toHaveLength(3); // 10:00, 11:00, 12:00
  });

  it("filters hidden ranges", () => {
    const slots = generateTimeSlots(
      "2025-01-15T00:00:00",
      "2025-01-15T06:00:00",
      "1hour",
      [{ id: "1", event_id: "e1", hide_start_hour: 2, hide_end_hour: 4 }]
    );
    // 0:00, 1:00, 4:00, 5:00 (2:00 and 3:00 hidden)
    expect(slots).toHaveLength(4);
  });
});

describe("isNewDay", () => {
  it("returns true for first slot", () => {
    expect(isNewDay(new Date("2025-01-15T10:00:00"), null)).toBe(true);
  });

  it("returns false for same day", () => {
    const prev = new Date("2025-01-15T10:00:00");
    const curr = new Date("2025-01-15T11:00:00");
    expect(isNewDay(curr, prev)).toBe(false);
  });

  it("returns true for different day", () => {
    const prev = new Date("2025-01-15T23:00:00");
    const curr = new Date("2025-01-16T00:00:00");
    expect(isNewDay(curr, prev)).toBe(true);
  });
});

describe("shiftSlotSpan", () => {
  it("calculates span for a shift exactly covering slots", () => {
    const slot = new Date("2025-01-15T10:00:00");
    const result = shiftSlotSpan(
      "2025-01-15T10:00:00",
      "2025-01-15T12:00:00",
      slot,
      30
    );
    expect(result.startOffset).toBe(0);
    expect(result.span).toBe(4); // 2 hours / 30min = 4 slots
  });

  it("calculates offset when shift starts after slot", () => {
    const slot = new Date("2025-01-15T10:00:00");
    const result = shiftSlotSpan(
      "2025-01-15T10:30:00",
      "2025-01-15T11:30:00",
      slot,
      30
    );
    expect(result.startOffset).toBe(1);
    expect(result.span).toBe(2);
  });
});

describe("getSlotIndex", () => {
  it("finds correct slot index", () => {
    const slots = [
      new Date("2025-01-15T10:00:00"),
      new Date("2025-01-15T10:30:00"),
      new Date("2025-01-15T11:00:00"),
    ];
    expect(getSlotIndex("2025-01-15T10:30:00", slots)).toBe(1);
  });

  it("returns last index for time past all slots", () => {
    const slots = [
      new Date("2025-01-15T10:00:00"),
      new Date("2025-01-15T10:30:00"),
    ];
    expect(getSlotIndex("2025-01-15T12:00:00", slots)).toBe(1);
  });
});

describe("getEventDays", () => {
  it("returns correct days for multi-day event", () => {
    const days = getEventDays("2025-01-15T10:00:00", "2025-01-17T18:00:00");
    expect(days).toHaveLength(3);
    expect(days[0].getDate()).toBe(15);
    expect(days[1].getDate()).toBe(16);
    expect(days[2].getDate()).toBe(17);
  });

  it("returns one day for single-day event", () => {
    const days = getEventDays("2025-01-15T10:00:00", "2025-01-15T18:00:00");
    expect(days).toHaveLength(1);
  });
});

describe("groupShiftsByUser", () => {
  it("groups shifts by user and deduplicates", () => {
    const shifts = [
      { user_id: "u1", username: "alice", user_full_name: "Alice", user_display_name: null },
      { user_id: "u2", username: "bob", user_full_name: "Bob", user_display_name: "Bobby" },
      { user_id: "u1", username: "alice", user_full_name: "Alice", user_display_name: null },
    ];
    const users = groupShiftsByUser(shifts);
    expect(users).toHaveLength(2);
    expect(users[0].username).toBe("alice");
    expect(users[1].username).toBe("bob");
    expect(users[1].displayName).toBe("Bobby");
  });

  it("returns empty array for no shifts", () => {
    expect(groupShiftsByUser([])).toHaveLength(0);
  });
});
