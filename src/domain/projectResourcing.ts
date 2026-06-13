import { compareTimeKeys } from "./time";
import type { ScenarioFileV1, TimeKey } from "./types";
import { scenarioTimeline } from "./feasibility";

export type ProjectCumulativeStatus =
  | "unresourced"
  | "in-progress"
  | "at-risk"
  | "complete"
  | "over";

export interface ProjectCumulativeCell {
  percent: number;
  status: ProjectCumulativeStatus;
}

export interface ProjectCumulativeHeatmap {
  timeline: TimeKey[];
  byProject: Record<string, Record<string, ProjectCumulativeCell>>;
}

export type ProjectSprintStatus = "unresourced" | "resourced" | "over";

export interface ProjectSprintCell {
  fteSprints: number;
  status: ProjectSprintStatus;
}

export interface ProjectSprintHeatmap {
  timeline: TimeKey[];
  byProject: Record<string, Record<string, ProjectSprintCell>>;
}

export function calculateProjectCumulativeHeatmap(
  scenario: ScenarioFileV1,
): ProjectCumulativeHeatmap {
  const timeline = scenarioTimeline(scenario);
  const byProject: Record<string, Record<string, ProjectCumulativeCell>> = {};

  for (const project of scenario.projects) {
    byProject[project.id] = {};
    const totalDemandFteSprints = project.effortFteYears * 16;
    const projectAssignments = scenario.assignments.filter(
      (a) => a.projectId === project.id,
    );
    let cumulativeFteSprints = 0;

    for (const key of timeline) {
      const fteSprints = projectAssignments.reduce((sum, assignment) => {
        if (
          compareTimeKeys(assignment.startKey, key) <= 0 &&
          compareTimeKeys(assignment.finishKey, key) >= 0
        ) {
          const squad = scenario.squads.find((s) => s.id === assignment.squadId);
          return sum + (squad?.capacityFte ?? 0);
        }
        return sum;
      }, 0);

      cumulativeFteSprints += fteSprints;

      const percent =
        totalDemandFteSprints > 0
          ? (cumulativeFteSprints / totalDemandFteSprints) * 100
          : 0;

      const pastTarget = compareTimeKeys(key, project.targetFinishKey) > 0;

      let status: ProjectCumulativeStatus;
      if (percent > 100) {
        status = "over";
      } else if (percent === 100) {
        status = "complete";
      } else if (pastTarget) {
        status = "at-risk";
      } else if (percent > 0) {
        status = "in-progress";
      } else {
        status = "unresourced";
      }

      byProject[project.id][key] = { percent, status };
    }
  }

  return { timeline, byProject };
}

export function calculateProjectSprintHeatmap(
  scenario: ScenarioFileV1,
): ProjectSprintHeatmap {
  const timeline = scenarioTimeline(scenario);
  const byProject: Record<string, Record<string, ProjectSprintCell>> = {};

  for (const project of scenario.projects) {
    byProject[project.id] = {};
    const totalDemandFteSprints = project.effortFteYears * 16;
    const projectAssignments = scenario.assignments.filter(
      (a) => a.projectId === project.id,
    );
    let cumulativeFteSprints = 0;

    for (const key of timeline) {
      const fteSprints = projectAssignments.reduce((sum, assignment) => {
        if (
          compareTimeKeys(assignment.startKey, key) <= 0 &&
          compareTimeKeys(assignment.finishKey, key) >= 0
        ) {
          const squad = scenario.squads.find((s) => s.id === assignment.squadId);
          return sum + (squad?.capacityFte ?? 0);
        }
        return sum;
      }, 0);

      cumulativeFteSprints += fteSprints;

      let status: ProjectSprintStatus;
      if (fteSprints === 0) {
        status = "unresourced";
      } else if (cumulativeFteSprints > totalDemandFteSprints) {
        status = "over";
      } else {
        status = "resourced";
      }

      byProject[project.id][key] = { fteSprints, status };
    }
  }

  return { timeline, byProject };
}
