# Platform Notes

This repo should work across Codex, Claude Code, GitHub Copilot, and other coding agents. The goal is one shared project instruction set, not divergent per-agent rule files.

## Shared Standard

- `AGENTS.md` is the canonical instruction file.
- Root-level platform files should point to `AGENTS.md` rather than duplicate project rules.
- If platform-specific setup becomes necessary, document only the platform-specific delta in the platform file.

## Codex

- Codex should read `AGENTS.md` directly.
- Use local tool verification and repo docs before implementation.
- For frontend changes, verify visually with the available browser tooling when possible.

## Claude Code

- `CLAUDE.md` points Claude Code back to `AGENTS.md`.
- Shared rules belong in `AGENTS.md`, not `CLAUDE.md`.
- If Claude-only command shortcuts are added later, keep them in `CLAUDE.md` and link to the shared docs.

## GitHub Copilot

- `.github/copilot-instructions.md` points Copilot back to `AGENTS.md`.
- PRs should use `.github/PULL_REQUEST_TEMPLATE.md`.
- Issue templates should capture enough acceptance criteria for background agents to work safely.

## Adding Another Agent Platform

When adding support for another platform:

1. Keep `AGENTS.md` as the canonical source.
2. Add the smallest possible platform-specific pointer file.
3. Do not copy large sections of `AGENTS.md`.
4. Update this file with any platform-specific behavior that future agents need to know.
