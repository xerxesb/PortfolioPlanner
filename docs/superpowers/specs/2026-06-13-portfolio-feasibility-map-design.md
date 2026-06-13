# Portfolio Feasibility Map Design

## Purpose

Resource managers need to sequence several programs of work over five to six years using a finite pool of engineers, testers, delivery leads, project managers, and related roles. The first product concept is a visual portfolio feasibility map that helps make the big picture fit before detailed staff allocation planning begins.

## Approved Direction

Build a portfolio-level sequencing workspace. The main view shows projects as lanes and whole-squad commitments as movable/resizable bars. The user can move squads across Product Increments and sprint boundaries to test whether milestone dates and finite capacity can fit.

The tool should help answer:

- Can the current portfolio fit with the squads available?
- Which milestones are at risk?
- Which squads are overbooked or idle?
- Where is the approximate resource gap?
- What changed between scenario options?

## Time Model

The board shows multiple calendar overlays:

- Calendar year: project planning context.
- Financial year: resource planning context, assumed July to June unless configured.
- Product Increment: the main portfolio planning bucket.
- Sprint: the snap point inside each PI.

Sprint addresses use:

```text
YY-PI-SPRINT
```

Example:

```text
26-4-3
```

This means Calendar Year 2026, PI 4, Sprint 3.

Each PI has four sprint positions: `1`, `2`, `3`, `4`.

## Primary Interaction

The user manipulates whole squad commitment bars, not individual people and not separate cells.

- Drag a bar to shift a squad commitment in time.
- Resize a bar to change start or end sprint.
- Bars snap to sprint boundaries.
- Bars remain visually large enough to feel like portfolio-level commitments.
- The app recalculates feasibility after each change.

## Main View

The main view contains:

- project lanes
- calendar-year header
- financial-year header
- PI header
- sprint header
- squad commitment bars
- milestone markers
- risk/compression markers

The main view should remain project-level. Do not show detailed work-package bars by default.

## Secondary Capacity View

A secondary team capacity heatmap shows the same time grid from the squad perspective.

It should show:

- committed capacity
- idle capacity
- overbooked capacity
- partial availability when commitments start or end within a PI

This view is diagnostic, not the primary manipulation surface.

## Feasibility Summary

The summary panel should call out:

- red or amber milestone gates
- approximate squad-PI or FTE-year gap
- idle squad capacity
- conflicting assignments
- recovery hints when simple options are available

Risk language should be understandable to a portfolio/resource manager, not just a developer.

## Demand and Capacity Model

The first version treats squads as the planning unit.

- Named people exist underneath squads but are not individually scheduled in the portfolio view.
- Capacity is initially squad-based.
- Skill fit is not a hard scheduling model in version one, but the data model should allow eligibility tags or future scarce-skill checks.
- Project effort is rough high-level FTE-years.
- Projects may have milestone dates for integration, clinical, regulatory, launch, and similar gates.

## Persistence

The first persistence feature is exact round-trip scenario export/import.

- Use a native versioned scenario file.
- Persist projects, squads, milestones, assignments, calendar settings, scenario metadata, and risk settings.
- Do not rely only on browser storage.
- Do not build staff allocation export in the first version.

## Non-Goals

- Detailed person-level allocation planning.
- Staff allocation table export.
- Spreadsheet import/export.
- Detailed work-package scheduling in the main board.
- Arbitrary day/week-level planning.
- Automated black-box optimization as the primary interface.

## Open Implementation Decisions

- Frontend technology stack.
- Exact feasibility calculation formula.
- Whether scenario files use `.json` or a custom extension wrapping JSON.
- How much sample data ships with the app.
- How milestones with real dates map onto sprint addresses.

## Visual Reference

The brainstorming mockups are local-only and ignored by git under `.superpowers/brainstorm/`. The approved latest mockup was named:

```text
portfolio-feasibility-map-v6-sprint-with-capacity.html
```
