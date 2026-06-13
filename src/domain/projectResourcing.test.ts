import { describe, expect, it } from "vitest";
import {
  calculateProjectCumulativeHeatmap,
  calculateProjectMilestoneCoverageHeatmap,
  calculateProjectSprintHeatmap,
} from "./projectResourcing";
import type { ScenarioFileV1, TimeKey } from "./types";

const baseScenario: ScenarioFileV1 = {
  schemaVersion: 1,
  scenario: {
    id: "test",
    name: "Test",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
  calendar: {
    financialYearStartMonth: 7,
    piCountPerCalendarYear: 4,
    sprintsPerPi: 4,
  },
  squads: [{ id: "sq-a", name: "Squad A", capacityFte: 4 }],
  projects: [
    {
      id: "proj-x",
      name: "Project X",
      effortFteYears: 1, // 16 FTE-sprints demand
      targetFinishKey: "26-2-4",
      eligibleSquadIds: ["sq-a"],
      milestones: [],
    },
  ],
  assignments: [],
};

describe("calculateProjectCumulativeHeatmap", () => {
  it("marks all sprints unresourced when no assignments exist", () => {
    const heatmap = calculateProjectCumulativeHeatmap({
      ...baseScenario,
      assignments: [],
    });
    const keys = Object.keys(heatmap.byProject["proj-x"]);
    expect(keys.length).toBeGreaterThan(0);
    // Sprints at or before the target should be unresourced (0%, not past target)
    // Sprints after the target should be at-risk (0% but past target)
    const allZeroPercent = keys.every(
      (k) => heatmap.byProject["proj-x"][k].percent === 0,
    );
    expect(allZeroPercent).toBe(true);
    // The target key itself is not past the target, so it's unresourced
    expect(heatmap.byProject["proj-x"]["26-2-4"].status).toBe("unresourced");
    // Sprints after target are at-risk
    expect(heatmap.byProject["proj-x"]["26-3-1"].status).toBe("at-risk");
  });

  it("computes cumulative percentage correctly as assignments accumulate", () => {
    // 4 FTE × 4 sprints = 16 FTE-sprints = exactly 100% of demand (1 FTE-year)
    const heatmap = calculateProjectCumulativeHeatmap({
      ...baseScenario,
      assignments: [
        {
          id: "a1",
          projectId: "proj-x",
          squadId: "sq-a",
          startKey: "26-1-1",
          finishKey: "26-1-4",
        },
      ],
    });

    expect(heatmap.byProject["proj-x"]["26-1-1"].percent).toBeCloseTo(25);
    expect(heatmap.byProject["proj-x"]["26-1-1"].status).toBe("in-progress");
    expect(heatmap.byProject["proj-x"]["26-1-2"].percent).toBeCloseTo(50);
    expect(heatmap.byProject["proj-x"]["26-1-4"].percent).toBeCloseTo(100);
    expect(heatmap.byProject["proj-x"]["26-1-4"].status).toBe("complete");
  });

  it("marks cells as at-risk when past targetFinishKey with less than 100% coverage", () => {
    // assignment covers only 2 of 4 sprints needed → 50% at target
    const heatmap = calculateProjectCumulativeHeatmap({
      ...baseScenario,
      assignments: [
        {
          id: "a1",
          projectId: "proj-x",
          squadId: "sq-a",
          startKey: "26-2-1",
          finishKey: "26-2-2",
        },
      ],
    });

    // 26-2-4 is the targetFinishKey; cells after it should be at-risk
    expect(heatmap.byProject["proj-x"]["26-2-2"].status).toBe("in-progress");
    expect(heatmap.byProject["proj-x"]["26-2-4"].status).toBe("in-progress"); // AT target, not past
    expect(heatmap.byProject["proj-x"]["26-3-1"].status).toBe("at-risk");
    expect(heatmap.byProject["proj-x"]["26-3-4"].status).toBe("at-risk");
  });

  it("marks cells as over when cumulative exceeds 100% demand", () => {
    // 4 FTE × 6 sprints = 24 FTE-sprints → 150% of 16 demand
    const heatmap = calculateProjectCumulativeHeatmap({
      ...baseScenario,
      assignments: [
        {
          id: "a1",
          projectId: "proj-x",
          squadId: "sq-a",
          startKey: "26-1-1",
          finishKey: "26-2-2",
        },
      ],
    });

    expect(heatmap.byProject["proj-x"]["26-1-4"].status).toBe("complete"); // 16/16 = 100%
    expect(heatmap.byProject["proj-x"]["26-2-1"].status).toBe("over"); // 20/16 > 100%
    expect(heatmap.byProject["proj-x"]["26-2-2"].percent).toBeCloseTo(150);
  });
});

describe("calculateProjectSprintHeatmap", () => {
  it("marks sprints as unresourced when no assignment covers them", () => {
    const heatmap = calculateProjectSprintHeatmap({
      ...baseScenario,
      assignments: [
        {
          id: "a1",
          projectId: "proj-x",
          squadId: "sq-a",
          startKey: "26-1-1",
          finishKey: "26-1-2",
        },
      ],
    });

    expect(heatmap.byProject["proj-x"]["26-1-1"].fteSprints).toBe(4);
    expect(heatmap.byProject["proj-x"]["26-1-1"].status).toBe("resourced");
    expect(heatmap.byProject["proj-x"]["26-2-1"].fteSprints).toBe(0);
    expect(heatmap.byProject["proj-x"]["26-2-1"].status).toBe("unresourced");
  });

  it("marks sprints as over once cumulative FTE-sprints exceed demand", () => {
    // 4 FTE × 6 sprints = 24 > 16 demand
    const heatmap = calculateProjectSprintHeatmap({
      ...baseScenario,
      assignments: [
        {
          id: "a1",
          projectId: "proj-x",
          squadId: "sq-a",
          startKey: "26-1-1",
          finishKey: "26-2-2",
        },
      ],
    });

    // First 4 sprints: cumulative goes 4, 8, 12, 16 — all ≤ 16, resourced
    expect(heatmap.byProject["proj-x"]["26-1-4"].status).toBe("resourced"); // cumulative = 16
    // 5th sprint: cumulative = 20 > 16 → over
    expect(heatmap.byProject["proj-x"]["26-2-1"].status).toBe("over");
    expect(heatmap.byProject["proj-x"]["26-2-2"].status).toBe("over");
  });
});

describe("calculateProjectMilestoneCoverageHeatmap", () => {
  it("returns same result as cumulative heatmap for a project with no milestones", () => {
    const scenario = {
      ...baseScenario,
      assignments: [
        { id: "a1", projectId: "proj-x", squadId: "sq-a", startKey: "26-1-1" as TimeKey, finishKey: "26-1-4" as TimeKey },
      ],
    };
    const milestone = calculateProjectMilestoneCoverageHeatmap(scenario);
    const cumulative = calculateProjectCumulativeHeatmap(scenario);
    // With no milestones, both views use the same denominator
    expect(milestone.byProject["proj-x"]["26-1-1"].percent).toBeCloseTo(
      cumulative.byProject["proj-x"]["26-1-1"].percent,
    );
    expect(milestone.byProject["proj-x"]["26-1-4"].status).toBe(
      cumulative.byProject["proj-x"]["26-1-4"].status,
    );
  });

  it("uses milestone requiredPercent as denominator before the milestone date", () => {
    // proj-x: 1 FTE-year = 16 FTE-sprints total
    // milestone at 26-2-4 requires 50% = 8 FTE-sprints
    // assignment: sq-a (4 FTE) from 26-1-1 to 26-1-1 = 4 FTE-sprints
    // at 26-1-1: 4/8 = 50%
    const scenario: ScenarioFileV1 = {
      ...baseScenario,
      projects: [
        {
          ...baseScenario.projects[0],
          milestones: [{ id: "m1", name: "Gate 1", dateKey: "26-2-4" as TimeKey, requiredPercent: 50 }],
        },
      ],
      assignments: [
        { id: "a1", projectId: "proj-x", squadId: "sq-a", startKey: "26-1-1" as TimeKey, finishKey: "26-1-1" as TimeKey },
      ],
    };
    const heatmap = calculateProjectMilestoneCoverageHeatmap(scenario);
    expect(heatmap.byProject["proj-x"]["26-1-1"].percent).toBeCloseTo(50);
    expect(heatmap.byProject["proj-x"]["26-1-1"].status).toBe("in-progress");
  });

  it("switches denominator to next milestone after first is covered", () => {
    // proj-x: 1 FTE-year = 16 FTE-sprints total
    // milestone 1 at 26-1-4 requires 25% = 4 FTE-sprints
    // milestone 2 at 26-2-4 requires 50% = 8 FTE-sprints (cumulative from project start)
    // assignment: sq-a (4 FTE) sprints 26-1-1 to 26-1-4 = 16 FTE-sprints total
    // at 26-1-1: cumulative=4, active=m1 (dateKey=26-1-4>=26-1-1), required=4 → 100%
    // at 26-2-1: cumulative=16, active=m2 (dateKey=26-2-4>=26-2-1), required=8 → 200%
    const scenario: ScenarioFileV1 = {
      ...baseScenario,
      projects: [
        {
          ...baseScenario.projects[0],
          milestones: [
            { id: "m1", name: "Gate 1", dateKey: "26-1-4" as TimeKey, requiredPercent: 25 },
            { id: "m2", name: "Gate 2", dateKey: "26-2-4" as TimeKey, requiredPercent: 50 },
          ],
        },
      ],
      assignments: [
        { id: "a1", projectId: "proj-x", squadId: "sq-a", startKey: "26-1-1" as TimeKey, finishKey: "26-1-4" as TimeKey },
      ],
    };
    const heatmap = calculateProjectMilestoneCoverageHeatmap(scenario);
    // at 26-1-1: cumulative=4, active=m1 (dateKey=26-1-4>=26-1-1), required=4 → 100%
    expect(heatmap.byProject["proj-x"]["26-1-1"].percent).toBeCloseTo(100);
    // at 26-2-1: cumulative=16 (all sprints done), active=m2 (dateKey=26-2-4>=26-2-1), required=8 → 200%
    expect(heatmap.byProject["proj-x"]["26-2-1"].percent).toBeCloseTo(200);
    expect(heatmap.byProject["proj-x"]["26-2-1"].status).toBe("over");
  });

  it("falls back to full effort denominator after all milestones are passed", () => {
    // proj-x: 1 FTE-year = 16 FTE-sprints total
    // milestone at 26-1-4 requires 50% = 8 FTE-sprints
    // assignment: sq-a (4 FTE) 26-1-1 to 26-1-4 = 16 FTE-sprints
    // at 26-3-1: past all milestones, fallback denominator=16, cumulative=16 → 100%
    const scenario: ScenarioFileV1 = {
      ...baseScenario,
      projects: [
        {
          ...baseScenario.projects[0],
          milestones: [{ id: "m1", name: "Gate 1", dateKey: "26-1-4" as TimeKey, requiredPercent: 50 }],
        },
      ],
      assignments: [
        { id: "a1", projectId: "proj-x", squadId: "sq-a", startKey: "26-1-1" as TimeKey, finishKey: "26-1-4" as TimeKey },
      ],
    };
    const heatmap = calculateProjectMilestoneCoverageHeatmap(scenario);
    // at 26-3-1: past milestone (26-1-4), fallback to full 16 FTE-sprints denominator
    // cumulative at 26-3-1 = 16 FTE-sprints → 100%
    expect(heatmap.byProject["proj-x"]["26-3-1"].percent).toBeCloseTo(100);
    expect(heatmap.byProject["proj-x"]["26-3-1"].status).toBe("complete");
  });
});
