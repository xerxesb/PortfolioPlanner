import { sprintToCalendarMonthIndex } from "./time";
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
  monthCells: boolean[];
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

    const aStart = sprintToCalendarMonthIndex(assignment.startKey);
    const aEnd = sprintToCalendarMonthIndex(assignment.finishKey);

    for (const member of squad.members) {
      const monthCells = months.map((m) => {
        const idx = m.year * 12 + m.month - 1;
        return idx >= aStart && idx <= aEnd;
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
