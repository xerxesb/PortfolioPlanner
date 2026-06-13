# Agentic Development Workflow

This repository is prepared for agentic development across Codex, Claude Code, GitHub Copilot, and other coding agents. `AGENTS.md` is the shared source of truth; platform-specific files should only point back to it unless they need genuinely platform-specific setup.

## Operating Principles

- Keep instructions platform-agnostic by default.
- Keep the root `AGENTS.md` concise and operational.
- Put detailed product context, implementation plans, and workflow guidance in linked docs.
- Make every implementation task trace back to a spec or plan.
- Prefer explicit verification evidence over claims of completion.

## Standard Flow

1. Read `AGENTS.md`.
2. Read the relevant product spec in `docs/superpowers/specs/`.
3. For feature work, create or update a plan in `docs/superpowers/plans/`.
4. Work on a branch or isolated worktree.
5. Make small, reviewable commits.
6. Add or update tests with behavior changes once a test framework exists.
7. Run relevant verification commands.
8. Open a PR using `.github/PULL_REQUEST_TEMPLATE.md`.

## Development Superpowers Mapping

Use these workflow capabilities when available in the current agent platform:

- `superpowers:brainstorming`: use before changing product behavior or UX direction.
- `superpowers:writing-plans`: use after a spec is approved and before implementation.
- `superpowers:using-git-worktrees`: use before implementation when isolation is needed.
- `superpowers:test-driven-development`: use for feature and bugfix implementation.
- `superpowers:systematic-debugging`: use before fixing bugs or unexpected behavior.
- `superpowers:verification-before-completion`: use before claiming work is done.
- `superpowers:requesting-code-review`: use before merging substantial changes.
- `superpowers:finishing-a-development-branch`: use when implementation is complete and verified.

If a platform does not have these exact skills, follow the equivalent workflow manually.

## Documentation Rules

- Product decisions belong in `docs/superpowers/specs/` or `docs/product/`.
- Implementation plans belong in `docs/superpowers/plans/`.
- Platform compatibility notes belong in `docs/agentic/platforms.md`.
- Root `AGENTS.md` should link to deeper docs instead of duplicating them.

## Verification Rules

No application stack exists yet. Until one does:

- Verify documentation changes with `git diff --check`.
- Verify repository state with `git status --short`.
- Inspect created files with `rg --files`.

Once a stack exists, add exact commands to `AGENTS.md` and require agents to run relevant checks before completion.
