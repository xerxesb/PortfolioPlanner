# AGENTS.md

## Project Overview

ResourcePlanner is a portfolio feasibility planning tool for sequencing multi-year programs of work against a finite engineering delivery pool. The first product target is a visual board where project lanes hold draggable/resizable squad commitment bars across calendar years, financial years, Product Increments, and sprint boundaries.

## Current State

- This repository is in concept/spec setup mode.
- There is no application stack yet.
- Before adding app code, create or update an implementation plan in `docs/superpowers/plans/`.

## Setup Commands

- Inspect repo status: `git status --short`
- List tracked files: `git ls-files`
- Find files/text: `rg --files` and `rg "<query>"`
- No dependency install command exists yet.
- No test command exists yet.

When a tech stack is introduced, update this file with exact install, dev-server, lint, typecheck, and test commands.

## Agentic Workflow

- Treat this file as the platform-agnostic source of truth for Codex, Claude Code, GitHub Copilot, and other coding agents.
- Read `docs/agentic/workflows.md` before starting feature work.
- Read `docs/superpowers/specs/2026-06-13-portfolio-feasibility-map-design.md` before implementing product behavior.
- Use short-lived branches or isolated worktrees for implementation work.
- Write or update tests with behavior changes once a test framework exists.
- Run the relevant verification commands before reporting completion.
- Do not rely on browser local storage as the only persistence mechanism for product scenarios.

## Product Constraints

- Main planning surface stays portfolio-level, not detailed work-package planning.
- The primary unit of manipulation is a whole squad commitment bar.
- Time addressing uses `YY-PI-SPRINT`, e.g. `26-4-3`.
- Each PI has four sprint positions: `1`, `2`, `3`, `4`.
- Calendar-year and financial-year overlays must both be visible in planning views.
- Scenario export/import must round-trip exactly via a native versioned file before stakeholder/staff-allocation export is added.

## Code Style

- Prefer small, focused modules with explicit boundaries.
- Keep data models versioned where persisted externally.
- Avoid hidden global state for planning calculations.
- Use deterministic calculations for feasibility/risk outputs so scenarios are reproducible.
- Keep UI interactions accessible by keyboard where practical.

## Testing Instructions

- Add tests for feasibility calculations, scenario import/export, and time-address parsing before or with implementation.
- Prefer pure functions for planning calculations so they are easy to test.
- For UI work, verify drag/resize behavior, snap-to-sprint behavior, and non-overlap rendering across desktop widths.
- Until a test runner exists, document manual verification steps in the PR description.

## PR Instructions

- Include a concise summary, verification commands, and screenshots or screen recordings for UI changes.
- Link the relevant spec or plan.
- Call out any changes to scenario file format, migration behavior, or planning assumptions.
- Keep unrelated refactors out of feature PRs.

## Security and Data Handling

- Treat scenario files as potentially sensitive planning data.
- Do not commit real staffing names, real program names, or confidential milestones.
- Use sample/anonymized data in tests, docs, screenshots, and fixtures.
