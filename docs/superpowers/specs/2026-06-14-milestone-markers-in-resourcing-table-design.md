# Milestone Markers in Project Resourcing Table — Design Spec

**Date:** 2026-06-14  
**Status:** Approved

## Problem

The project resourcing table (all tabs) shows coverage data by sprint, but gives no indication of where a project's milestones fall. To answer "am I green at the milestone?" the user must mentally cross-reference the board view above, find the milestone diamond, then locate the same sprint column in the table below.

## Goal

Mark every cell in a project's resourcing row whose sprint key matches a milestone's `dateKey` with a visible red border (using the existing `var(--danger)` color). A hover tooltip reveals the milestone name, required %, and sprint key. This applies across all three project-row tabs; the squad-only Team capacity tab is excluded.

## Visual Treatment

A new CSS class `capacity-cell--milestone` is added to any cell where `project.milestones` contains at least one milestone with `dateKey === sprintKey`:

```css
.capacity-cell--milestone {
  position: relative;
  box-shadow: inset 0 0 0 2px var(--danger);
}
```

- `box-shadow: inset` keeps the 2px border inside the cell bounds — no effect on grid column widths.
- The cell's existing background color (unresourced, in-progress, complete, at-risk, over, etc.) and text content render unchanged inside the border.
- All milestones are shown simultaneously (not just the next upcoming one).

## Tooltip

A `<span className="cell-milestone-tooltip">` is rendered inside each milestone-marked cell. It is hidden by default and shown on hover via CSS (same pattern as `.info-tooltip`).

Content format (one line per milestone at that sprint):

```
◆ Integration check · 30% required
◆ Regulatory submission · 60% required
```

If only one milestone lands on the sprint, only one line appears. If two or more milestones share the same sprint, all are listed. The tooltip does not repeat the sprint key (it is already visible in the column header).

CSS (new rule in `styles.css`):

```css
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

The tooltip is centered on the cell (`left: 50%; transform: translateX(-50%)`) so it does not clip on narrow columns near the left edge.

## Scope

| Tab | Component | Milestone markers |
|-----|-----------|-------------------|
| Cumulative coverage | `ProjectCumulativeView` | Yes |
| Milestone coverage | `ProjectCumulativeView` | Yes |
| Per-sprint allocation | `ProjectSprintView` | Yes |
| Team capacity | `TeamCapacityGrid` | No — squad rows, no project milestones |

## Data Flow

No new props, domain functions, or types are needed.

Both `ProjectCumulativeView` and `ProjectSprintView` already receive the full `scenario` object, which contains `project.milestones`. For each `(project, sprintKey)` cell:

```ts
const milestonesHere = project.milestones.filter(m => m.dateKey === key);
const isMilestoneCell = milestonesHere.length > 0;
```

If `isMilestoneCell`:
- Append `capacity-cell--milestone` to the cell's `className`.
- Render a `<span className="cell-milestone-tooltip">` inside the cell containing one line per milestone.

## Edge Cases

| Scenario | Behaviour |
|----------|-----------|
| Project has no milestones | No markers, no change to rendering |
| Two milestones on the same sprint | One border; tooltip lists both milestones |
| Milestone outside the view timeline | Not rendered (sprint key not in grid) |
| Unresourced cell (grey background) | Red border still visible against grey |
| `at-risk` cell (red background) | Red border visible; slightly less contrast but still distinguishable via the inset shadow edge |

## Acceptance Criteria

1. In the Cumulative coverage tab, each cell in a project row whose sprint matches a milestone `dateKey` has a 2px `var(--danger)` inset border.
2. Same behaviour in the Milestone coverage and Per-sprint allocation tabs.
3. Team capacity tab is unchanged.
4. Hovering a milestone-marked cell shows a tooltip with milestone name(s) and required %.
5. Projects with no milestones have no markers in any tab.
6. Two milestones on the same sprint produce one bordered cell with both listed in the tooltip.
7. All existing tests pass; no new unit tests required (purely presentational change with no new domain logic).
