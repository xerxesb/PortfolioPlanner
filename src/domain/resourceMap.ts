import { sprintToCalendarMonthIndex, toSprintIndex } from "./time";
import type { Assignment, Project, Squad } from "./types";

export interface CalendarMonth {
  year: number;   // two-digit, e.g. 26
  month: number;  // 1–12
  label: string;  // e.g. "Jul-26"
}

export interface ResourceMapRow {
  engineerId: number;
  engineerName: string;
  squadName: string;
  projectName: string;
  monthCells: number[];  // 0 = not allocated, 0.5 = half month, 1 = full month
}

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function indexToCalendarMonth(idx: number): CalendarMonth {
  const year = Math.floor(idx / 12);
  const month = (idx % 12) + 1;
  return {
    year,
    month,
    label: `${MONTH_LABELS[month - 1]}-${String(year).padStart(2, "0")}`,
  };
}

/**
 * Returns the sprint indices (as used by toSprintIndex) that fall within the
 * given calendar month index. Each PI spans 3 months with 4 sprints:
 * month-within-PI 0 → sprints 1 & 2 (2 sprints), 1 → sprint 3, 2 → sprint 4.
 */
function sprintIndicesForMonth(monthIdx: number): number[] {
  const year = Math.floor(monthIdx / 12);
  const rem = monthIdx % 12;
  const piZero = Math.floor(rem / 3); // 0-indexed PI within year
  const monthWithinPi = rem % 3;
  const piBase = year * 16 + piZero * 4;
  if (monthWithinPi === 0) return [piBase, piBase + 1]; // sprints 1, 2
  if (monthWithinPi === 1) return [piBase + 2];          // sprint 3
  return [piBase + 3];                                    // sprint 4
}

/**
 * Fraction of the calendar month covered by [assignStart, assignEnd] (both
 * expressed as sprint indices from toSprintIndex). Returns a value in [0, 1].
 */
function fractionOfMonth(
  monthIdx: number,
  assignStart: number,
  assignEnd: number,
): number {
  const indices = sprintIndicesForMonth(monthIdx);
  const covered = indices.filter((s) => s >= assignStart && s <= assignEnd).length;
  return covered / indices.length;
}

export function buildResourceMapRows(
  squads: Squad[],
  assignments: Assignment[],
  projects: Project[],
): { months: CalendarMonth[]; rows: ResourceMapRow[] } {
  if (assignments.length === 0) {
    return { months: [], rows: [] };
  }

  let minIdx = Infinity;
  let maxIdx = -Infinity;
  for (const a of assignments) {
    const s = sprintToCalendarMonthIndex(a.startKey);
    const e = sprintToCalendarMonthIndex(a.finishKey);
    if (s < minIdx) minIdx = s;
    if (e > maxIdx) maxIdx = e;
  }

  const months: CalendarMonth[] = [];
  for (let i = minIdx; i <= maxIdx; i++) {
    months.push(indexToCalendarMonth(i));
  }

  const squadMap = new Map(squads.map((s) => [s.id, s]));
  const projectMap = new Map(projects.map((p) => [p.id, p]));

  const rows: ResourceMapRow[] = [];

  for (const assignment of assignments) {
    const squad = squadMap.get(assignment.squadId);
    if (!squad?.members?.length) continue;

    const project = projectMap.get(assignment.projectId);
    if (!project) continue;

    const aStart = toSprintIndex(assignment.startKey);
    const aEnd = toSprintIndex(assignment.finishKey);

    for (const member of squad.members) {
      const monthCells = months.map((m) => {
        const monthIdx = m.year * 12 + m.month - 1;
        return fractionOfMonth(monthIdx, aStart, aEnd);
      });
      rows.push({
        engineerId: member.id,
        engineerName: member.name,
        squadName: squad.name,
        projectName: project.name,
        monthCells,
      });
    }
  }

  rows.sort((a, b) => {
    if (a.engineerId !== b.engineerId) return a.engineerId - b.engineerId;
    return a.projectName.localeCompare(b.projectName);
  });

  return { months, rows };
}
