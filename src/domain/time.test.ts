import { describe, expect, it } from "vitest";
import {
  compareTimeKeys,
  formatTimeKey,
  getFiscalYearLabel,
  parseTimeKey,
  sprintDurationInclusive,
  sprintToCalendarMonthIndex,
  timelineBetween,
  toSprintIndex,
} from "./time";

describe("time keys", () => {
  it("parses and formats YY-PI-SPRINT keys", () => {
    expect(parseTimeKey("26-4-3")).toEqual({ year: 26, pi: 4, sprint: 3 });
    expect(formatTimeKey({ year: 26, pi: 4, sprint: 3 })).toBe("26-4-3");
  });

  it("rejects invalid PI and sprint values", () => {
    expect(() => parseTimeKey("26-5-1")).toThrow(/Invalid time key/);
    expect(() => parseTimeKey("26-4-5")).toThrow(/Invalid time key/);
    expect(() => parseTimeKey("2026-4-3")).toThrow(/Invalid time key/);
  });

  it("orders sprint addresses across calendar years", () => {
    expect(toSprintIndex("26-4-4")).toBeLessThan(toSprintIndex("27-1-1"));
    expect(compareTimeKeys("26-4-4", "27-1-1")).toBe(-1);
    expect(compareTimeKeys("27-1-1", "27-1-1")).toBe(0);
  });

  it("calculates inclusive assignment duration", () => {
    expect(sprintDurationInclusive("26-1-1", "26-1-1")).toBe(1);
    expect(sprintDurationInclusive("26-1-1", "26-1-4")).toBe(4);
    expect(sprintDurationInclusive("26-4-3", "27-1-2")).toBe(4);
  });

  it("generates timeline cells between two keys", () => {
    expect(timelineBetween("26-4-3", "27-1-2")).toEqual([
      "26-4-3",
      "26-4-4",
      "27-1-1",
      "27-1-2",
    ]);
  });

  it("labels financial years for July-start resource planning", () => {
    expect(getFiscalYearLabel("26-2-4", 7)).toBe("FY25/26");
    expect(getFiscalYearLabel("26-3-1", 7)).toBe("FY26/27");
  });
});

describe("sprintToCalendarMonthIndex", () => {
  it("maps PI 1 sprint 1 to January of that year (index 312 for year 26)", () => {
    expect(sprintToCalendarMonthIndex("26-1-1")).toBe(312);
  });

  it("maps PI 1 sprint 2 to the same month as sprint 1 (Jan)", () => {
    expect(sprintToCalendarMonthIndex("26-1-2")).toBe(312);
  });

  it("maps PI 1 sprint 3 to Feb (index 313)", () => {
    expect(sprintToCalendarMonthIndex("26-1-3")).toBe(313);
  });

  it("maps PI 1 sprint 4 to Mar (index 314)", () => {
    expect(sprintToCalendarMonthIndex("26-1-4")).toBe(314);
  });

  it("maps PI 3 sprint 1 to Jul (index 318)", () => {
    expect(sprintToCalendarMonthIndex("26-3-1")).toBe(318);
  });

  it("maps PI 3 sprint 4 to Sep (index 320)", () => {
    expect(sprintToCalendarMonthIndex("26-3-4")).toBe(320);
  });

  it("maps PI 4 sprint 4 to Dec (index 323)", () => {
    expect(sprintToCalendarMonthIndex("26-4-4")).toBe(323);
  });

  it("increments correctly at year boundary (26-4-4 → 27-1-1)", () => {
    expect(sprintToCalendarMonthIndex("27-1-1")).toBe(324);
    expect(sprintToCalendarMonthIndex("27-1-1")).toBeGreaterThan(
      sprintToCalendarMonthIndex("26-4-4"),
    );
  });
});
