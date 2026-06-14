import { describe, expect, it } from "vitest";
import { buildResourceMapRows } from "./resourceMap";
import type { Assignment, Project, Squad } from "./types";

const squadWithMembers: Squad = {
  id: "sq1",
  name: "Alpha",
  capacityFte: 2,
  members: [
    { id: 1, name: "Alice" },
    { id: 2, name: "Bob" },
  ],
};

const project: Project = {
  id: "p1",
  name: "Project X",
  effortFteYears: 1,
  targetFinishKey: "26-3-4",
  eligibleSquadIds: ["sq1"],
  milestones: [],
};

// 26-3-1 → Jul-26, 26-3-4 → Sep-26 (3 months)
const assignment: Assignment = {
  id: "a1",
  projectId: "p1",
  squadId: "sq1",
  startKey: "26-3-1",
  finishKey: "26-3-4",
};

describe("buildResourceMapRows", () => {
  it("returns empty months and rows when no assignments", () => {
    const { months, rows } = buildResourceMapRows([], [], []);
    expect(months).toHaveLength(0);
    expect(rows).toHaveLength(0);
  });

  it("emits one row per member per assignment", () => {
    const { rows } = buildResourceMapRows([squadWithMembers], [assignment], [project]);
    expect(rows).toHaveLength(2);
    expect(rows[0].engineerName).toBe("Alice");
    expect(rows[1].engineerName).toBe("Bob");
  });

  it("produces correct month labels spanning the assignment range", () => {
    const { months } = buildResourceMapRows([squadWithMembers], [assignment], [project]);
    expect(months).toHaveLength(3);
    expect(months[0].label).toBe("Jul-26");
    expect(months[1].label).toBe("Aug-26");
    expect(months[2].label).toBe("Sep-26");
  });

  it("sets monthCells true for months within assignment range", () => {
    const { rows } = buildResourceMapRows([squadWithMembers], [assignment], [project]);
    expect(rows[0].monthCells).toEqual([true, true, true]);
  });

  it("sets monthCells false for months outside the assignment range", () => {
    // Jan-only assignment alongside a Sep-only one → 9 month range with gaps
    const earlyAssignment: Assignment = {
      id: "a2", projectId: "p1", squadId: "sq1",
      startKey: "26-1-1", finishKey: "26-1-2",  // both → Jan
    };
    const lateAssignment: Assignment = {
      id: "a3", projectId: "p1", squadId: "sq1",
      startKey: "26-3-4", finishKey: "26-3-4",  // Sep
    };
    const { months } = buildResourceMapRows(
      [squadWithMembers],
      [earlyAssignment, lateAssignment],
      [project],
    );
    // Jan (312) to Sep (320) = 9 months
    expect(months).toHaveLength(9);
    expect(months[0].label).toBe("Jan-26");
    expect(months[8].label).toBe("Sep-26");
  });

  it("skips squads without a members array", () => {
    const squadNoMembers: Squad = { id: "sq2", name: "Empty", capacityFte: 3 };
    const a: Assignment = { id: "a4", projectId: "p1", squadId: "sq2", startKey: "26-3-1", finishKey: "26-3-4" };
    const { rows } = buildResourceMapRows([squadNoMembers], [a], [project]);
    expect(rows).toHaveLength(0);
  });

  it("skips squads with an empty members array", () => {
    const emptySquad: Squad = { id: "sq3", name: "Ghost", capacityFte: 0, members: [] };
    const a: Assignment = { id: "a5", projectId: "p1", squadId: "sq3", startKey: "26-3-1", finishKey: "26-3-4" };
    const { rows } = buildResourceMapRows([emptySquad], [a], [project]);
    expect(rows).toHaveLength(0);
  });

  it("sorts rows by engineerId ascending", () => {
    const squad: Squad = {
      id: "sq1", name: "Alpha", capacityFte: 2,
      members: [{ id: 10, name: "Zara" }, { id: 3, name: "Aaron" }],
    };
    const { rows } = buildResourceMapRows([squad], [assignment], [project]);
    expect(rows[0].engineerId).toBe(3);
    expect(rows[1].engineerId).toBe(10);
  });

  it("populates squadName and projectName correctly", () => {
    const { rows } = buildResourceMapRows([squadWithMembers], [assignment], [project]);
    expect(rows[0].squadName).toBe("Alpha");
    expect(rows[0].projectName).toBe("Project X");
  });
});
