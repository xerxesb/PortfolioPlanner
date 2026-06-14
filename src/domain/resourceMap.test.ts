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

  it("sets monthCells to 1 for months fully within assignment range", () => {
    const { rows } = buildResourceMapRows([squadWithMembers], [assignment], [project]);
    // 26-3-1 and 26-3-2 are in Jul (2 sprints), 26-3-3 in Aug, 26-3-4 in Sep
    // assignment covers all sprints in Jul, Aug, Sep → all 1
    expect(rows[0].monthCells).toEqual([1, 1, 1]);
  });

  it("returns fractional allocation when assignment covers only part of a month", () => {
    // 26-3-1 (Jul-PI1) and 26-3-2 (Jul-PI2) are BOTH in Jul-26 (it's a 2-sprint month)
    // An assignment covering only 26-3-1 to 26-3-1 should give 0.5 for Jul
    const halfJulAssignment: Assignment = {
      id: "a-half", projectId: "p1", squadId: "sq1",
      startKey: "26-3-1", finishKey: "26-3-1",
    };
    const { months, rows } = buildResourceMapRows(
      [squadWithMembers], [halfJulAssignment], [project],
    );
    expect(months).toHaveLength(1);
    expect(months[0].label).toBe("Jul-26");
    expect(rows[0].monthCells[0]).toBe(0.5);
  });

  it("sums to 1 across two assignments that split a month", () => {
    // Jul-26 has 2 sprints (26-3-1 and 26-3-2). Assign sq1→p1 for sprint 1, sq1→p2 for sprint 2
    const project2: Project = {
      id: "p2", name: "Project Y", effortFteYears: 1,
      targetFinishKey: "26-3-4", eligibleSquadIds: ["sq1"], milestones: [],
    };
    const a1: Assignment = { id: "a1", projectId: "p1", squadId: "sq1", startKey: "26-3-1", finishKey: "26-3-1" };
    const a2: Assignment = { id: "a2", projectId: "p2", squadId: "sq1", startKey: "26-3-2", finishKey: "26-3-2" };
    const { months, rows } = buildResourceMapRows(
      [squadWithMembers], [a1, a2], [project, project2],
    );
    expect(months).toHaveLength(1);
    expect(months[0].label).toBe("Jul-26");
    const alice_p1 = rows.find((r) => r.engineerName === "Alice" && r.projectName === "Project X")!;
    const alice_p2 = rows.find((r) => r.engineerName === "Alice" && r.projectName === "Project Y")!;
    expect(alice_p1.monthCells[0]).toBe(0.5);
    expect(alice_p2.monthCells[0]).toBe(0.5);
    expect(alice_p1.monthCells[0] + alice_p2.monthCells[0]).toBe(1);
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
