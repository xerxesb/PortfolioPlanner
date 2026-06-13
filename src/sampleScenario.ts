import type { ScenarioFileV1 } from "./domain/types";

export const sampleScenario: ScenarioFileV1 = {
  schemaVersion: 1,
  scenario: {
    id: "baseline-portfolio",
    name: "Baseline portfolio sequence",
    createdAt: "2026-06-13T00:00:00Z",
    updatedAt: "2026-06-13T00:00:00Z",
  },
  calendar: {
    financialYearStartMonth: 7,
    piCountPerCalendarYear: 4,
    sprintsPerPi: 4,
  },
  squads: [
    { id: "squad-a", name: "Squad A", capacityFte: 8, color: "#2563eb" },
    { id: "squad-b", name: "Squad B", capacityFte: 6, color: "#059669" },
    { id: "squad-c", name: "Squad C", capacityFte: 7, color: "#7c3aed" },
    { id: "squad-d", name: "Squad D", capacityFte: 5, color: "#dc6803" },
  ],
  projects: [
    {
      id: "program-orion",
      name: "Program Orion",
      effortFteYears: 5,
      targetFinishKey: "26-3-2",
      eligibleSquadIds: ["squad-a", "squad-b"],
      milestones: [
        {
          id: "orion-integration",
          name: "Integration checkpoint",
          dateKey: "26-2-3",
          requiredPercent: 60,
        },
      ],
    },
    {
      id: "clinical-atlas",
      name: "Clinical Atlas",
      effortFteYears: 6,
      targetFinishKey: "27-1-4",
      eligibleSquadIds: ["squad-a", "squad-c", "squad-d"],
      milestones: [
        {
          id: "atlas-trial",
          name: "Trial readiness",
          dateKey: "27-1-2",
          requiredPercent: 75,
        },
      ],
    },
    {
      id: "regulatory-nova",
      name: "Regulatory Nova",
      effortFteYears: 4,
      targetFinishKey: "27-2-4",
      eligibleSquadIds: ["squad-a", "squad-b"],
      milestones: [
        {
          id: "nova-submission",
          name: "Regulatory submission",
          dateKey: "27-2-2",
          requiredPercent: 75,
        },
      ],
    },
  ],
  assignments: [
    {
      id: "orion-a",
      projectId: "program-orion",
      squadId: "squad-a",
      startKey: "26-1-1",
      finishKey: "26-2-3",
    },
    {
      id: "orion-b",
      projectId: "program-orion",
      squadId: "squad-b",
      startKey: "26-2-4",
      finishKey: "26-3-2",
    },
    {
      id: "atlas-c",
      projectId: "clinical-atlas",
      squadId: "squad-c",
      startKey: "26-3-2",
      finishKey: "26-4-3",
    },
    {
      id: "atlas-d",
      projectId: "clinical-atlas",
      squadId: "squad-d",
      startKey: "27-1-2",
      finishKey: "27-1-4",
    },
    {
      id: "atlas-a-support",
      projectId: "clinical-atlas",
      squadId: "squad-a",
      startKey: "27-1-1",
      finishKey: "27-1-2",
    },
    {
      id: "nova-a",
      projectId: "regulatory-nova",
      squadId: "squad-a",
      startKey: "27-1-1",
      finishKey: "27-2-2",
    },
    {
      id: "nova-b",
      projectId: "regulatory-nova",
      squadId: "squad-b",
      startKey: "27-2-3",
      finishKey: "27-2-4",
    },
  ],
};
