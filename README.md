# ResourcePlanner

ResourcePlanner is an early-stage portfolio feasibility planning tool for resource managers sequencing multi-year programs against a finite engineering delivery pool.

The approved first concept is a visual portfolio map:

- project lanes across calendar years, financial years, Product Increments, and sprints
- whole-squad commitment bars that can be moved and resized
- feasibility warnings for milestone risk, overbooking, idle capacity, and resource gaps
- a secondary team capacity heatmap
- exact round-trip scenario export/import via a native file format

## Repository Status

This repo currently contains product and agentic workflow documentation only. No app stack has been selected yet.

## Key Documents

- Agent instructions: `AGENTS.md`
- Agentic workflow: `docs/agentic/workflows.md`
- Platform notes: `docs/agentic/platforms.md`
- Product design spec: `docs/superpowers/specs/2026-06-13-portfolio-feasibility-map-design.md`
- Scenario file concept: `docs/product/scenario-format.md`

## Current Verification

There are no automated tests yet because no application code exists. Once a stack is selected, update `AGENTS.md` with exact setup, dev, lint, typecheck, and test commands.
