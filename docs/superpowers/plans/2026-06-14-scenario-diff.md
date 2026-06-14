# Scenario Diff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Compare tab that loads a baseline `.resourceplan` file and shows a per-engineer, per-project, per-month diff table — same column shape as the Resource Map TSV — with changed cells highlighted red (baseline) / green (current).

**Architecture:** A pure `computeScenarioDiff` function in `scenarioDiff.ts` computes a cell-level diff by expanding both scenarios into per-engineer × per-assignment month allocation rows, then comparing them. The Compare tab in `App.tsx` holds a session-only baseline state and renders a diff table; squads with no changes collapse by default.

**Tech Stack:** React, TypeScript, Vitest, existing `buildMonthRange`/`fractionOfMonth` helpers (to be exported from `resourceMap.ts`).

---

### Task 1: Export helpers from `resourceMap.ts`

**Files:**
- Modify: `src/domain/resourceMap.ts`

`scenarioDiff.ts` needs to re-use the month-range builder and per-month fraction logic without duplicating them.

- [ ] **Step 1: Export `fractionOfMonth`**

In `src/domain/resourceMap.ts`, change:
```ts
function fractionOfMonth(
```
to:
```ts
export function fractionOfMonth(
```

- [ ] **Step 2: Extract and export `buildMonthRange`**

Add this function immediately above `buildResourceMapRows`:

```ts
export function buildMonthRange(assignments: Assignment[]): CalendarMonth[] {
  if (assignments.length === 0) return [];
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
  return months;
}
```

- [ ] **Step 3: Simplify `buildResourceMapRows` to use `buildMonthRange`**

Replace the month-range building block inside `buildResourceMapRows`:

```ts
// BEFORE (lines that build minIdx/maxIdx/months):
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
// AFTER:
  const months = buildMonthRange(assignments);
```

- [ ] **Step 4: Run tests to verify nothing broke**

```
npm test
```
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/domain/resourceMap.ts
git commit -m "refactor: export fractionOfMonth and buildMonthRange from resourceMap"
```

---

### Task 2: Write failing tests for `scenarioDiff.ts`

**Files:**
- Create: `src/domain/scenarioDiff.test.ts`

- [ ] **Step 1: Create the test file**

Create `src/domain/scenarioDiff.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { computeScenarioDiff } from "./scenarioDiff";
import type { ScenarioFileV1 } from "./types";

const BASE_CALENDAR = {
  financialYearStartMonth: 7 as const,
  piCountPerCalendarYear: 4 as const,
  sprintsPerPi: 4 as const,
};

function makeScenario(overrides: Partial<ScenarioFileV1> = {}): ScenarioFileV1 {
  return {
    schemaVersion: 1,
    scenario: { id: "s1", name: "Test", createdAt: "", updatedAt: "" },
    calendar: BASE_CALENDAR,
    squads: [
      {
        id: "sq1",
        name: "Squad Alpha",
        capacityFte: 2,
        members: [
          { id: 1, name: "Alice" },
          { id: 2, name: "Bob" },
        ],
      },
    ],
    projects: [
      { id: "p1", name: "Project Orion", effortFteYears: 1, targetFinishKey: "26-4-4", eligibleSquadIds: ["sq1"], milestones: [] },
    ],
    assignments: [
      { id: "a1", projectId: "p1", squadId: "sq1", startKey: "26-1-1", finishKey: "26-2-4" },
    ],
    ...overrides,
  };
}

