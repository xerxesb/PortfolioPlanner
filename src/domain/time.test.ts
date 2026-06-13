import { describe, expect, it } from "vitest";
import {
  compareTimeKeys,
  formatTimeKey,
  getFiscalYearLabel,
  parseTimeKey,
  sprintDurationInclusive,
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
