import type { TimeKey } from "./time";

export type { TimeKey };

export interface ScenarioFileV1 {
  schemaVersion: 1;
  scenario: {
    id: string;
    name: string;
    notes?: string;
    createdAt: string;
    updatedAt: string;
  };
  calendar: {
    financialYearStartMonth: 7;
    piCountPerCalendarYear: 4;
    sprintsPerPi: 4;
    viewStart?: TimeKey;
    viewFinish?: TimeKey;
  };
  squads: Squad[];
  projects: Project[];
  assignments: Assignment[];
}

export interface Engineer {
  id: number;
  name: string;
}

export interface Squad {
  id: string;
  name: string;
  capacityFte: number;
  color?: string;
  members?: Engineer[];
}

export interface Project {
  id: string;
  name: string;
  alias?: string;
  projectCode?: string;
  effortFteYears: number;
  targetStartKey?: TimeKey;
  targetFinishKey: TimeKey;
  eligibleSquadIds: string[];
  milestones: Milestone[];
}

export interface Milestone {
  id: string;
  name: string;
  dateKey: TimeKey;
  requiredPercent: number;
}

export interface Assignment {
  id: string;
  projectId: string;
  squadId: string;
  startKey: TimeKey;
  finishKey: TimeKey;
}

export type MilestoneStatus = "green" | "amber" | "red";
export type CapacityStatus = "idle" | "committed" | "overbooked";
