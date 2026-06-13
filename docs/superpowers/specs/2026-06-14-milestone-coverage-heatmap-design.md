# Milestone Coverage Heatmap — Design Spec

**Date:** 2026-06-14  
**Status:** Approved

## Problem

The existing "Cumulative coverage" view shows progress as a percentage of the *total project effort*. This makes it hard to read whether you're on track to hit a near-term milestone that only requires a fraction of the total effort (e.g. 30% for a regulatory submission gate).

## Goal

A new "Milestone coverage" tab in the Project Resourcing panel that shows, for each sprint, what percentage of the *next upcoming milestone's required effort* has been resourced — giving a direct answer to "am I on track for my next gate?"

## Algorithm

For each `(project, sprint key k)` cell:

1. Sort the project's milestones by `dateKey` ascending.
2. Find the **active milestone** = first milestone where `dateKey >= k`.
3. Compute `requiredFteSprints`:
   - Active milestone exists: `effortFteYears × 16 × (milestone.requiredPercent / 100)`
   - No active milestone (all past, or no milestones at all): `effortFteYears × 16` (full effort — same denominator as cumulative view)
4. `percent = (cumulativeFteSprints up to k) / requiredFteSprints × 100`
5. Status (same rules as cumulative):
   - `over` if percent > 100
   - `complete` if percent === 100
   - `at-risk` if percent < 100 and `k > project.targetFinishKey`
   - `in-progress` if percent > 0
   - `unresourced` if percent === 0

**Reading the view:** Once you cross ≥100% for a milestone, the next sprint flips to the following milestone as the active one, resetting the denominator. The % drops back below 100% (unless you've also fully covered the next milestone already).

## Display

- New **"Milestone coverage"** tab in `ProjectResourcingPanel`, between "Cumulative coverage" and "Per-sprint allocation".
- Tooltip: _"Shows cumulative resourcing as a % of the next upcoming milestone's required effort. Once a milestone is covered (≥100%), the denominator switches to the next milestone. Falls back to total project effort when no future milestones remain."_
- Cell rendering: reuses the same `ProjectCumulativeView` component — the output type is identical to `ProjectCumulativeHeatmap`.

## Data Types

No new types needed. `calculateProjectMilestoneCoverageHeatmap` returns `ProjectCumulativeHeatmap` (same shape as `calculateProjectCumulativeHeatmap`).

## Acceptance Criteria

1. A "Milestone coverage" tab appears in the Project Resourcing panel.
2. For a project with an upcoming milestone at 30% required, cells before the milestone date show percent relative to 30% of total effort.
3. Once 30% is covered, cells after the milestone date show percent relative to the next milestone (or 100% of total if none remain).
4. For a project with no milestones, the view is identical to the cumulative view.
5. `at-risk` status fires when past `targetFinishKey` with percent < 100.
6. All existing tests pass; new unit tests cover the milestone coverage calculation.
