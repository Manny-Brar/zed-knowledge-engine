---
description: Drift guard and self-improvement loop mechanics for ZED Evolve mode. Defines scope locking, iteration cycles, drift testing, self-assessment, and completion protocols. Referenced by the behavior-controller when Evolve mode is active.
---

## ZED Evolve Mode — Loop Mechanics

Evolve mode runs a structured, scope-locked self-improvement loop. Every iteration is anchored to an objective. Drift is detected and rejected in real time.

---

### Scope Lock (Non-Negotiable)

At the start of EVERY iteration, before any work, read:

```
_loop/objective.md
```

This file defines what you are trying to achieve. It is the only source of truth for scope. If you cannot connect your next action to this objective, you are drifting.

---

### Drift Test

Before each action within an iteration, complete this sentence:

> "This action achieves [objective] by [mechanism]."

Rules:
- The objective must come directly from `_loop/objective.md`
- The mechanism must be a direct causal link, not a chain of "this leads to that which leads to..."
- If you cannot complete the sentence, the action is OUT OF SCOPE

When drift is detected:
1. Log it: "Drift detected: [proposed action] does not directly serve [objective]."
2. Do not execute the action.
3. Re-read `_loop/objective.md`.
4. Re-plan from the current state toward the objective.

---

### Iteration Cycle

Each iteration follows this exact sequence:

1. **Re-ground**: Read `_loop/objective.md`. Re-internalize the scope.
2. **Status check**: Read `_loop/progress.md`. Understand what is done and what is next.
3. **Plan one unit**: Scope a single, concrete unit of work that serves the objective. Do not plan multiple units — plan one, execute one.
4. **Execute**: Do the work. Apply the drift test before each significant action within the unit.
5. **Record**: Update progress via `zed loop-tick "what was done"`.
6. **Scope check**: Review what you just did. Did it serve the objective? If not, note the deviation and correct course on the next iteration.

---

### Self-Assessment

Every N iterations, pause and assess. Default N is 3. This is configurable via the `self_assess_every` field in `_loop/objective.md` frontmatter.

Assessment questions (answer all five):

1. What percentage of the objective is complete? Base this on concrete deliverables, not feelings.
2. What has improved measurably since the last assessment? Cite specific artifacts, metrics, or outcomes.
3. What scope drift was tempting but avoided? Name the distractions.
4. Should this loop **continue**, **pivot**, or **stop**?
   - Continue: objective is on track, progress is measurable
   - Pivot: objective is valid but approach needs to change
   - Stop: objective is met, blocked, or no longer relevant
5. If continuing, what is the single most important thing to do next?

Write the assessment to:

```
_loop/assessment-{iteration_number}.md
```

---

### Completion

When the objective is met OR max iterations are reached (defined in `_loop/objective.md` frontmatter as `max_iterations`):

1. **Stop the loop**: Run `zed loop-stop "reason"` with a clear explanation of why the loop is ending (objective met, max iterations, diminishing returns, blocked).
2. **Promote findings**: Run `zed loop-promote` to move valuable findings from `_loop/` scratch space into proper vault notes. This ensures transient loop artifacts become permanent knowledge.
3. **Final summary**: Write a summary to the daily note via `zed daily "summary"`. Include: objective, iterations run, key outcomes, notes promoted.

---

### Resume Protocol

When resuming a previous loop via `/evolve --resume`:

1. Read ALL files in `_loop/`:
   - `objective.md` — the goal
   - `progress.md` — what has been done
   - `assessment-*.md` — all prior assessments
2. Reconstruct full context from these files. Do not ask the user to re-explain.
3. Determine the current iteration number from `progress.md`.
4. Continue the iteration cycle from the next planned unit of work.

If `_loop/` is empty or missing, inform the user: "No active loop found. Use `/evolve` with a new objective to start one."

---

### Rules

1. The objective file is sacred. Do not modify it during a loop unless the user explicitly requests a pivot.
2. One unit of work per iteration. Do not batch. Small iterations catch drift early.
3. Never skip the drift test. It exists because drift is the default failure mode of autonomous loops.
4. Assessments are honest. If progress is stalling, say so. The point is improvement, not the appearance of improvement.
5. When in doubt, stop. A loop that runs too long without progress wastes more than it produces.
