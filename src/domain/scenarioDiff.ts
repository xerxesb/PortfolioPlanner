import { buildMonthRange, fractionOfMonth, type CalendarMonth } from "./resourceMap";
import { toSprintIndex } from "./time";
import type { ScenarioFileV1 } from "./types";

export type DiffCellStatus = "unchanged" | "changed" | "added" | "removed";
export type DiffRowStatus = "unchanged" | "changed" | "added" | "removed";

export interface DiffCell {
  baselineValue: number;
  currentValue: number;
  status: DiffCellStatus;
}

export interface DiffRow {
  engineerId: number;
  engineerName: string;
  squadId: string;
  squadName: string;
  projectName: string;
  projectAlias?: string;
  cells: DiffCell[];
  rowStatus: DiffRowStatus;
}

export interface SquadDiffGroup {
  squadId: string;
  squadName: string;
  rows: DiffRow[];
  changeCount: number;
}

export interface ScenarioDiff {
  months: CalendarMonth[];
  squadGroups: SquadDiffGroup[];
  summary: {
    addedRows: number;
    removedRows: number;
    changedRows: number;
    unchangedRows: number;
  };
}

interface SourceRow {
  assignmentId: string;
  engineerId: number;
  engineerName: string;
  squadId: string;
  squadName: string;
  projectName: string;
  projectAlias?: string;
  cells: number[];
}

function buildSourceRows(
  scenario: ScenarioFileV1,
  months: CalendarMonth[],
): SourceRow[] {
  const squadMap = new Map(scenario.squads.map((s) => [s.id, s]));
  const projectMap = new Map(scenario.projects.map((p) => [p.id, p]));
  const rows: SourceRow[] = [];

  for (const assignment of scenario.assignments) {
    const squad = squadMap.get(assignment.squadId);
    if (!squad?.members?.length) continue;
    const project = projectMap.get(assignment.projectId);
    if (!project) continue;

    const aStart = toSprintIndex(assignment.startKey);
    const aEnd = toSprintIndex(assignment.finishKey);

    for (const member of squad.members) {
      const cells = months.map((m) => {
        const monthIdx = m.year * 12 + m.month - 1;
        return fractionOfMonth(monthIdx, aStart, aEnd);
      });
      rows.push({
        assignmentId: assignment.id,
        engineerId: member.id,
        engineerName: member.name,
        squadId: squad.id,
        squadName: squad.name,
        projectName: project.name,
        projectAlias: project.alias,
        cells,
      });
    }
  }
  return rows;
}

export function computeScenarioDiff(
  baseline: ScenarioFileV1,
  current: ScenarioFileV1,
): ScenarioDiff {
  const allAssignments = [...baseline.assignments, ...current.assignments];
  const months = buildMonthRange(allAssignments);

  if (months.length === 0) {
    return {
      months: [],
      squadGroups: [],
      summary: { addedRows: 0, removedRows: 0, changedRows: 0, unchangedRows: 0 },
    };
  }

  const baselineRows = buildSourceRows(baseline, months);
  const currentRows = buildSourceRows(current, months);

  const baselineMap = new Map(
    baselineRows.map((r) => [`${r.assignmentId}:${r.engineerId}`, r]),
  );
  const currentMap = new Map(
    currentRows.map((r) => [`${r.assignmentId}:${r.engineerId}`, r]),
  );

  const allKeys = new Set([...baselineMap.keys(), ...currentMap.keys()]);
  const diffRows: DiffRow[] = [];

  for (const key of allKeys) {
    const b = baselineMap.get(key);
    const c = currentMap.get(key);
    const source = c ?? b!;

    let rowStatus: DiffRowStatus;
    let cells: DiffCell[];

    if (!b) {
      rowStatus = "added";
      cells = source.cells.map((v) => ({
        baselineValue: 0,
        currentValue: v,
        status: "added" as DiffCellStatus,
      }));
    } else if (!c) {
      rowStatus = "removed";
      cells = source.cells.map((v) => ({
        baselineValue: v,
        currentValue: 0,
        status: "removed" as DiffCellStatus,
      }));
    } else {
      cells = b.cells.map((bv, i) => {
        const cv = c.cells[i];
        const status: DiffCellStatus = bv === cv ? "unchanged" : "changed";
        return { baselineValue: bv, currentValue: cv, status };
      });
      const anyChanged = cells.some((cell) => cell.status !== "unchanged");
      rowStatus = anyChanged ? "changed" : "unchanged";
    }

    diffRows.push({
      engineerId: source.engineerId,
      engineerName: source.engineerName,
      squadId: source.squadId,
      squadName: source.squadName,
      projectName: source.projectName,
      projectAlias: source.projectAlias,
      cells,
      rowStatus,
    });
  }

  const squadGroupMap = new Map<string, SquadDiffGroup>();
  for (const row of diffRows) {
    let group = squadGroupMap.get(row.squadId);
    if (!group) {
      group = { squadId: row.squadId, squadName: row.squadName, rows: [], changeCount: 0 };
      squadGroupMap.set(row.squadId, group);
    }
    group.rows.push(row);
    if (row.rowStatus !== "unchanged") group.changeCount++;
  }

  for (const group of squadGroupMap.values()) {
    group.rows.sort((a, b) => {
      const nameCmp = a.engineerName.localeCompare(b.engineerName);
      return nameCmp !== 0 ? nameCmp : a.projectName.localeCompare(b.projectName);
    });
  }

  const squadGroups = [...squadGroupMap.values()].sort((a, b) =>
    a.squadName.localeCompare(b.squadName),
  );

  const summary = {
    addedRows: diffRows.filter((r) => r.rowStatus === "added").length,
    removedRows: diffRows.filter((r) => r.rowStatus === "removed").length,
    changedRows: diffRows.filter((r) => r.rowStatus === "changed").length,
    unchangedRows: diffRows.filter((r) => r.rowStatus === "unchanged").length,
  };

  return { months, squadGroups, summary };
}
