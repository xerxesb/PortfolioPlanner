import { describe, expect, it } from "vitest";
import { sampleScenario } from "../sampleScenario";
import { exportScenario, importScenario } from "./scenario";

describe("scenario import/export", () => {
  it("round-trips a valid resource plan exactly", () => {
    const exported = exportScenario(sampleScenario);
    const imported = importScenario(exported);

    expect(imported).toEqual(sampleScenario);
    expect(exported).toContain('"schemaVersion": 1');
  });

  it("rejects assignments that reference unknown squads", () => {
    const invalid = {
      ...sampleScenario,
      assignments: [
        {
          ...sampleScenario.assignments[0],
          squadId: "missing-squad",
        },
      ],
    };

    expect(() => importScenario(JSON.stringify(invalid))).toThrow(
      /unknown squad/i,
    );
  });

  it("rejects milestones outside the required percentage range", () => {
    const invalid = {
      ...sampleScenario,
      projects: [
        {
          ...sampleScenario.projects[0],
          milestones: [
            {
              ...sampleScenario.projects[0].milestones[0],
              requiredPercent: 125,
            },
          ],
        },
      ],
    };

    expect(() => importScenario(JSON.stringify(invalid))).toThrow(
      /Required/i,
    );
  });
});
