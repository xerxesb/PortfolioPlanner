# Milestone Coverage Heatmap — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Milestone coverage" tab to the Project Resourcing panel showing cumulative resourcing as a percentage of the next upcoming milestone's required effort.

**Architecture:** New pure function `calculateProjectMilestoneCoverageHeatmap` in `src/domain/projectResourcing.ts` (returns the existing `ProjectCumulativeHeatmap` type). Wired into `App.tsx` via `useMemo` and a new tab in `ProjectResourcingPanel`. No new types or files.

**Tech Stack:** TypeScript, React 18, Vitest

**Spec:** `docs/superpowers/specs/2026-06-14-milestone-coverage-heatmap-design.md`

---

### Task 1: Calculation function + tests

**Files:**
- Modify: `src/domain/projectResourcing.ts`
- Modify: `src/domain/projectResourcing.test.ts`

- [ ] **Step 1: Write failing tests**

Append a new `describe` block to `src/domain/projectResourcing.test.ts`:

```ts
describe("calculateProjectMilestoneCoverageHeatmap", () => {
  it("returns same result as cumulative heatmap for a project with no milestones", () => {
    const scenario = {
      ...baseScenario,
      assignments: [
        { id: "a1", projectId: "proj-x", squadId: "sq-a", startKey: "26-1-1" as TimeKey, finishKey: "26-1-4" as TimeKey },
      ],
    };
    const milestone = calculateProjectMilestoneCoverageHeatmap(scenario);
    const cumulative = calculateProjectCumulativeHeatmap(scenario);
    // With no milestones, both views use the same denominator
    expect(milestone.byProject["proj-x"]["26-1-1"].percent).toBeCloseTo(
      cumulative.byProject["proj-x"]["26-1-1"].percent,
    );
    expect(milestone.byProject["proj-x"]["26-1-4"].status).toBe(
      cumulative.byProject["proj-x"]["26-1-4"].status,
    );
  });

  it("uses milestone requiredPercent as denominator before the milestone date", () => {
    // proj-x: 1 FTE-year = 16 FTE-sprints total
    // milestone at 26-2-4 requires 50% = 8 FTE-sprints
    // assignment: sq-a (4 FTE) from 26-1-1 to 26-1-1 = 4 FTE-sprints
    // at 26-1-1: 4/8 = 50%
    const scenario: ScenarioFileV1 = {
      ...baseScenario,
      projects: [
        {
          ...baseScenario.projects[0],
          milestones: [{ id: "m1", name: "Gate 1", dateKey: "26-2-4" as TimeKey, requiredPercent: 50 }],
        },
      ],
      assignments: [
        { id: "a1", projectId: "proj-x", squadId: "sq-a", startKey: "26-1-1" as TimeKey, finishKey: "26-1-1" as TimeKey },
      ],
    };
    const heatmap = calculateProjectMilestoneCoverageHeatmap(scenario);
    expect(heatmap.byProject["proj-x"]["26-1-1"].percent).toBeCloseTo(50);
    expect(heatmap.byProject["proj-x"]["26-1-1"].status).toBe("in-progress");
  });

  it("switches denominator to next milestone after first is covered", () => {
    // proj-x: 1 FTE-year = 16 FTE-sprints total
    // milestone 1 at 26-1-4 requires 25% = 4 FTE-sprints
    // milestone 2 at 26-2-4 requires 50% = 8 FTE-sprints (cumulative from project start)
    // assignment: sq-a (4 FTE) sprints 26-1-1 to 26-1-4 = 16 FTE-sprints total
    // at 26-1-4: cumulative=16, milestone1 requiredFte=4 → 400% (over)
    // at 26-2-1: cumulative=16, active milestone=milestone2, requiredFte=8 → 200% (over)
    const scenario: ScenarioFileV1 = {
      ...baseScenario,
      projects: [
        {
          ...baseScenario.projects[0],
          milestones: [
            { id: "m1", name: "Gate 1", dateKey: "26-1-4" as TimeKey, requiredPercent: 25 },
            { id: "m2", name: "Gate 2", dateKey: "26-2-4" as TimeKey, requiredPercent: 50 },
          ],
        },
      ],
      assignments: [
        { id: "a1", projectId: "proj-x", squadId: "sq-a", startKey: "26-1-1" as TimeKey, finishKey: "26-1-4" as TimeKey },
      ],
    };
    const heatmap = calculateProjectMilestoneCoverageHeatmap(scenario);
    // at 26-1-1: cumulative=4, active=m1 (dateKey=26-1-4>=26-1-1), required=4 → 100%
    expect(heatmap.byProject["proj-x"]["26-1-1"].percent).toBeCloseTo(100);
    // at 26-2-1: cumulative=16 (all sprints done), active=m2 (dateKey=26-2-4>=26-2-1), required=8 → 200%
    expect(heatmap.byProject["proj-x"]["26-2-1"].percent).toBeCloseTo(200);
    expect(heatmap.byProject["proj-x"]["26-2-1"].status).toBe("over");
  });

  it("falls back to full effort denominator after all milestones are passed", () => {
    // proj-x: 1 FTE-year = 16 FTE-sprints total
    // milestone at 26-1-4 requires 50% = 8 FTE-sprints
    // assignment: sq-a (4 FTE) 26-1-1 to 26-1-4 = 16 FTE-sprints
    // at 26-3-1: past all milestones, fallback denominator=16, cumulative=16 → 100%
    const scenario: ScenarioFileV1 = {
      ...baseScenario,
      projects: [
        {
          ...baseScenario.projects[0],
          milestones: [{ id: "m1", name: "Gate 1", dateKey: "26-1-4" as TimeKey, requiredPercent: 50 }],
        },
      ],
      assignments: [
        { id: "a1", projectId: "proj-x", squadId: "sq-a", startKey: "26-1-1" as TimeKey, finishKey: "26-1-4" as TimeKey },
      ],
    };
    const heatmap = calculateProjectMilestoneCoverageHeatmap(scenario);
    // at 26-3-1: past milestone (26-1-4), fallback to full 16 FTE-sprints denominator
    // cumulative at 26-3-1 = 16 FTE-sprints → 100%
    expect(heatmap.byProject["proj-x"]["26-3-1"].percent).toBeCloseTo(100);
    expect(heatmap.byProject["proj-x"]["26-3-1"].status).toBe("complete");
  });
});
```

