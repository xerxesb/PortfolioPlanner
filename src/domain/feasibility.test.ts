import { describe, expect, it } from "vitest";
import { sampleScenario } from "../sampleScenario";
import {
  calculateCapacityHeatmap,
  calculateFeasibility,
  calculateProjectProgress,
} from "./feasibility";

describe("feasibility calculations", () => {
  it("calculates cumulative assigned capacity for a project", () => {
    const progress = calculateProjectProgress(sampleScenario, "program-orion");

    expect(progress.totalDemandFteSprints).toBe(80);
    expect(progress.capacityByMilestone["orion-integration"]).toBe(56);
  });

  it("marks milestone gates red, amber, or green", () => {
    const feasibility = calculateFeasibility(sampleScenario);

    expect(feasibility.milestonesById["orion-integration"].status).toBe(
      "green",
    );
    expect(feasibility.milestonesById["atlas-trial"].status).toBe("red");
    expect(feasibility.milestonesById["nova-submission"].status).toBe("amber");
  });

  it("detects squad conflicts and idle capacity by sprint", () => {
    const heatmap = calculateCapacityHeatmap(sampleScenario);

    expect(heatmap.bySquad["squad-a"]["27-1-1"].status).toBe("overbooked");
    expect(heatmap.bySquad["squad-b"]["26-1-1"].status).toBe("idle");
    expect(heatmap.bySquad["squad-c"]["26-3-2"].projectIds).toEqual([
      "clinical-atlas",
    ]);
  });
});
