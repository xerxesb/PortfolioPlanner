# Milestone Markers in Project Resourcing Table — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a red inset border + hover tooltip to every resourcing table cell whose sprint key matches a project milestone's `dateKey`, across Cumulative coverage, Milestone coverage, and Per-sprint allocation tabs.

**Architecture:** Purely presentational — no domain logic changes. Two CSS rules are added to `styles.css`. Cell rendering in `ProjectCumulativeView` and `ProjectSprintView` in `App.tsx` gains a milestone detection local variable and a conditional class + tooltip child element. No new props, types, or domain functions.

**Tech Stack:** React, TypeScript, CSS (no new libraries)

**Spec:** `docs/superpowers/specs/2026-06-14-milestone-markers-in-resourcing-table-design.md`

---

### Task 1: Add CSS for milestone cell border and tooltip

**Files:**
- Modify: `src/styles.css` (after the `.capacity-cell` rules, around line 840)

- [ ] **Step 1: Locate the insertion point**

Open `src/styles.css`. Find the comment `/* ─── Project resourcing panel ─────────────────────────────────────── */` (around line 840). The new rules go immediately before that comment.

- [ ] **Step 2: Insert the two new rules**

Add after the `.capacity-cell.overbooked` block and before the resourcing panel comment:

```css
.capacity-cell--milestone {
  position: relative;
  box-shadow: inset 0 0 0 2px var(--danger);
}

.cell-milestone-tooltip {
  display: none;
  position: absolute;
  top: calc(100% + 4px);
  left: 50%;
  transform: translateX(-50%);
  background: #1e293b;
  color: white;
  font-size: 10px;
  font-weight: 400;
  line-height: 1.6;
  padding: 6px 10px;
  border-radius: 6px;
  min-width: 180px;
  white-space: nowrap;
  z-index: 30;
  pointer-events: none;
}

.capacity-cell--milestone:hover .cell-milestone-tooltip {
  display: block;
}
```

- [ ] **Step 3: Verify no lint errors**

```bash
cd /Users/xbattiwalla/src/ResourcePlanner && npm run lint 2>&1 | tail -5
```

Expected: no errors (CSS is not linted by eslint; this confirms the JS/TS side is unaffected).

- [ ] **Step 4: Commit**

```bash
git add src/styles.css
git commit -m "style: add milestone cell border and tooltip CSS"
```

---

### Task 2: Update ProjectCumulativeView to mark milestone cells

**Files:**
- Modify: `src/App.tsx` — the `ProjectCumulativeView` function's inner timeline map (around line 1808)

The current cell rendering for a project row in `ProjectCumulativeView` looks like this:

```tsx
{timeline.map((key) => {
  const cell = heatmap.byProject[project.id]?.[key];
  if (!cell) return <div className={`capacity-cell resourcing-unresourced${key === selectedSprintKey ? " col-selected" : ""}`} key={key} />;
  const inlineStyle = milestoneMode ? milestoneCellStyle(cell) : undefined;
  const statusClass = (milestoneMode && inlineStyle) ? "" : ` resourcing-${cell.status}`;
  return (
    <div
      className={`capacity-cell${statusClass}${key === selectedSprintKey ? " col-selected" : ""}`}
      style={inlineStyle}
      key={key}
    >
      {cell.percent > 0 ? `${Math.round(cell.percent)}%` : ""}
    </div>
  );
})}
```

- [ ] **Step 1: Replace the cell rendering block in ProjectCumulativeView**

Replace the entire `{timeline.map((key) => { ... })}` block inside `ProjectCumulativeView`'s `scenario.projects.map` with:

```tsx
{timeline.map((key) => {
  const cell = heatmap.byProject[project.id]?.[key];
  const milestonesHere = project.milestones.filter((m) => m.dateKey === key);
  const milestoneClass = milestonesHere.length > 0 ? " capacity-cell--milestone" : "";
  const milestoneTooltip = milestonesHere.length > 0 ? (
    <span className="cell-milestone-tooltip">
      {milestonesHere.map((m) => (
        <span key={m.id} style={{ display: "block" }}>◆ {m.name} · {m.requiredPercent}% required</span>
      ))}
    </span>
  ) : null;
  if (!cell) return (
    <div className={`capacity-cell resourcing-unresourced${milestoneClass}${key === selectedSprintKey ? " col-selected" : ""}`} key={key}>
      {milestoneTooltip}
    </div>
  );
  const inlineStyle = milestoneMode ? milestoneCellStyle(cell) : undefined;
  const statusClass = (milestoneMode && inlineStyle) ? "" : ` resourcing-${cell.status}`;
  return (
    <div
      className={`capacity-cell${statusClass}${milestoneClass}${key === selectedSprintKey ? " col-selected" : ""}`}
      style={inlineStyle}
      key={key}
    >
      {cell.percent > 0 ? `${Math.round(cell.percent)}%` : ""}
      {milestoneTooltip}
    </div>
  );
})}
```

