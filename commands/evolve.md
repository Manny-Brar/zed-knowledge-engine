---
description: Run a self-improvement loop toward a stated objective
---

Parse the arguments from "$ARGUMENTS" to determine the action:

- A quoted objective string starts a new loop (e.g., `/evolve "harden test suite"`)
- `--resume` continues an interrupted loop
- `--status` checks current progress
- `--stop` gracefully shuts down the loop
- `--max N` caps the number of iterations (used with an objective)
- `--cron` enables recurring cron mode: after each iteration completes, waits 3 minutes then automatically starts the next iteration. Runs until `--stop` is issued. Combines with `--max N`.

---

## Start New Loop

When a quoted objective is provided:

1. Announce: **"ZED: Evolve mode — [objective]"**
   - If `--cron` was specified, also announce: **"Cron mode: 3-minute recurring cycle active"**
2. Run `zed loop-init "[objective]"` via the Bash tool. If `--max N` was specified, add the flag: `zed loop-init "[objective]" --max N`.
3. If `--cron` was specified, run `"${CLAUDE_PLUGIN_ROOT}/scripts/evolve-cron.sh" start "[objective]"` via Bash to activate the cron state file.
4. Begin the first iteration following the evolve-mode skill (`skills/evolve-mode/SKILL.md`).
5. At the end of each iteration, present a brief status line:
   ```
   Iteration [N] complete — [one-line summary of what changed]
   ```
6. **ULTRATHINK Next Task Selection** (MANDATORY after every iteration):
   Use 5-Level ULTRATHINK planning to determine the next task. You MUST think through:
   - Level 1 (Standard): What gaps remain vs the objective?
   - Level 2 (Deep): What edge cases, security holes, or test gaps exist?
   - Level 3 (Adversarial): What would a hostile reviewer or attacker find wrong?
   - Level 4 (Meta): Am I drifting from the original objective? Is this the highest-impact next action?
   - Level 5 (Compound): What did I learn from previous iterations that applies here?
   The next task MUST directly serve the original objective. If it doesn't, reject it and pick one that does.
7. **Cron mode**: After completing an iteration and selecting the next task, wait 3 minutes (`sleep 180` via Bash) before starting the next iteration. During the wait, the system is idle. After the wait, automatically begin the next iteration at Gate 0.
8. **Non-cron mode**: Continue to the next iteration immediately. Default behavior is to run until stopped or the objective is met. If `--max N` was set, stop after N iterations.

## Scope Lock Protocol (ALL MODES)

Before EVERY action in the evolve loop, you MUST pass these checks:

1. **Objective Anchor**: Re-read `~/.zed-data/vault/_loop/objective.md` at the start of every iteration. Not every 3rd. Every single one.
2. **Action Justification**: Complete this sentence before any file edit: "This action achieves [objective] by [mechanism]." If you cannot complete it, DO NOT take the action.
3. **Drift Firewall**: The following are NEVER in scope during an evolve loop, regardless of what the analysis suggests:
   - Adding new features not described in the objective
   - Refactoring code unrelated to the objective
   - Changing project configuration, CI/CD, or build systems unless the objective explicitly requires it
   - Installing new dependencies unless directly required by the objective
   - Modifying files outside the scope of the original task's file set (established in iteration 0 decomposition)
4. **Hard Boundary**: If the ULTRATHINK analysis suggests the objective is 100% met AND all 9 checks from the "Identify Next" protocol pass, THEN and ONLY THEN may the loop end. Otherwise, the next task MUST be one of:
   - Fixing a gap or bug found in existing work
   - Adding missing test coverage
   - Hardening security (input validation, error handling, auth checks)
   - Improving performance of implemented code
   - Strengthening error handling and edge cases

## Resume

When `--resume` is specified:

1. Run `zed loop-status --json` via the Bash tool to get current state.
2. Read the handoff file first (most recent context):
   - Run: `cat ~/.zed-data/vault/_loop/handoff.md` via Bash
3. Read the objective:
   - Run: `cat ~/.zed-data/vault/_loop/objective.md` via Bash
4. If features.json exists, check what's next:
   - Run: `zed loop-next --json` via Bash
5. Check if cron state is active:
   - Run: `cat ~/.zed-data/vault/_loop/cron-state.json 2>/dev/null` via Bash
   - If cron mode was active, re-activate it and announce: **"ZED: Resuming evolve with cron mode — [objective] (iteration N)"**
6. Announce: **"ZED: Resuming evolve — [objective] (iteration N)"**
7. Follow the Phase-Gate Engine for the next iteration, starting with Gate 0 (RETRIEVE).
8. If cron mode is active, resume the 3-minute cycle after each iteration.

## Status

When `--status` is specified:

1. Run `zed loop-status` via the Bash tool.
2. Display clearly:
   - **Objective**: the loop goal
   - **Iteration**: current / max (or "unlimited")
   - **Cron mode**: active/inactive (with next run time if active)
   - **Last progress entry**: most recent iteration summary
   - **Assessment**: self-assessment summary if one has been run

## Stop

When `--stop` is specified:

1. If cron mode is active, run `"${CLAUDE_PLUGIN_ROOT}/scripts/evolve-cron.sh" stop` via Bash to deactivate it.
2. Run `zed loop-stop "user requested stop"` via the Bash tool.
3. Run `zed loop-promote` via the Bash tool to move findings to vault.
4. Write a session summary: `zed daily "Evolve loop stopped. [N] iterations completed."` via Bash.
5. Announce completion with:
   - Total iterations completed
   - Features completed (if features.json was used)
   - Knowledge captured count
   - Cron mode status: deactivated
