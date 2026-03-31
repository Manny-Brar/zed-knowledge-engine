---
name: evolve-mode
description: ZED Evolve Mode — autonomous improvement loops with continuous research, scope lock, and blocking enforcement
---

# ZED Evolve Mode

Evolve mode runs structured autonomous loops toward a stated objective. Each iteration follows the full Phase-Gate Engine (see execution-protocol skill).

## Starting an Evolve Loop

When `/evolve "objective"` is invoked:

1. Run `zed loop-init "objective"` — creates `_loop/objective.md` + `_loop/progress.md`
2. **Initialization iteration (iteration 0):**
   - Do NOT implement anything
   - Analyze the objective using 5-level planning
   - Decompose into ordered units of work
   - Identify which vault knowledge applies
   - Write the decomposition to `_loop/handoff.md`
   - This becomes the roadmap for all subsequent iterations
3. Begin iteration cycle

## Each Iteration

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

## Continuous Auto-Research Protocol

Research is NOT triggered by failure. It is part of every iteration.

Each iteration MUST include:
1. **Vault search** for the current unit of work — what patterns/decisions/anti-patterns apply?
2. **Best practices check** — a targeted web search for the specific technique being used
3. **Research capture** — save any significant finding to `research/` in the vault

This is what makes evolve mode compound. Each iteration generates knowledge that future iterations can use.

## Scope Lock

Before every action, complete this sentence:
> "This action achieves [objective] by [mechanism]."

If you cannot complete the sentence, the action is out of scope. Do NOT do it.

## Drift Detection

The blocking Stop hook calculates a drift score (0-10):
- Edit count > 30: +2, > 20: +1
- File spread > 8: +2, > 5: +1
- Iteration count > 10: +2, > 5: +1

Score >= 7 triggers circuit breaker — you must re-read the objective and confirm alignment before continuing.

## "Identify Next" Protocol (Prevents Premature Stopping)

After completing each iteration, BEFORE writing the handoff, ask:

1. Is the objective fully met? If no → next iteration works on the gap.
2. If yes, are tests comprehensive? Edge cases covered? → if no, next iteration adds tests.
3. If yes, is performance acceptable? → if no, next iteration optimizes.
4. If yes, is security hardened? → if no, next iteration hardens.
5. If yes, is documentation complete? → if no, next iteration documents.
6. If yes, are there improvement opportunities a senior engineer would pursue? → if yes, next iteration implements.
7. If ALL are satisfied, THEN the objective is truly complete.
8. **Excellence audit**: Look at everything built so far in this evolve loop. Is it production quality? Would a senior engineer at a top company approve every line? If not, the next iteration fixes quality — not features.
9. **If ALL 8 checks pass AND you genuinely believe a senior engineer would ship this with confidence**, then the objective is truly complete.

The bar is not "does it work?" The bar is "is it excellent?"

This is what keeps the loop running overnight. "Done" means "a senior engineer would ship this to production with confidence."

## Self-Assessment

Every 3rd iteration, write a self-assessment to `_loop/assessment-N.md`:
1. Percentage toward objective completion
2. Measurable improvement since last assessment
3. Was drift avoided?
4. Should we continue, pivot, or stop?
5. What's the single most impactful next action?

## Resuming (`/evolve --resume`)

1. Read `_loop/objective.md` — re-ground on the goal
2. Read `_loop/handoff.md` — pick up where last iteration left off
3. Read `_loop/progress.md` — understand what's been done
4. Read any `_loop/assessment-*.md` files — check for pivot decisions
5. Continue from the handoff's "Immediate Next Action"
