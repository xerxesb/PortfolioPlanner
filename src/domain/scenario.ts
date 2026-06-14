import { z } from "zod";
import { compareTimeKeys } from "./time";
import type { ScenarioFileV1 } from "./types";

const timeKeySchema = z
  .string()
  .regex(/^\d{2}-[1-4]-[1-4]$/, "Invalid time key");

const milestoneSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  dateKey: timeKeySchema,
  requiredPercent: z.number().min(0).max(100),
});

const projectSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  effortFteYears: z.number().positive(),
  targetStartKey: timeKeySchema.optional(),
  targetFinishKey: timeKeySchema,
  eligibleSquadIds: z.array(z.string().min(1)),
  milestones: z.array(milestoneSchema),
});

const assignmentSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  squadId: z.string().min(1),
  startKey: timeKeySchema,
  finishKey: timeKeySchema,
});

const scenarioSchema = z.object({
  schemaVersion: z.literal(1),
  scenario: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    notes: z.string().optional(),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
  }),
  calendar: z.object({
    financialYearStartMonth: z.literal(7),
    piCountPerCalendarYear: z.literal(4),
    sprintsPerPi: z.literal(4),
    viewStart: timeKeySchema.optional(),
    viewFinish: timeKeySchema.optional(),
  }),
  squads: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      capacityFte: z.number().positive(),
      color: z.string().optional(),
    }),
  ),
  projects: z.array(projectSchema),
  assignments: z.array(assignmentSchema),
});

export function importScenario(json: string): ScenarioFileV1 {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("Scenario file is not valid JSON");
  }

  const scenario = scenarioSchema.parse(parsed) as ScenarioFileV1;
  validateScenarioReferences(scenario);
  return scenario;
}

export function exportScenario(scenario: ScenarioFileV1): string {
  validateScenarioReferences(scenario);
  return `${JSON.stringify(scenario, null, 2)}\n`;
}

export function validateScenarioReferences(scenario: ScenarioFileV1): void {
  const squadIds = new Set(scenario.squads.map((squad) => squad.id));
  const projectIds = new Set(scenario.projects.map((project) => project.id));

  for (const project of scenario.projects) {
    for (const squadId of project.eligibleSquadIds) {
      if (!squadIds.has(squadId)) {
        throw new Error(`Project ${project.name} references unknown squad ${squadId}`);
      }
    }
  }

  for (const assignment of scenario.assignments) {
    if (!projectIds.has(assignment.projectId)) {
      throw new Error(`Assignment ${assignment.id} references unknown project ${assignment.projectId}`);
    }
    if (!squadIds.has(assignment.squadId)) {
      throw new Error(`Assignment ${assignment.id} references unknown squad ${assignment.squadId}`);
    }
    if (compareTimeKeys(assignment.startKey, assignment.finishKey) === 1) {
      throw new Error(`Assignment ${assignment.id} finishes before it starts`);
    }
  }
}
