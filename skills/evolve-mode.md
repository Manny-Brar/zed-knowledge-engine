---
name: evolve-mode
description: ZED Evolve Mode — autonomous improvement loops with cron scheduling, ULTRATHINK task selection, scope-hard-lock, continuous research, and blocking enforcement
---

# ZED Evolve Mode

Evolve mode runs structured autonomous loops toward a stated objective. Each iteration follows the full Phase-Gate Engine (see execution-protocol skill). Cron mode adds a 3-minute recurring cycle between iterations.

## Starting an Evolve Loop

When `/evolve "objective"` is invoked:

1. Run `zed loop-init "objective"` — creates `_loop/objective.md` + `_loop/progress.md`
2. If `--cron` flag present, activate cron state file via `evolve-cron.sh start`
3. **Initialization iteration (iteration 0):**
   - Do NOT implement anything
   - Analyze the objective using 5-level ULTRATHINK planning
   - Decompose into ordered units of work
   - Identify which vault knowledge applies
   - **Establish the SCOPE BOUNDARY**: List ALL files and directories that are in-scope for this objective. Write this to `_loop/scope-boundary.md`. No file outside this boundary may be edited without explicit re-authorization.
   - Write the decomposition to `_loop/handoff.md`
   - This becomes the roadmap for all subsequent iterations
4. Begin iteration cycle

## Each Iteration

### Pre-Iteration Scope Check (MANDATORY — NO EXCEPTIONS)

Before ANY gate processing:
1. Re-read `_loop/objective.md` — anchor on the exact goal
2. Re-read `_loop/scope-boundary.md` — confirm which files/dirs are in-scope
3. Re-read `_loop/handoff.md` — what did the last iteration leave for us?
4. If ANY of these files are missing, STOP and reconstruct them before proceeding

### Phase-Gate Engine

Follow the Phase-Gate Engine exactly:
- Gate 0: RETRIEVE (search vault)
- Gate 1: PLAN (one unit of work from the decomposition)
- Gate 2: RESEARCH (vault first, then web for unknowns)
- Gate 3: EXECUTE
- Gate 4: SELF-ASSESS (against objective AND original prompt)

**Excellence checkpoint**: Before proceeding to Gate 5, ask:
- Is this implementation the simplest correct solution?
- Would I be proud to show this code to someone I respect?
- Are there any shortcuts I took that I'd regret in a week?
If any answer is no, fix it now. Not in the next iteration. Now.

- Gate 5: TEST
- Gate 6: CAPTURE (mandatory — blocking hook enforces this)
- Gate 7: DOCUMENT
- Gate 8: HANDOFF (mandatory — blocking hook enforces this)

### Post-Iteration: ULTRATHINK Next Task Selection (MANDATORY)

After Gate 8, before advancing the iteration counter, you MUST run 5-Level ULTRATHINK to select the next task. This is NOT optional — it is what keeps the loop on-target and prevents drift.

**Level 1 — Standard Analysis:**
- What units of work remain from the iteration 0 decomposition?
- What gaps were revealed by THIS iteration's work?
- What did tests expose?

**Level 2 — Deep Analysis:**
- What edge cases are unhandled in the code written so far?
- What error paths are untested or silently swallowed?
- What inputs could cause unexpected behavior?
- What dependencies could fail and how does the code handle that?

**Level 3 — Adversarial Analysis:**
- If I were a malicious user, how would I break this?
- What injection vectors exist (SQL, command, XSS, path traversal)?
- What authentication/authorization gaps exist?
- What data validation is missing?
- What race conditions or concurrency issues could arise?

**Level 4 — Meta Analysis (DRIFT CHECK):**
- Does the selected next task DIRECTLY serve the original objective?
- Am I gold-plating or over-engineering?
- Is this the HIGHEST IMPACT action I could take right now?
- Would the user who started this loop recognize this task as relevant?
- Re-read the objective one more time. Is this task in the objective's scope? YES/NO — if NO, discard and pick again.

**Level 5 — Compound Analysis:**
- What did I learn from vault knowledge that changes my approach?
- What patterns from previous iterations should I reuse or avoid?
- What compound improvements can I make (fixing A also fixes B)?

**Output**: A single, specific next task with:
- What to do (one sentence)
- Which file(s) to touch (must be within scope-boundary)
- Why this is the highest-impact next action
- How it serves the objective (complete the scope-lock sentence)

### Cron Cycle (when --cron is active)

After completing an iteration and selecting the next task:
1. Write the selected next task to `_loop/handoff.md`
2. Run `zed loop-tick "summary"` to advance the counter
3. Sleep for 180 seconds (`sleep 180` via Bash)
4. After waking, check if `_loop/cron-state.json` still has `"active": true`
   - If yes: begin next iteration at the Pre-Iteration Scope Check
   - If no: stop gracefully (user issued `--stop`)

## Continuous Auto-Research Protocol

Research is NOT triggered by failure. It is part of every iteration.