Add `calculateProjectMilestoneCoverageHeatmap` and `TimeKey` to the import in the test file:

```ts
import {
  calculateProjectCumulativeHeatmap,
  calculateProjectMilestoneCoverageHeatmap,
  calculateProjectSprintHeatmap,
} from "./projectResourcing";
import type { ScenarioFileV1, TimeKey } from "./types";
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /Users/xbattiwalla/src/ResourcePlanner && npm test -- --reporter=verbose 2>&1 | grep -E "(FAIL|calculateProjectMilestoneCoverage)"
```

Expected: 4 new tests FAIL (`calculateProjectMilestoneCoverageHeatmap` is not yet exported).

- [ ] **Step 3: Implement `calculateProjectMilestoneCoverageHeatmap`**

Add the following export to `src/domain/projectResourcing.ts`, after `calculateProjectCumulativeHeatmap`:

```ts
export function calculateProjectMilestoneCoverageHeatmap(
  scenario: ScenarioFileV1,
): ProjectCumulativeHeatmap {
  const timeline = scenarioTimeline(scenario);
  const byProject: Record<string, Record<string, ProjectCumulativeCell>> = {};

  for (const project of scenario.projects) {
    byProject[project.id] = {};
    const totalDemandFteSprints = project.effortFteYears * 16;
    const sortedMilestones = [...project.milestones].sort((a, b) =>
      compareTimeKeys(a.dateKey, b.dateKey),
    );
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

      // Find the active milestone: first milestone whose dateKey >= current key
      const activeMilestone = sortedMilestones.find(
        (m) => compareTimeKeys(m.dateKey, key) >= 0,
      );

      const requiredFteSprints =
        activeMilestone != null
          ? totalDemandFteSprints * (activeMilestone.requiredPercent / 100)
          : totalDemandFteSprints;

      const percent =
        requiredFteSprints > 0
          ? (cumulativeFteSprints / requiredFteSprints) * 100
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
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd /Users/xbattiwalla/src/ResourcePlanner && npm test -- --reporter=verbose 2>&1 | grep -E "(PASS|FAIL|calculateProjectMilestoneCoverage)"
```

Expected: 4 new tests PASS, all existing tests still pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/xbattiwalla/src/ResourcePlanner && git add src/domain/projectResourcing.ts src/domain/projectResourcing.test.ts && git commit -m "feat: add calculateProjectMilestoneCoverageHeatmap

Pure function returning cumulative resourcing % relative to the next
upcoming milestone's requiredPercent. Falls back to full project effort
when no future milestones remain. Four unit tests."
```

---

### Task 2: Wire into App.tsx — new tab + view

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Import the new function**

Find the import of the resourcing functions near the top of `src/App.tsx`:

```ts
import {
  calculateProjectCumulativeHeatmap,
  calculateProjectSprintHeatmap,
  type ProjectCumulativeHeatmap,
  type ProjectSprintHeatmap,
} from "./domain/projectResourcing";
```

Replace with:

```ts
import {
  calculateProjectCumulativeHeatmap,
  calculateProjectMilestoneCoverageHeatmap,
  calculateProjectSprintHeatmap,
  type ProjectCumulativeHeatmap,
  type ProjectSprintHeatmap,
} from "./domain/projectResourcing";
```

- [ ] **Step 2: Add `useMemo` for the new heatmap in `App`**

Find the existing heatmap memos:

```ts
  const cumulativeHeatmap = useMemo(() => calculateProjectCumulativeHeatmap(scenario), [scenario]);
  const sprintHeatmap = useMemo(() => calculateProjectSprintHeatmap(scenario), [scenario]);