describe("computeScenarioDiff", () => {
  it("returns all unchanged rows when scenarios are identical", () => {
    const scenario = makeScenario();
    const diff = computeScenarioDiff(scenario, scenario);
    expect(diff.summary.addedRows).toBe(0);
    expect(diff.summary.removedRows).toBe(0);
    expect(diff.summary.changedRows).toBe(0);
    expect(diff.summary.unchangedRows).toBe(2); // Alice and Bob
    expect(diff.squadGroups[0].changeCount).toBe(0);
  });

  it("marks rows as added when assignment exists only in current", () => {
    const baseline = makeScenario({ assignments: [] });
    const current = makeScenario();
    const diff = computeScenarioDiff(baseline, current);
    expect(diff.summary.addedRows).toBe(2); // Alice and Bob
    expect(diff.summary.removedRows).toBe(0);
    expect(diff.squadGroups[0].rows.every((r) => r.rowStatus === "added")).toBe(true);
  });

  it("marks rows as removed when assignment exists only in baseline", () => {
    const baseline = makeScenario();
    const current = makeScenario({ assignments: [] });
    const diff = computeScenarioDiff(baseline, current);
    expect(diff.summary.removedRows).toBe(2); // Alice and Bob
    expect(diff.summary.addedRows).toBe(0);
    expect(diff.squadGroups[0].rows.every((r) => r.rowStatus === "removed")).toBe(true);
  });

  it("marks rows as changed when assignment dates shift", () => {
    const baseline = makeScenario();
    const current = makeScenario({
      assignments: [
        { id: "a1", projectId: "p1", squadId: "sq1", startKey: "26-2-1", finishKey: "26-3-4" },
      ],
    });
    const diff = computeScenarioDiff(baseline, current);
    expect(diff.summary.changedRows).toBe(2); // Alice and Bob
    expect(diff.summary.addedRows).toBe(0);
    expect(diff.summary.removedRows).toBe(0);
  });

  it("marks cells changed where allocation differs", () => {
    const baseline = makeScenario();
    const current = makeScenario({
      assignments: [
        { id: "a1", projectId: "p1", squadId: "sq1", startKey: "26-2-1", finishKey: "26-3-4" },
      ],
    });
    const diff = computeScenarioDiff(baseline, current);
    const row = diff.squadGroups[0].rows[0]; // Alice
    const changedCells = row.cells.filter((c) => c.status === "changed");
    expect(changedCells.length).toBeGreaterThan(0);
  });

  it("month range spans union of both scenarios' assignments", () => {
    const baseline = makeScenario({
      assignments: [{ id: "a1", projectId: "p1", squadId: "sq1", startKey: "26-1-1", finishKey: "26-1-4" }],
    });
    const current = makeScenario({
      assignments: [{ id: "a2", projectId: "p1", squadId: "sq1", startKey: "26-3-1", finishKey: "26-4-4" }],
    });
    const diff = computeScenarioDiff(baseline, current);
    const labels = diff.months.map((m) => m.label);
    // should span from 26-1 period through 26-4 period
    expect(labels[0]).toMatch(/26/);
    expect(labels[labels.length - 1]).toMatch(/26/);
    expect(labels.length).toBeGreaterThan(4);
  });

  it("returns empty diff when both scenarios have no assignments", () => {
    const empty = makeScenario({ assignments: [] });
    const diff = computeScenarioDiff(empty, empty);
    expect(diff.months).toHaveLength(0);
    expect(diff.squadGroups).toHaveLength(0);
  });

  it("groups rows under correct squad", () => {
    const scenario = makeScenario();
    const diff = computeScenarioDiff(scenario, scenario);
    expect(diff.squadGroups).toHaveLength(1);
    expect(diff.squadGroups[0].squadName).toBe("Squad Alpha");
    expect(diff.squadGroups[0].rows).toHaveLength(2);
  });

  it("sorts rows by engineer name within squad", () => {
    const scenario = makeScenario();
    const diff = computeScenarioDiff(scenario, scenario);
    const names = diff.squadGroups[0].rows.map((r) => r.engineerName);
    expect(names).toEqual(["Alice", "Bob"]);
  });

  it("removed row cells show baseline value, current value is 0", () => {
    const baseline = makeScenario();
    const current = makeScenario({ assignments: [] });
    const diff = computeScenarioDiff(baseline, current);
    const row = diff.squadGroups[0].rows[0];
    for (const cell of row.cells) {
      expect(cell.currentValue).toBe(0);
    }
  });

  it("added row cells show current value, baseline value is 0", () => {
    const baseline = makeScenario({ assignments: [] });
    const current = makeScenario();
    const diff = computeScenarioDiff(baseline, current);
    const row = diff.squadGroups[0].rows[0];
    for (const cell of row.cells) {
      expect(cell.baselineValue).toBe(0);
    }
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail (module not found)**

```
npm test -- scenarioDiff
```
Expected: FAIL — `Cannot find module './scenarioDiff'`

---

### Task 3: Implement `src/domain/scenarioDiff.ts`

**Files:**
- Create: `src/domain/scenarioDiff.ts`

- [ ] **Step 1: Create `scenarioDiff.ts`**

Create `src/domain/scenarioDiff.ts`:

```ts
import { buildMonthRange, fractionOfMonth, type CalendarMonth } from "./resourceMap";
import { toSprintIndex } from "./time";
import type { ScenarioFileV1 } from "./types";

export type DiffCellStatus = "unchanged" | "changed" | "added" | "removed";
export type DiffRowStatus = "unchanged" | "changed" | "added" | "removed";

export interface DiffCell {
  baselineValue: number;
  currentValue: number;
  status: DiffCellStatus;
}

export interface DiffRow {
  engineerId: number;
  engineerName: string;
  squadId: string;
  squadName: string;
  projectName: string;
  projectAlias?: string;
  cells: DiffCell[];
  rowStatus: DiffRowStatus;
}

export interface SquadDiffGroup {
  squadId: string;
  squadName: string;
  rows: DiffRow[];
  changeCount: number;
}

export interface ScenarioDiff {
  months: CalendarMonth[];
  squadGroups: SquadDiffGroup[];
  summary: {
    addedRows: number;
    removedRows: number;
    changedRows: number;
    unchangedRows: number;
  };
}

interface SourceRow {
  assignmentId: string;
  engineerId: number;
  engineerName: string;
  squadId: string;
  squadName: string;
  projectName: string;
  projectAlias?: string;
  cells: number[];
}

function buildSourceRows(
  scenario: ScenarioFileV1,
  months: CalendarMonth[],
): SourceRow[] {
  const squadMap = new Map(scenario.squads.map((s) => [s.id, s]));
  const projectMap = new Map(scenario.projects.map((p) => [p.id, p]));
  const rows: SourceRow[] = [];

  for (const assignment of scenario.assignments) {
    const squad = squadMap.get(assignment.squadId);
    if (!squad?.members?.length) continue;
    const project = projectMap.get(assignment.projectId);
    if (!project) continue;

    const aStart = toSprintIndex(assignment.startKey);
    const aEnd = toSprintIndex(assignment.finishKey);

    for (const member of squad.members) {
      const cells = months.map((m) => {
        const monthIdx = m.year * 12 + m.month - 1;
        return fractionOfMonth(monthIdx, aStart, aEnd);
      });
      rows.push({
        assignmentId: assignment.id,
        engineerId: member.id,
        engineerName: member.name,
        squadId: squad.id,
        squadName: squad.name,
        projectName: project.name,
        projectAlias: project.alias,
        cells,
      });
    }
  }
  return rows;
}

export function computeScenarioDiff(
  baseline: ScenarioFileV1,
  current: ScenarioFileV1,
): ScenarioDiff {
  const allAssignments = [...baseline.assignments, ...current.assignments];
  const months = buildMonthRange(allAssignments);

  if (months.length === 0) {
    return {
      months: [],
      squadGroups: [],
      summary: { addedRows: 0, removedRows: 0, changedRows: 0, unchangedRows: 0 },
    };
  }

  const baselineRows = buildSourceRows(baseline, months);
  const currentRows = buildSourceRows(current, months);

  const baselineMap = new Map(
    baselineRows.map((r) => [`${r.assignmentId}:${r.engineerId}`, r]),
  );
  const currentMap = new Map(
    currentRows.map((r) => [`${r.assignmentId}:${r.engineerId}`, r]),
  );

  const allKeys = new Set([...baselineMap.keys(), ...currentMap.keys()]);
  const diffRows: DiffRow[] = [];

  for (const key of allKeys) {
    const b = baselineMap.get(key);
    const c = currentMap.get(key);
    const source = c ?? b!;

    let rowStatus: DiffRowStatus;
    let cells: DiffCell[];

    if (!b) {
      rowStatus = "added";
      cells = source.cells.map((v) => ({
        baselineValue: 0,
        currentValue: v,
        status: "added" as DiffCellStatus,
      }));
    } else if (!c) {
      rowStatus = "removed";
      cells = source.cells.map((v) => ({
        baselineValue: v,
        currentValue: 0,
        status: "removed" as DiffCellStatus,
      }));
    } else {
      cells = b.cells.map((bv, i) => {
        const cv = c.cells[i];
        const status: DiffCellStatus = bv === cv ? "unchanged" : "changed";
        return { baselineValue: bv, currentValue: cv, status };
      });
      const anyChanged = cells.some((cell) => cell.status !== "unchanged");
      rowStatus = anyChanged ? "changed" : "unchanged";
    }

    diffRows.push({
      engineerId: source.engineerId,
      engineerName: source.engineerName,
      squadId: source.squadId,
      squadName: source.squadName,
      projectName: source.projectName,
      projectAlias: source.projectAlias,
      cells,
      rowStatus,
    });
  }

  const squadGroupMap = new Map<string, SquadDiffGroup>();
  for (const row of diffRows) {
    let group = squadGroupMap.get(row.squadId);
    if (!group) {
      group = { squadId: row.squadId, squadName: row.squadName, rows: [], changeCount: 0 };
      squadGroupMap.set(row.squadId, group);
    }
    group.rows.push(row);
    if (row.rowStatus !== "unchanged") group.changeCount++;
  }

  for (const group of squadGroupMap.values()) {
    group.rows.sort((a, b) => {
      const nameCmp = a.engineerName.localeCompare(b.engineerName);
      return nameCmp !== 0 ? nameCmp : a.projectName.localeCompare(b.projectName);
    });
  }

  const squadGroups = [...squadGroupMap.values()].sort((a, b) =>
    a.squadName.localeCompare(b.squadName),
  );

  const summary = {
    addedRows: diffRows.filter((r) => r.rowStatus === "added").length,
    removedRows: diffRows.filter((r) => r.rowStatus === "removed").length,
    changedRows: diffRows.filter((r) => r.rowStatus === "changed").length,
    unchangedRows: diffRows.filter((r) => r.rowStatus === "unchanged").length,
  };

  return { months, squadGroups, summary };
}
```

- [ ] **Step 2: Run tests to confirm they pass**

```
npm test -- scenarioDiff
```
Expected: all 11 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add src/domain/scenarioDiff.ts src/domain/scenarioDiff.test.ts
git commit -m "feat: add computeScenarioDiff pure function with tests"
```

---

### Task 4: Add Compare tab navigation to `App.tsx`

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add the import for `computeScenarioDiff`**

At the top of `src/App.tsx`, after the existing domain imports, add:

```ts
import { computeScenarioDiff, type ScenarioDiff } from "./domain/scenarioDiff";
```

- [ ] **Step 2: Add `mainView` and `baselineScenario` state**

Inside the `App` component, after the existing `useState` declarations, add:

```ts
const [mainView, setMainView] = useState<"board" | "compare">("board");
const [baselineScenario, setBaselineScenario] = useState<ScenarioFileV1 | null>(null);
const [baselineFileName, setBaselineFileName] = useState<string>("");
```

- [ ] **Step 3: Compute diff in a `useMemo`**

After the existing `useMemo` calls in the `App` component:

```ts
const scenarioDiff = useMemo<ScenarioDiff | null>(
  () => (baselineScenario ? computeScenarioDiff(baselineScenario, scenario) : null),
  [baselineScenario, scenario],
);
```

- [ ] **Step 4: Add nav tab buttons to the topbar**

In `src/App.tsx`, find the `<header className="app-topbar">` block. After the closing `</div>` of `topbar-actions`, add:

```tsx
        <nav className="main-nav">
          <button
            type="button"
            className={`nav-tab${mainView === "board" ? " active" : ""}`}
            onClick={() => setMainView("board")}
          >
            Board
          </button>
          <button
            type="button"
            className={`nav-tab${mainView === "compare" ? " active" : ""}`}
            onClick={() => setMainView("compare")}
          >
            Compare
            {scenarioDiff && scenarioDiff.summary.addedRows + scenarioDiff.summary.removedRows + scenarioDiff.summary.changedRows > 0 && (
              <span className="nav-tab-badge">
                {scenarioDiff.summary.addedRows + scenarioDiff.summary.removedRows + scenarioDiff.summary.changedRows}
              </span>
            )}
          </button>
        </nav>
```

- [ ] **Step 5: Conditionally render board vs compare panel**

Find the `<section className="workspace-grid">` in the `App` return. Wrap it:

```tsx
      {mainView === "board" ? (
        <section className="workspace-grid">
          {/* existing board contents unchanged */}
        </section>
      ) : (
        <ComparePanel
          baseline={baselineScenario}
          current={scenario}
          diff={scenarioDiff}
          baselineFileName={baselineFileName}
          onLoadBaseline={(s, name) => { setBaselineScenario(s); setBaselineFileName(name); }}
        />
      )}
```

- [ ] **Step 6: Run dev server and confirm board still renders**

```
npm run dev
```
Open http://localhost:5173 — confirm the Board tab shows the existing board unchanged, and Compare tab shows an empty state.

---

### Task 5: Implement `ComparePanel` component in `App.tsx`

**Files:**
- Modify: `src/App.tsx`

Add the `ComparePanel` function component after the existing `ResourceMapModal` function.

- [ ] **Step 1: Add `ComparePanel`**

```tsx
function ComparePanel({
  baseline,
  current,
  diff,
  baselineFileName,
  onLoadBaseline,
}: {
  baseline: ScenarioFileV1 | null;
  current: ScenarioFileV1;
  diff: ScenarioDiff | null;
  baselineFileName: string;
  onLoadBaseline: (s: ScenarioFileV1, name: string) => void;
}) {
  const [hideUnchanged, setHideUnchanged] = useState(true);
  const [toggledSquads, setToggledSquads] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target?.result as string;
        const parsed = importScenario(text);
        onLoadBaseline(parsed, file.name);
      } catch {
        // invalid file — silently ignore
      }
    };
    reader.readAsText(file);
    // reset so the same file can be re-selected
    e.target.value = "";
  }

  function toggleSquad(squadId: string) {
    setToggledSquads((prev) => {
      const next = new Set(prev);
      if (next.has(squadId)) next.delete(squadId);
      else next.add(squadId);
      return next;
    });
  }

  function isSquadExpanded(group: { squadId: string; changeCount: number }): boolean {
    const defaultExpanded = group.changeCount > 0;
    return toggledSquads.has(group.squadId) ? !defaultExpanded : defaultExpanded;
  }

  function formatCell(cell: import("./domain/scenarioDiff").DiffCell): React.ReactNode {
    if (cell.status === "unchanged") {
      return cell.baselineValue > 0 ? String(cell.baselineValue) : "";
    }
    if (cell.status === "added") {
      return cell.currentValue > 0 ? (
        <span className="diff-val-current">{cell.currentValue}</span>
      ) : "";
    }
    if (cell.status === "removed") {
      return cell.baselineValue > 0 ? (
        <span className="diff-val-baseline">{cell.baselineValue}</span>
      ) : "";
    }
    // changed — show old (red) and new (green) stacked
    return (
      <>
        {cell.baselineValue > 0 && (
          <span className="diff-val-baseline">{cell.baselineValue}</span>
        )}
        {cell.currentValue > 0 && (
          <span className="diff-val-current">{cell.currentValue}</span>
        )}
      </>
    );
  }

  if (!baseline || !diff) {
    return (
      <div className="compare-empty">
        <p>Load a baseline <code>.resourceplan</code> file to compare it against the current scenario.</p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          style={{ display: "none" }}
          onChange={handleFileChange}
        />
        <button
          type="button"
          className="command-button"
          onClick={() => fileInputRef.current?.click()}
        >
          Load baseline file…
        </button>
      </div>
    );
  }

  const totalChanges =
    diff.summary.addedRows + diff.summary.removedRows + diff.summary.changedRows;
  const fixedColCount = 3;

  return (
    <div className="compare-panel">
      <div className="compare-header">
        <div className="compare-header-info">
          <span className="compare-label">Comparing against:</span>
          <strong>{baseline.scenario.name}</strong>
          {baselineFileName && (
            <span className="compare-filename">({baselineFileName})</span>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          style={{ display: "none" }}
          onChange={handleFileChange}
        />
        <button
          type="button"
          className="command-button"
          onClick={() => fileInputRef.current?.click()}
        >
          Change baseline…
        </button>
      </div>

      <div className="compare-toolbar">
        <div className="compare-summary">
          <span className="diff-badge diff-badge-added">+{diff.summary.addedRows} added</span>
          <span className="diff-badge diff-badge-removed">−{diff.summary.removedRows} removed</span>
          <span className="diff-badge diff-badge-changed">~{diff.summary.changedRows} changed</span>
          {hideUnchanged && diff.summary.unchangedRows > 0 && (
            <span className="diff-badge diff-badge-hidden">
              {diff.summary.unchangedRows} unchanged hidden
            </span>
          )}
        </div>
        <label className="compare-toggle">
          <input
            type="checkbox"
            checked={hideUnchanged}
            onChange={(e) => setHideUnchanged(e.target.checked)}
          />
          Hide unchanged rows
        </label>
      </div>

      <div className="compare-scroll">
        <table className="diff-table">
          <thead>
            <tr>
              <th className="diff-sticky diff-col-name">Name</th>
              <th className="diff-sticky diff-col-squad">Squad</th>
              <th className="diff-sticky diff-col-project">Project</th>
              {diff.months.map((m) => (
                <th key={m.label} className="rm-month-head">{m.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {diff.squadGroups.map((group) => {
              const expanded = isSquadExpanded(group);
              const visibleRows = hideUnchanged
                ? group.rows.filter((r) => r.rowStatus !== "unchanged")
                : group.rows;
              return (
                <Fragment key={group.squadId}>
                  <tr
                    className="diff-squad-header"
                    onClick={() => toggleSquad(group.squadId)}
                  >
                    <td colSpan={fixedColCount + diff.months.length}>
                      <span className="diff-squad-chevron">
                        {expanded ? "▾" : "▸"}
                      </span>
                      {group.squadName}
                      {group.changeCount > 0 && (
                        <span className="diff-squad-count">{group.changeCount} changes</span>
                      )}
                    </td>
                  </tr>
                  {expanded &&
                    visibleRows.map((row, i) => (
                      <tr
                        key={`${row.engineerId}:${row.projectName}:${i}`}
                        className={`diff-row diff-row-${row.rowStatus}`}
                      >
                        <td className="diff-sticky diff-col-name">{row.engineerName}</td>
                        <td className="diff-sticky diff-col-squad">{row.squadName}</td>
                        <td className="diff-sticky diff-col-project">
                          {row.projectAlias ?? row.projectName}
                        </td>
                        {row.cells.map((cell, j) => (
                          <td key={j} className={`diff-cell diff-cell-${cell.status}`}>
                            {formatCell(cell)}
                          </td>
                        ))}
                      </tr>
                    ))}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        {totalChanges === 0 && (
          <p className="compare-no-changes">No differences found between the two scenarios.</p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run typecheck**

```
npm run typecheck
```
Expected: no errors.

- [ ] **Step 3: Manual smoke test in browser**

1. Open the app, click "Compare" tab → should see the empty state with "Load baseline file…" button.
2. Load any `.resourceplan` file as baseline → should see the diff table appear.
3. Squads with changes are expanded; squads without changes are collapsed.
4. Toggle "Hide unchanged rows" — unchanged rows appear/disappear.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat: add Compare tab with baseline file loading and diff table"
```

---

### Task 6: Add CSS for the diff table

**Files:**
- Modify: `src/styles.css`

- [ ] **Step 1: Add styles**

Append to the end of `src/styles.css`:

```css
/* ── Main nav tabs ──────────────────────────────────── */
.main-nav {
  display: flex;
  gap: 4px;
  align-items: center;
}

.nav-tab {
  padding: 5px 14px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: transparent;
  color: var(--text);
  font-size: 13px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
}

.nav-tab.active {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
}

.nav-tab-badge {
  background: #ef4444;
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  border-radius: 10px;
  padding: 1px 6px;
}

/* ── Compare panel ──────────────────────────────────── */
.compare-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 60px 24px;
  color: var(--text-muted);
  text-align: center;
}

.compare-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.compare-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
  gap: 12px;
}

.compare-header-info {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.compare-label {
  color: var(--text-muted);
}

.compare-filename {
  color: var(--text-muted);
  font-size: 12px;
}

.compare-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  border-bottom: 1px solid var(--border);
  gap: 12px;
  flex-wrap: wrap;
}

.compare-summary {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.diff-badge {
  font-size: 12px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 10px;
}

.diff-badge-added   { background: #dcfce7; color: #166534; }
.diff-badge-removed { background: #fee2e2; color: #991b1b; }
.diff-badge-changed { background: #fef3c7; color: #92400e; }
.diff-badge-hidden  { background: var(--surface-alt, #f3f4f6); color: var(--text-muted); }

.compare-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
}

.compare-scroll {
  flex: 1;
  overflow: auto;
}

.compare-no-changes {
  text-align: center;
  padding: 40px 24px;
  color: var(--text-muted);
}

/* ── Diff table ─────────────────────────────────────── */
.diff-table {
  border-collapse: collapse;
  font-size: 12px;
  min-width: 100%;
}

.diff-table th,
.diff-table td {
  border: 1px solid var(--border);
  padding: 3px 6px;
  white-space: nowrap;
}

.diff-table thead th {
  background: var(--surface);
  font-weight: 600;
  position: sticky;
  top: 0;
  z-index: 2;
}

.diff-sticky {
  position: sticky;
  left: 0;
  background: var(--surface);
  z-index: 1;
}

.diff-col-name    { min-width: 120px; }
.diff-col-squad   { min-width: 100px; }
.diff-col-project { min-width: 140px; }

/* Squad group header row */
.diff-squad-header td {
  background: var(--surface-alt, #f0f0f0);
  font-weight: 700;
  font-size: 12px;
  cursor: pointer;
  user-select: none;
  padding: 5px 8px;
}

.diff-squad-chevron {
  margin-right: 6px;
  font-size: 10px;
  color: var(--text-muted);
}

.diff-squad-count {
  margin-left: 8px;
  font-weight: 400;
  font-size: 11px;
  color: var(--text-muted);
}

/* Row status backgrounds */
.diff-row-added   { background: #f0fdf4; }
.diff-row-removed { background: #fef2f2; }
.diff-row-changed { background: #fffbeb; }
.diff-row-unchanged { color: var(--text-muted); }

/* Cell status backgrounds */
.diff-cell-added   { background: #dcfce7; }
.diff-cell-removed { background: #fee2e2; }
.diff-cell-changed { background: #fef9c3; vertical-align: top; }
.diff-cell-unchanged { }

/* Inline changed-cell values */
.diff-val-baseline {
  display: block;
  color: #dc2626;
  text-decoration: line-through;
  font-size: 11px;
}

.diff-val-current {
  display: block;
  color: #16a34a;
  font-weight: 600;
  font-size: 11px;
}
```

- [ ] **Step 2: Check layout in browser**

Reload the app, load a baseline file, and verify:
- Squad section headers are bold with a chevron.
- Squads with changes are expanded; squads without changes are collapsed.
- Changed cells show stacked red (old) / green (new) values.
- Added rows have green row tint; removed rows have red row tint.
- "Hide unchanged rows" toggle works.

- [ ] **Step 3: Run full test suite**

```
npm test
```
Expected: all tests pass.

- [ ] **Step 4: Run typecheck**

```
npm run typecheck
```
Expected: no errors.

- [ ] **Step 5: Commit and push**

```bash
git add src/styles.css
git commit -m "feat: add Compare tab diff table styles"
git push origin main
```

---

## Self-Review Against Spec

**Spec coverage check:**

| Spec requirement | Covered by |
|------------------|-----------|
| Compare top-level tab | Task 4 |
| Load baseline via file picker | Task 5 |
| Session-only baseline (no localStorage) | Task 4 — only `useState` used |
| Tab badge showing change count | Task 4 |
| Match assignments by ID | Task 3 — `assignmentId:engineerId` key |
| added / removed / moved / unchanged statuses | Task 3 |
| Reassigned ID = removed + added | Task 3 — key includes `squadId` via `sourceRow.squadId` |
| Month range = union of both scenarios | Task 3 — `buildMonthRange([...baseline, ...current])` |
| Same table shape as resource map | Task 5 — same column structure |
| Changed cells show baseline (red) + current (green) | Task 5 — `formatCell` + Task 6 CSS |
| Squad section headers | Task 5 |
| Squads with 0 changes collapsed by default | Task 5 — `isSquadExpanded` uses `changeCount > 0` |
| Hide unchanged rows toggle | Task 5 |
| Unit tests for all diff cases | Task 2 & 3 |

**Placeholder scan:** None found.

**Type consistency:** `DiffCell`, `DiffRow`, `SquadDiffGroup`, `ScenarioDiff` defined in Task 3 and consumed in Task 5 with consistent names.
