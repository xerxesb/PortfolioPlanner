# Scenario Diff Design

**Date:** 2026-06-14
**Status:** Approved

## Problem

After shuffling bookings in a scenario, the planner needs to know exactly what changed compared to a saved baseline before actioning updates in Planisware. Planisware is resource-centric (one booking per person), so the diff must be expressed at the individual engineer level.

## Goals

- Load a baseline `.resourceplan` JSON file for comparison against the currently-loaded scenario.
- Show a diff table in the same shape as the Resource Map TSV: month columns across the top, engineer × project rows down the side.
- Highlight changed cells inline — old value in red, new value in green — so the planner can read off exactly what to update per person per project per month.
- Squads/engineers with no changes are hidden by default to reduce noise.

## Non-Goals

- Persisting the baseline across sessions (session-only state).
- Exporting the diff to CSV/Excel (future work).
- Diffing project target dates, squad capacity, or milestone definitions.
- Three-way or multi-scenario comparison.

---

## Entry Point

A **"Compare"** top-level tab is added to the main navigation bar alongside the existing board view.

- When no baseline is loaded the tab shows an empty state with a single **"Load baseline file…"** file-input button (accepts `.json` / `.resourceplan`).
- Once loaded, a header bar shows: `Comparing: <scenario.name> (<filename>)` with a **"Change baseline…"** button.
- Baseline is held in React state only — it is not written to `localStorage` and is cleared on page refresh.
- The tab badge shows a change count once a baseline is loaded (e.g. `Compare (14 changes)`).

---

## Diff Computation

### Matching strategy

Assignments are matched **by `id`** across baseline and current scenario.

| Status | Condition |
|--------|-----------|
| `unchanged` | Same `id`, same `startKey`, `finishKey`, `projectId`, `squadId` |
| `moved` | Same `id`, same `projectId` + `squadId`, but `startKey` or `finishKey` differs |
| `added` | `id` exists only in current scenario |
| `removed` | `id` exists only in baseline |
| `reassigned` | Same `id` but different `squadId` or `projectId` — treated as `removed` from old squad/project and `added` to new one |

### Cell-level diff

Diff is computed at **engineer × project × calendar month** granularity using the same `buildResourceMapRows` allocation fraction logic as the existing Resource Map.

The month column range spans the union of all assignments in both baseline and current — i.e. from the earliest `startKey` to the latest `finishKey` across both files.

For each (engineer, project, month) cell:
- Compute `baselineValue` from baseline rows (0 if row doesn't exist in baseline).
- Compute `currentValue` from current rows (0 if row doesn't exist in current).
- If `baselineValue === currentValue`: cell is **unchanged**.
- If `baselineValue !== currentValue`: cell is **changed** — show both values.

A row is **unchanged** if every cell in it is unchanged.

Project and squad names are resolved from whichever file contains them (union of both files).

---

## Panel Layout

### Header bar (once baseline loaded)
```
Comparing: Baseline Q3 2026 (baseline.resourceplan.json)   [Change baseline…]
```

### Summary strip
```
+12 added rows · −3 removed rows · ~7 rows with changes · 42 unchanged rows hidden
```
"Rows" here means engineer × project combinations.

### Table

Same column structure as the Resource Map TSV:

| Engineer | Squad | Project | Jul-26 | Aug-26 | Sep-26 | … |
|----------|-------|---------|--------|--------|--------|---|

**Row grouping:** Squad section headers (bold, spanning all columns) → engineer × project data rows within each squad, sorted by engineer name then project name.

**Cell rendering:**
- **Unchanged cell:** plain value (e.g. `1.0`), no colour. If value is `0` in both, cell is blank.
- **Changed cell:** two stacked values — baseline value in red with strikethrough above, current value in green below.
- **Added row cell** (row exists only in current): green background, current value shown.
- **Removed row cell** (row exists only in baseline): red background, baseline value shown with strikethrough.
- **Blank cell** (both values 0): empty.

Example changed cell:
```
~~0.5~~   ← red (baseline)
 1.0      ← green (current)
```

**Squad section header:** `Squad Alpha  •  3 changes` — collapsed by default if zero changes, expanded by default if any changes.

### Controls

- **"Hide unchanged rows"** toggle (default: on) — hides rows where every cell is identical. Toggling off shows all rows in grey.
- **"Hide unchanged squads"** toggle (default: on) — collapses squad sections with zero changes.

---

## Data Model

New pure function in `src/domain/scenarioDiff.ts`:

```ts
export type DiffCellStatus = "unchanged" | "added" | "removed" | "changed";

export interface DiffCell {
  baselineValue: number;   // 0–1 allocation fraction
  currentValue: number;    // 0–1 allocation fraction
  status: DiffCellStatus;
}

export interface DiffRow {
  engineerId: number;
  engineerName: string;
  squadId: string;
  squadName: string;
  projectId: string;
  projectName: string;
  projectAlias?: string;
  cells: DiffCell[];       // one per month, same length as months array
  rowStatus: "unchanged" | "added" | "removed" | "changed";
}

export interface ScenarioDiff {
  months: CalendarMonth[];
  squadGroups: {
    squadId: string;
    squadName: string;
    rows: DiffRow[];
    changeCount: number;
  }[];
  summary: {
    addedRows: number;
    removedRows: number;
    changedRows: number;
    unchangedRows: number;
  };
}

export function computeScenarioDiff(
  baseline: ScenarioFileV1,
  current: ScenarioFileV1,
): ScenarioDiff
```

`computeScenarioDiff` is a pure function with no side effects, making it straightforward to unit-test.

---

## Files Affected

| File | Change |
|------|--------|
| `src/domain/scenarioDiff.ts` | New — pure diff computation function |
| `src/domain/scenarioDiff.test.ts` | New — unit tests |
| `src/App.tsx` | Add Compare tab, baseline file state, render diff panel |
| `src/styles.css` | Add diff table styles (`.diff-table`, `.diff-cell-changed`, `.diff-cell-added`, `.diff-cell-removed`) |

---

## Test Cases

- Two identical scenarios → all cells unchanged, summary shows 0 changes.
- Assignment date shifted → affected engineer × project cells show red/green, unchanged months blank.
- Assignment removed → all cells for that row are red (removed row).
- Assignment added → all cells for that row are green (added row).
- Engineer added to squad in current → new rows appear as added.
- Engineer removed from squad in current → old rows appear as removed.
- Reassigned booking (same id, different squad) → removed row under old squad, added row under new squad.
