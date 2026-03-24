---
description: Run a self-improvement loop toward a stated objective
---

Parse the arguments from "$ARGUMENTS" to determine the action:

- A quoted objective string starts a new loop (e.g., `/evolve "harden test suite"`)
- `--resume` continues an interrupted loop
- `--status` checks current progress
- `--stop` gracefully shuts down the loop
- `--max N` caps the number of iterations (used with an objective)

---

## Start New Loop

When a quoted objective is provided:

1. Announce: **"ZED: Evolve mode — [objective]"**
2. Run `zed loop-init "[objective]"` via the Bash tool. If `--max N` was specified, add the flag: `zed loop-init "[objective]" --max N`.
3. Begin the first iteration following the evolve-mode skill (`skills/evolve-mode/SKILL.md`).
4. At the end of each iteration, present a brief status line:
   ```
   Iteration [N] complete — [one-line summary of what changed]
   ```
5. Continue to the next iteration automatically. Default behavior is to run until stopped or the objective is met. If `--max N` was set, stop after N iterations.

## Resume

When `--resume` is specified:

1. Run `zed loop-status --json` via the Bash tool to get current state.
2. Read the handoff file first (most recent context):
   - Run: `cat ~/.zed-data/vault/_loop/handoff.md` via Bash
3. Read the objective:
   - Run: `cat ~/.zed-data/vault/_loop/objective.md` via Bash
4. If features.json exists, check what's next:
   - Run: `zed loop-next --json` via Bash
5. Announce: **"ZED: Resuming evolve — [objective] (iteration N)"**
6. Follow the Phase-Gate Engine for the next iteration, starting with Gate 0 (RETRIEVE).

## Status

When `--status` is specified:

1. Run `zed loop-status` via the Bash tool.
2. Display clearly:
   - **Objective**: the loop goal
   - **Iteration**: current / max (or "unlimited")
   - **Last progress entry**: most recent iteration summary
   - **Assessment**: self-assessment summary if one has been run

## Stop

When `--stop` is specified:

1. Run `zed loop-stop "user requested stop"` via the Bash tool.
2. Run `zed loop-promote` via the Bash tool to move findings to vault.
3. Write a session summary: `zed daily "Evolve loop stopped. [N] iterations completed."` via Bash.
4. Announce completion with:
   - Total iterations completed
   - Features completed (if features.json was used)
   - Knowledge captured count
