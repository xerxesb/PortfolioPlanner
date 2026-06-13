import { compareTimeKeys, timelineBetween, toSprintIndex } from "./time";
import type {
  Assignment,
  CapacityStatus,
  MilestoneStatus,
  ScenarioFileV1,
  TimeKey,
} from "./types";

export interface ProjectProgress {
  projectId: string;
  totalDemandFteSprints: number;
  capacityByMilestone: Record<string, number>;
}

export interface MilestoneFeasibility {
  milestoneId: string;
  projectId: string;
  name: string;
  dateKey: TimeKey;
  requiredCapacity: number;
  actualCapacity: number;
  status: MilestoneStatus;
}

export interface FeasibilitySummary {
  milestonesById: Record<string, MilestoneFeasibility>;
  redMilestones: number;
  amberMilestones: number;
  idleSquadPiEquivalent: number;
  overbookedSprintCount: number;
  gapFteSprints: number;
}

export interface CapacityCell {
  status: CapacityStatus;
  projectIds: string[];
  assignmentIds: string[];
}

export interface CapacityHeatmap {
  timeline: TimeKey[];
  bySquad: Record<string, Record<string, CapacityCell>>;
}

export function calculateProjectProgress(
  scenario: ScenarioFileV1,
  projectId: string,
): ProjectProgress {
  const project = scenario.projects.find((candidate) => candidate.id === projectId);
  if (!project) {
    throw new Error(`Unknown project ${projectId}`);
  }

  const assignments = scenario.assignments.filter(
    (assignment) => assignment.projectId === projectId,
  );
  const totalDemandFteSprints = project.effortFteYears * 16;
  const capacityByMilestone = Object.fromEntries(
    project.milestones.map((milestone) => [
      milestone.id,
      cumulativeCapacityThrough(scenario, assignments, milestone.dateKey),
    ]),
  );

  return {
    projectId,
    totalDemandFteSprints,
    capacityByMilestone,
  };
}

export function calculateFeasibility(scenario: ScenarioFileV1): FeasibilitySummary {
  const milestonesById: Record<string, MilestoneFeasibility> = {};
  let gapFteSprints = 0;

  for (const project of scenario.projects) {
    const progress = calculateProjectProgress(scenario, project.id);
    for (const milestone of project.milestones) {
      const requiredCapacity =
        progress.totalDemandFteSprints * (milestone.requiredPercent / 100);
      const actualCapacity = progress.capacityByMilestone[milestone.id] ?? 0;
      const gap = requiredCapacity - actualCapacity;
      if (gap > 0) gapFteSprints += gap;

      milestonesById[milestone.id] = {
        milestoneId: milestone.id,
        projectId: project.id,
        name: milestone.name,
        dateKey: milestone.dateKey,
        requiredCapacity,
        actualCapacity,
        status: milestoneStatus(requiredCapacity, actualCapacity),
      };
    }
  }

  const heatmap = calculateCapacityHeatmap(scenario);
  const cells = Object.values(heatmap.bySquad).flatMap((row) => Object.values(row));

  return {
    milestonesById,
    redMilestones: Object.values(milestonesById).filter(
      (milestone) => milestone.status === "red",
    ).length,
    amberMilestones: Object.values(milestonesById).filter(
      (milestone) => milestone.status === "amber",
    ).length,
    idleSquadPiEquivalent:
      cells.filter((cell) => cell.status === "idle").length / scenario.calendar.sprintsPerPi,
    overbookedSprintCount: cells.filter((cell) => cell.status === "overbooked").length,
    gapFteSprints: Math.round(gapFteSprints),
  };
}

export function calculateCapacityHeatmap(scenario: ScenarioFileV1): CapacityHeatmap {
  const timeline = scenarioTimeline(scenario);
  const bySquad: Record<string, Record<string, CapacityCell>> = {};

  for (const squad of scenario.squads) {
    bySquad[squad.id] = {};
    for (const key of timeline) {
      const assignments = assignmentsForSquadAt(scenario.assignments, squad.id, key);
      bySquad[squad.id][key] = {
        status: capacityStatus(assignments),
        projectIds: [...new Set(assignments.map((assignment) => assignment.projectId))],
        assignmentIds: assignments.map((assignment) => assignment.id),
      };
    }
  }

  return { timeline, bySquad };
}

export function scenarioTimeline(scenario: ScenarioFileV1): TimeKey[] {
  if (scenario.calendar.viewStart && scenario.calendar.viewFinish) {
    return timelineBetween(scenario.calendar.viewStart, scenario.calendar.viewFinish);
  }

  const keys = [
    ...scenario.projects.map((project) => project.targetFinishKey),
    ...scenario.projects.flatMap((project) =>
      project.milestones.map((milestone) => milestone.dateKey),
    ),
    ...scenario.assignments.flatMap((assignment) => [
      assignment.startKey,
      assignment.finishKey,
    ]),
  ];
  const minIndex = Math.min(...keys.map(toSprintIndex));
  const maxIndex = Math.max(...keys.map(toSprintIndex));
  const start = Math.floor(minIndex / 16) * 16;
  const finish = Math.ceil((maxIndex + 1) / 16) * 16 - 1;

  return timelineBetween(indexToKey(start), indexToKey(finish));
}

function indexToKey(index: number): TimeKey {
  const year = Math.floor(index / 16);
  const withinYear = index % 16;
  const pi = Math.floor(withinYear / 4) + 1;
  const sprint = (withinYear % 4) + 1;
  return `${String(year).padStart(2, "0")}-${pi}-${sprint}` as TimeKey;
}

function cumulativeCapacityThrough(
  scenario: ScenarioFileV1,
  assignments: Assignment[],
  dateKey: TimeKey,
): number {
  return assignments.reduce((sum, assignment) => {
    const squad = scenario.squads.find((candidate) => candidate.id === assignment.squadId);
    if (!squad) return sum;

    const coveredSprints = timelineBetween(assignment.startKey, assignment.finishKey).filter(
      (key) => compareTimeKeys(key, dateKey) <= 0,
    );

    return sum + coveredSprints.length * squad.capacityFte;
  }, 0);
}

function milestoneStatus(requiredCapacity: number, actualCapacity: number): MilestoneStatus {
  if (actualCapacity < requiredCapacity) return "red";
  if (actualCapacity - requiredCapacity < requiredCapacity * 0.1) return "amber";
  return "green";
}

function assignmentsForSquadAt(
  assignments: Assignment[],
  squadId: string,
  key: TimeKey,
): Assignment[] {
  return assignments.filter(
    (assignment) =>
      assignment.squadId === squadId &&
      compareTimeKeys(assignment.startKey, key) <= 0 &&
      compareTimeKeys(assignment.finishKey, key) >= 0,
  );
}

function capacityStatus(assignments: Assignment[]): CapacityStatus {
  if (assignments.length === 0) return "idle";
  if (assignments.length === 1) return "committed";
  return "overbooked";
}
