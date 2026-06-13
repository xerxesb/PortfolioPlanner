# Portfolio Scenario Planner

Portfolio Scenario Planner is an early-stage portfolio feasibility planning tool for resource managers sequencing multi-year programs against a finite engineering delivery pool.

The approved first concept is a visual portfolio map:

- project lanes across calendar years, financial years, Product Increments, and sprints
- whole-squad commitment bars that can be moved and resized
- feasibility warnings for milestone risk, overbooking, idle capacity, and resource gaps
- a secondary team capacity heatmap
- exact round-trip scenario export/import via a native file format

## Repository Status

The first browser-based MVP is implemented as a Vite + React + TypeScript app. It includes sample portfolio data, sprint-snapped assignment bars, feasibility calculations, a team capacity heatmap, minimal editors, and `.resourceplan.json` scenario import/export.

## Running Locally

```bash
npm install
npm run dev
```

The dev server prints the local URL, usually `http://127.0.0.1:5173`.

## Key Documents

- Agent instructions: `AGENTS.md`
- Agentic workflow: `docs/agentic/workflows.md`
- Platform notes: `docs/agentic/platforms.md`
- Product design spec: `docs/superpowers/specs/2026-06-13-portfolio-feasibility-map-design.md`
- Scenario file concept: `docs/product/scenario-format.md`

## Current Verification

```bash
npm test
npm run typecheck
npm run lint
npm run build
npm run test:e2e
```
