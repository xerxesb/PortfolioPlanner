import { describe, expect, it } from "vitest";
import { computeScenarioDiff } from "./scenarioDiff";
import type { ScenarioFileV1 } from "./types";

const BASE_CALENDAR = {
  financialYearStartMonth: 7 as const,
  piCountPerCalendarYear: 4 as const,
  sprintsPerPi: 4 as const,
};

function makeScenario(overrides: Partial<ScenarioFileV1> = {}): ScenarioFileV1 {
  return {
    schemaVersion: 1,
    scenario: { id: "s1", name: "Test", createdAt: "", updatedAt: "" },
    calendar: BASE_CALENDAR,
    squads: [
      {
        id: "sq1",
        name: "Squad Alpha",
        capacityFte: 2,
        members: [
          { id: 1, name: "Alice" },
          { id: 2, name: "Bob" },
        ],
      },
    ],
    projects: [
      { id: "p1", name: "Project Orion", effortFteYears: 1, targetFinishKey: "26-4-4", eligibleSquadIds: ["sq1"], milestones: [] },
    ],
    assignments: [
      { id: "a1", projectId: "p1", squadId: "sq1", startKey: "26-1-1", finishKey: "26-2-4" },
    ],
    ...overrides,
  };
}

describe("computeScenarioDiff", () => {
  it("returns all unchanged rows when scenarios are identical", () => {
    const scenario = makeScenario();
    const diff = computeScenarioDiff(scenario, scenario);
    expect(diff.summary.addedRows).toBe(0);
    expect(diff.summary.removedRows).toBe(0);
    expect(diff.summary.changedRows).toBe(0);
    expect(diff.summary.unchangedRows).toBe(2); // Alice and Bob
    expect(diff.squadGroups[0].changeCount).toBe(0);
  });

  it("marks rows as added when assignment exists only in current", () => {
    const baseline = makeScenario({ assignments: [] });
    const current = makeScenario();
    const diff = computeScenarioDiff(baseline, current);
    expect(diff.summary.addedRows).toBe(2); // Alice and Bob
    expect(diff.summary.removedRows).toBe(0);
    expect(diff.squadGroups[0].rows.every((r) => r.rowStatus === "added")).toBe(true);
  });

  it("marks rows as removed when assignment exists only in baseline", () => {
    const baseline = makeScenario();
    const current = makeScenario({ assignments: [] });
    const diff = computeScenarioDiff(baseline, current);
    expect(diff.summary.removedRows).toBe(2); // Alice and Bob
    expect(diff.summary.addedRows).toBe(0);
    expect(diff.squadGroups[0].rows.every((r) => r.rowStatus === "removed")).toBe(true);
  });

  it("marks rows as changed when assignment dates shift", () => {
    const baseline = makeScenario();
    const current = makeScenario({
      assignments: [
        { id: "a1", projectId: "p1", squadId: "sq1", startKey: "26-2-1", finishKey: "26-3-4" },
      ],
    });
    const diff = computeScenarioDiff(baseline, current);
    expect(diff.summary.changedRows).toBe(2); // Alice and Bob
    expect(diff.summary.addedRows).toBe(0);
    expect(diff.summary.removedRows).toBe(0);
  });

  it("marks cells changed where allocation differs", () => {
    const baseline = makeScenario();
    const current = makeScenario({
      assignments: [
        { id: "a1", projectId: "p1", squadId: "sq1", startKey: "26-2-1", finishKey: "26-3-4" },
      ],
    });
    const diff = computeScenarioDiff(baseline, current);
    const row = diff.squadGroups[0].rows[0]; // Alice
    const changedCells = row.cells.filter((c) => c.status === "changed");
    expect(changedCells.length).toBeGreaterThan(0);
  });

  it("month range spans union of both scenarios' assignments", () => {
    const baseline = makeScenario({
      assignments: [{ id: "a1", projectId: "p1", squadId: "sq1", startKey: "26-1-1", finishKey: "26-1-4" }],
    });
    const current = makeScenario({
      assignments: [{ id: "a2", projectId: "p1", squadId: "sq1", startKey: "26-3-1", finishKey: "26-4-4" }],
    });
    const diff = computeScenarioDiff(baseline, current);
    const labels = diff.months.map((m) => m.label);
    // should span from 26-1 period through 26-4 period
    expect(labels[0]).toMatch(/26/);
    expect(labels[labels.length - 1]).toMatch(/26/);
    expect(labels.length).toBeGreaterThan(4);
  });

  it("returns empty diff when both scenarios have no assignments", () => {
    const empty = makeScenario({ assignments: [] });
    const diff = computeScenarioDiff(empty, empty);
    expect(diff.months).toHaveLength(0);
    expect(diff.squadGroups).toHaveLength(0);
  });

  it("groups rows under correct squad", () => {
    const scenario = makeScenario();
    const diff = computeScenarioDiff(scenario, scenario);
    expect(diff.squadGroups).toHaveLength(1);
    expect(diff.squadGroups[0].squadName).toBe("Squad Alpha");
    expect(diff.squadGroups[0].rows).toHaveLength(2);
  });

  it("sorts rows by engineer name within squad", () => {
    const scenario = makeScenario();
    const diff = computeScenarioDiff(scenario, scenario);
    const names = diff.squadGroups[0].rows.map((r) => r.engineerName);
    expect(names).toEqual(["Alice", "Bob"]);
  });

  it("removed row cells show baseline value, current value is 0", () => {
    const baseline = makeScenario();
    const current = makeScenario({ assignments: [] });
    const diff = computeScenarioDiff(baseline, current);
    const row = diff.squadGroups[0].rows[0];
    for (const cell of row.cells) {
      expect(cell.currentValue).toBe(0);
    }
  });

  it("added row cells show current value, baseline value is 0", () => {
    const baseline = makeScenario({ assignments: [] });
    const current = makeScenario();
    const diff = computeScenarioDiff(baseline, current);
    const row = diff.squadGroups[0].rows[0];
    for (const cell of row.cells) {
      expect(cell.baselineValue).toBe(0);
    }
  });
});
