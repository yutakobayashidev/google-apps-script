# Agent Guidelines

Always prefer simplicity over pathological correctness. YAGNI, KISS, DRY. No backward-compat shims or fallback paths unless they come free without adding cyclomatic complexity.

## Pre-Commit Doc Check

Before committing, verify that the following docs reflect your changes:

- `README.md` - update if architecture, commands, or feature lists changed
- `AGENTS.md` - update if agent-facing instructions or context changed
- `CLAUDE.md` - update if Claude Code instructions changed
- `docs/` - update any related documentation

Skip if the change has no doc impact.

## Workflow Orchestration

- Plan non-trivial tasks before implementation.
- If something goes sideways, stop and re-plan immediately.
- Track work in `z-ai/todo.md` and add a review section before finishing.
- Update `z-ai/lessons.md` after user corrections.

## Apps Script Monorepo Context

- This repo uses `pnpm` workspaces under `apps/*`.
- Use `clasp` for local Apps Script source control, pulls, pushes, versions, and deployments.
- Do not commit `.clasp.json` or `.clasprc.json`; they contain project/user-specific identifiers or OAuth state.
- Each app workspace should keep Apps Script source and `appsscript.json` in its package directory.
