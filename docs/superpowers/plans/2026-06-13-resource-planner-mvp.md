# ResourcePlanner MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first interactive portfolio feasibility map for sequencing squad commitments against milestone and capacity constraints.

**Architecture:** Use a React + TypeScript browser SPA with pure domain modules for time keys, scenario validation, and feasibility calculations. Keep scenario persistence file-based with exact `.resourceplan.json` round-tripping.

**Tech Stack:** Vite, React, TypeScript, Vitest, React Testing Library, Playwright, Zod, lucide-react.

---

## Completed Scope

- [x] Scaffold Vite + React + TypeScript app and tooling.
- [x] Implement `YY-PI-SPRINT` time-key parsing, ordering, duration, fiscal-year labeling, and timeline generation.
- [x] Implement versioned scenario validation/import/export for `.resourceplan.json` files.
- [x] Implement deterministic feasibility calculations for milestone status, squad conflicts, idle capacity, and resource gaps.
- [x] Add anonymized sample scenario data.
- [x] Build portfolio sequencing board with CY/FY/PI/sprint headers.
- [x] Build whole-squad assignment bars with pointer drag/resize and keyboard movement.
- [x] Build feasibility summary, team capacity heatmap, minimal editors, and scenario import/export controls.
- [x] Add unit/component/e2e coverage for the core workflow.

## Verification

Run:

```bash
npm test
npm run typecheck
npm run lint
npm run build
npm run test:e2e
```

Expected:

- Unit/component tests pass.
- TypeScript build passes.
- ESLint exits cleanly.
- Production build succeeds.
- Playwright loads the app and exports a `.resourceplan.json` file.

## Deferred Work

- Staff-level allocation export.
- Spreadsheet import/export.
- Hosted persistence or accounts.
- Automated optimization/solver recommendations.
- Richer skill-fit constraints beyond squad eligibility.
