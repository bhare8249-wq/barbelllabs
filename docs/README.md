# /docs — Project Documentation

This folder contains reference documents for working on Barbell Labs.

## Files

### `SYNC-UP.md`
**Read this first when starting a Claude Code session.** It explains the workflow between the strategy chat and Claude Code, asks Code for a sync report on current codebase state, and tells Code what's coming next without prematurely starting it.

### `master-list.md`
**Reference list of all 226 items in the roadmap.** Use this for context when working on prompted tasks — to avoid duplicating completed work, spot bundling opportunities, and avoid closing off planned future architecture.

**Do not execute from this list.** Brian provides focused per-task prompts from the strategy chat. The master list is awareness, not execution.

## Workflow

1. Brian opens a Claude Code session and points Code at `/docs/SYNC-UP.md`
2. Code generates a sync report on current state
3. Brian brings the report back to strategy chat
4. Strategy chat generates a focused prompt for the next task
5. Brian pastes that prompt into Code
6. Code executes
7. Code syncs back to Brian
8. Repeat

## Maintenance

- `master-list.md` is updated by the strategy chat as items are added/completed/refined
- `SYNC-UP.md` is updated when major workflow changes occur
- Brian drops updated versions into this folder periodically