```

Add a new memo directly after:

```ts
  const milestoneCoverageHeatmap = useMemo(() => calculateProjectMilestoneCoverageHeatmap(scenario), [scenario]);
```

- [ ] **Step 3: Pass the new heatmap to `ProjectResourcingPanel`**

Find the `<ProjectResourcingPanel` JSX call:

```tsx
      <ProjectResourcingPanel
        scenario={scenario}
        heatmap={heatmap}
        cumulativeHeatmap={cumulativeHeatmap}
        sprintHeatmap={sprintHeatmap}
        timeline={timeline}
      />
```

Replace with:

```tsx
      <ProjectResourcingPanel
        scenario={scenario}
        heatmap={heatmap}
        cumulativeHeatmap={cumulativeHeatmap}
        milestoneCoverageHeatmap={milestoneCoverageHeatmap}
        sprintHeatmap={sprintHeatmap}
        timeline={timeline}
      />
```

- [ ] **Step 4: Update `ProjectResourcingPanel` signature**

Find the `ProjectResourcingPanel` function. Its props interface currently is:

```ts
): {
  scenario: ScenarioFileV1;
  heatmap: ReturnType<typeof calculateCapacityHeatmap>;
  cumulativeHeatmap: ProjectCumulativeHeatmap;
  sprintHeatmap: ProjectSprintHeatmap;
  timeline: TimeKey[];
}
```

Add `milestoneCoverageHeatmap` and update the `activeTab` type:

```ts
): {
  scenario: ScenarioFileV1;
  heatmap: ReturnType<typeof calculateCapacityHeatmap>;
  cumulativeHeatmap: ProjectCumulativeHeatmap;
  milestoneCoverageHeatmap: ProjectCumulativeHeatmap;
  sprintHeatmap: ProjectSprintHeatmap;
  timeline: TimeKey[];
}
```

Also update the destructuring to include `milestoneCoverageHeatmap`, and change the `activeTab` state type from:

```ts
  const [activeTab, setActiveTab] = useState<"cumulative" | "sprint" | "team">("cumulative");
```

to:

```ts
  const [activeTab, setActiveTab] = useState<"cumulative" | "milestone" | "sprint" | "team">("cumulative");
```

- [ ] **Step 5: Add the new tab button and view**

Find the `resourcing-tabs` div. Currently it has three buttons (cumulative, sprint, team). Add the milestone tab **between cumulative and sprint**:

```tsx
        <button
          type="button"
          className={`resourcing-tab${activeTab === "milestone" ? " active" : ""}`}
          onClick={() => setActiveTab("milestone")}
        >
          Milestone coverage
          <InfoIcon tooltip="Shows cumulative resourcing as a % of the next upcoming milestone's required effort. Once a milestone is covered (≥100%), the denominator switches to the next milestone. Falls back to total project effort when no future milestones remain." />
        </button>
```

Then add the conditional render after the cumulative block:

```tsx
      {activeTab === "milestone" && (
        <ProjectCumulativeView scenario={scenario} heatmap={milestoneCoverageHeatmap} timeline={timeline} />
      )}
```

- [ ] **Step 6: Run all tests, typecheck, lint**

```bash
cd /Users/xbattiwalla/src/ResourcePlanner && npm test 2>&1 | tail -10
```
Expected: all tests pass.

```bash
cd /Users/xbattiwalla/src/ResourcePlanner && npm run typecheck 2>&1 && npm run lint 2>&1 | tail -5
```
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
cd /Users/xbattiwalla/src/ResourcePlanner && git add src/App.tsx docs/superpowers/specs/2026-06-14-milestone-coverage-heatmap-design.md docs/superpowers/plans/2026-06-14-milestone-coverage-heatmap.md && git commit -m "feat: add Milestone coverage tab to Project Resourcing panel

New tab shows cumulative resourcing as % of next upcoming milestone's
required effort. Denominator switches to each subsequent milestone as
each is covered; falls back to full project effort after all milestones.

Spec: docs/superpowers/specs/2026-06-14-milestone-coverage-heatmap-design.md"
```

---

## Self-Review

**Spec coverage:**
- ✅ New tab in panel — Task 2 Steps 4–5
- ✅ Milestone denominator before gate — Task 1 Step 3 (`activeMilestone.requiredPercent / 100`)
- ✅ Switch to next milestone after coverage — `sortedMilestones.find(m => compareTimeKeys(m.dateKey, key) >= 0)` naturally picks the next gate as key advances
- ✅ No milestones → same as cumulative — `activeMilestone == null` → `requiredFteSprints = totalDemandFteSprints`
- ✅ `at-risk` past targetFinishKey — same logic as cumulative
- ✅ All existing tests pass — checked in Task 2 Step 6

**Placeholder scan:** None.

**Type consistency:** `calculateProjectMilestoneCoverageHeatmap` returns `ProjectCumulativeHeatmap` — matched exactly in App.tsx prop type and `ProjectCumulativeView` usage.