- [ ] **Step 2: Run existing tests to confirm no regressions**

```bash
cd /Users/xbattiwalla/src/ResourcePlanner && npm test 2>&1 | tail -10
```

Expected: all tests pass (no domain logic changed).

- [ ] **Step 3: Run typecheck**

```bash
npm run typecheck 2>&1 | tail -10
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat: add milestone cell markers to ProjectCumulativeView"
```

---

### Task 3: Update ProjectSprintView to mark milestone cells

**Files:**
- Modify: `src/App.tsx` — the `ProjectSprintView` function's inner timeline map (around line 1870)

The current cell rendering for a project row in `ProjectSprintView`:

```tsx
{timeline.map((key) => {
  const cell = heatmap.byProject[project.id]?.[key];
  if (!cell) return <div className={`capacity-cell resourcing-unresourced${key === selectedSprintKey ? " col-selected" : ""}`} key={key} />;
  return (
    <div className={`capacity-cell resourcing-${cell.status}${key === selectedSprintKey ? " col-selected" : ""}`} key={key}>
      {cell.fteSprints > 0 ? cell.fteSprints : "–"}
    </div>
  );
})}
```

- [ ] **Step 1: Replace the cell rendering block in ProjectSprintView**

Replace the entire `{timeline.map((key) => { ... })}` block inside `ProjectSprintView`'s `scenario.projects.map` with:

```tsx
{timeline.map((key) => {
  const cell = heatmap.byProject[project.id]?.[key];
  const milestonesHere = project.milestones.filter((m) => m.dateKey === key);
  const milestoneClass = milestonesHere.length > 0 ? " capacity-cell--milestone" : "";
  const milestoneTooltip = milestonesHere.length > 0 ? (
    <span className="cell-milestone-tooltip">
      {milestonesHere.map((m) => (
        <span key={m.id} style={{ display: "block" }}>◆ {m.name} · {m.requiredPercent}% required</span>
      ))}
    </span>
  ) : null;
  if (!cell) return (
    <div className={`capacity-cell resourcing-unresourced${milestoneClass}${key === selectedSprintKey ? " col-selected" : ""}`} key={key}>
      {milestoneTooltip}
    </div>
  );
  return (
    <div className={`capacity-cell resourcing-${cell.status}${milestoneClass}${key === selectedSprintKey ? " col-selected" : ""}`} key={key}>
      {cell.fteSprints > 0 ? cell.fteSprints : "–"}
      {milestoneTooltip}
    </div>
  );
})}
```

- [ ] **Step 2: Run existing tests to confirm no regressions**

```bash
cd /Users/xbattiwalla/src/ResourcePlanner && npm test 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **Step 3: Run typecheck**

```bash
npm run typecheck 2>&1 | tail -10
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat: add milestone cell markers to ProjectSprintView"
```

---

### Task 4: Visual verification in browser

- [ ] **Step 1: Open the app**

Navigate to `http://127.0.0.1:5174/PortfolioPlanner/` and scroll to the Project resourcing panel.

- [ ] **Step 2: Check Cumulative coverage tab**

In the Cumulative coverage tab, verify that cells at milestone sprint positions (e.g. sprint `26-2-1` for Program Orion if a milestone is set there) display a red inset border. Cells without milestones should be unchanged.

- [ ] **Step 3: Check Milestone coverage tab**

Switch to Milestone coverage. Confirm the same milestone cells have the red border.

- [ ] **Step 4: Check Per-sprint allocation tab**

Switch to Per-sprint allocation. Confirm milestone cells have the red border.

- [ ] **Step 5: Check Team capacity tab**

Switch to Team capacity. Confirm no red borders appear (squad rows, no milestones).

- [ ] **Step 6: Hover tooltip**

Hover over a milestone-marked cell. Confirm a dark tooltip appears showing `◆ [Milestone Name] · [N]% required`.

- [ ] **Step 7: Final commit of docs**

```bash
cd /Users/xbattiwalla/src/ResourcePlanner && git add docs/superpowers/specs/2026-06-14-milestone-markers-in-resourcing-table-design.md docs/superpowers/plans/2026-06-14-milestone-markers-in-resourcing-table.md
git commit -m "docs: add milestone markers in resourcing table spec and plan"
```
