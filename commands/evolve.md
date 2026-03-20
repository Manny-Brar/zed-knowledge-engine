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

1. Run `zed loop-status` via the Bash tool.
2. Read `_loop/objective.md` and `_loop/progress.md` from the vault to restore context.
3. Announce: **"ZED: Resuming evolve — [objective] (iteration N)"**
4. Continue from the next iteration where the loop left off.

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
2. Run `zed loop-promote` via the Bash tool to promote any persistence-worthy findings.
3. Announce completion and summarize:
   - Total iterations completed
   - Key changes made
   - Knowledge captured and promoted