Each iteration MUST include:
1. **Vault search** for the current unit of work — what patterns/decisions/anti-patterns apply?
2. **Best practices check** — a targeted web search for the specific technique being used
3. **Research capture** — save any significant finding to `research/` in the vault

This is what makes evolve mode compound. Each iteration generates knowledge that future iterations can use.

## Scope Hard-Lock (ENFORCED — NOT ADVISORY)

This is not a guideline. This is a hard constraint. Violation triggers immediate circuit breaker.

### Rule 1: Action Justification
Before EVERY file edit, complete this sentence:
> "This action achieves [EXACT OBJECTIVE TEXT] by [specific mechanism]."

If you cannot complete it with the EXACT objective text (not a paraphrase, not a generalization), the action is OUT OF SCOPE. Do NOT take it.

### Rule 2: File Boundary
Only files listed in `_loop/scope-boundary.md` may be edited. To add a file:
1. Explain why it's necessary
2. Show how it serves the objective
3. Add it to scope-boundary.md BEFORE editing it

### Rule 3: Forbidden Actions During Evolve
These actions are NEVER permitted during an evolve loop unless the objective EXPLICITLY requires them:
- Installing new packages or dependencies
- Modifying CI/CD, build configs, or deployment scripts
- Creating new top-level directories
- Changing project-wide settings or configuration
- Refactoring code that works correctly and isn't part of the objective
- Adding features not described in the objective
- Changing coding style or formatting of files you didn't change for the objective

### Rule 4: Task Category Lock
Every iteration's task MUST fall into one of these categories (the "improvement spiral"):
1. **IMPLEMENT** — Build a unit of work from the decomposition
2. **FIX** — Fix a bug or gap found in previously implemented work
3. **TEST** — Add or improve test coverage for implemented work
4. **HARDEN** — Security hardening, input validation, error handling
5. **OPTIMIZE** — Performance improvement of implemented code
6. **DOCUMENT** — Document the implemented changes

If a proposed task doesn't fit any of these categories, it is out of scope. Discard it and pick one that fits.

## Drift Detection

The blocking Stop hook calculates a drift score (0-10):
- Edit count > 30: +2, > 20: +1
- File spread > 8: +2, > 5: +1
- Iteration count > 10: +2, > 5: +1

Score >= 7 triggers circuit breaker — you must re-read the objective and confirm alignment before continuing.

**Enhanced drift signals (checked by ULTRATHINK Level 4):**
- Editing a file not in scope-boundary.md → DRIFT (score +3)
- Cannot complete the scope-lock sentence → DRIFT (score +3)
- Task doesn't fit a category from Rule 4 → DRIFT (score +2)
- Two consecutive iterations with no test runs → DRIFT (score +2)

## "Identify Next" Protocol (Prevents Premature Stopping)

After completing each iteration, BEFORE writing the handoff, ask:

1. Is the objective fully met? If no → next iteration works on the gap.
2. If yes, are tests comprehensive? Edge cases covered? → if no, next iteration adds tests.
3. If yes, is performance acceptable? → if no, next iteration optimizes.
4. If yes, is security hardened? Input validated? Auth checked? Error paths handled? → if no, next iteration hardens.
5. If yes, is documentation complete? → if no, next iteration documents.
6. If yes, are there improvement opportunities a senior engineer would pursue? → if yes, next iteration implements.
7. If ALL are satisfied, THEN the objective is truly complete.
8. **Excellence audit**: Look at everything built so far in this evolve loop. Is it production quality? Would a senior engineer at a top company approve every line? If not, the next iteration fixes quality — not features.
9. **If ALL 8 checks pass AND you genuinely believe a senior engineer would ship this with confidence**, then the objective is truly complete.

The bar is not "does it work?" The bar is "is it excellent?"

This is what keeps the loop running. "Done" means "a senior engineer would ship this to production with confidence."

**In cron mode**: Even after the objective is met, the loop continues checking every 3 minutes for:
- Regression detection (re-run tests)
- Security scan (re-check for vulnerabilities)
- Code quality audit (lint, complexity, duplication)
Until the user issues `/evolve --stop`.

## Self-Assessment

Every 3rd iteration, write a self-assessment to `_loop/assessment-N.md`:
1. Percentage toward objective completion
2. Measurable improvement since last assessment
3. Was drift avoided? (reference scope-boundary.md)
4. Should we continue, pivot, or stop?
5. What's the single most impactful next action?
6. **Scope compliance score**: How many actions this cycle were within scope? (target: 100%)
7. **Security posture**: What hardening has been done? What remains?

## Resuming (`/evolve --resume`)

1. Read `_loop/objective.md` — re-ground on the goal
2. Read `_loop/scope-boundary.md` — re-establish file boundaries
3. Read `_loop/handoff.md` — pick up where last iteration left off
4. Read `_loop/progress.md` — understand what's been done
5. Read any `_loop/assessment-*.md` files — check for pivot decisions
6. Check `_loop/cron-state.json` — if cron was active, re-activate the cycle
7. Continue from the handoff's "Immediate Next Action"
