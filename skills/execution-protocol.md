---
name: execution-protocol
description: ZED Phase-Gate Execution Engine — 8 gates per phase, enforced complexity tiers
---

# ZED Phase-Gate Execution Engine

Every task passes through gates. The number of gates depends on complexity tier. No gate is skipped. No gate advances without the prior gate passing.

## Complexity Classification (FIRST STEP — ALWAYS)

Before any work, classify the task:

| Tier | Criteria | Gates Required |
|------|----------|---------------|
| Tier 1 (Simple) | <3 steps, single file, well-understood | Gates 0, 3, 4, 6 |
| Tier 2 (Medium) | 3-10 steps, multiple files, some unknowns | Gates 0, 1, 3, 4, 5, 6, 8 |
| Tier 3 (Complex) | 10+ steps, architecture change, unfamiliar tech | ALL 8 gates |

## Gate 0: RETRIEVE (Memory → Execution)

MUST happen before any other gate. Non-negotiable.

1. Run `zed_search` with 2-3 keywords from the task
2. If results found: run `zed_read_note` on top 2-3 matches
3. For Tier 2+: run `zed related <top-result>` via Bash to find connected knowledge
4. For Tier 3: also run `zed global-search <query>` via Bash for cross-project patterns
5. Load yesterday's daily note if doing multi-session work

**Output:** List of relevant prior knowledge that informs this task. If vault is empty or no matches, state that explicitly.

## Gate 1: PLAN (Informed by Memory)

Required for Tier 2 and Tier 3.

### Tier 2 Planning:
1. Standard: What needs to be done? (numbered steps)
2. Deep: Edge cases and dependencies?
3. Adversarial: What could go wrong?

### Tier 3 Planning (5-Level ULTRATHINK):
1. Standard: What needs to be done?
2. Deep: Edge cases, dependencies, ordering?
3. Adversarial: What could go wrong? How would I break this?
4. Meta: Is this the simplest approach? Am I overengineering?
5. Compound: What do I already know from the vault that applies here?

**For Tier 3:** Present the plan and wait for user approval before proceeding to Gate 2. Do NOT begin execution without explicit approval.

**Identify unknowns:** List anything the plan depends on that you're not sure about. These become Gate 2 research targets.

## Gate 2: RESEARCH (Fills Gaps Plan Identified)

Required for Tier 3. Optional for Tier 2 if unknowns were identified in Gate 1.

1. Search vault FIRST for each unknown — `zed_search` with specific terms
2. If vault has the answer, use it. Do NOT web search for things you already know.
3. For genuine unknowns: web search for best practices, documentation, approach comparisons
4. Save significant research findings to vault immediately via `zed_write_note`:
   - File: `research/YYYY-MM-DD-<topic-slug>.md`
   - Tags: `[research, <domain>]`
   - Include: what was searched, what was found, how it applies

**Output:** Updated plan with unknowns resolved.

## Gate 3: EXECUTE

1. Implement the plan (or directly execute for Tier 1)
2. Single-feature focus — do NOT touch unrelated code
3. For Tier 3: checkpoint every significant change (brief status update)

## Gate 4: SELF-ASSESS (Back-Pressure Checkpoint)

Required for all tiers (quick check for Tier 1, thorough for Tier 2+). This gate exists to catch problems BEFORE tests run — it's cheaper to fix issues found by re-reading than by debugging test failures.

### Tier 1:
- Does the output match what was asked?
- **Evidence**: State the original request and how the implementation satisfies it.

### Tier 2:
- Re-read the original request. Does the work match?
- Are there edge cases I missed?
- Did I violate any anti-patterns from the vault?
- **Evidence**: List each requirement and its corresponding implementation (file:line).

### Tier 3:
- Re-read the original request word by word. Does every requirement have a corresponding change?
- Check vault anti-patterns: did I repeat a known mistake?
- Check vault architecture notes: does this align with recorded architecture decisions?
- What would a hostile code reviewer flag?
- What assumptions am I making that could be wrong?
- Fix ALL identified gaps before proceeding.
- **Evidence**: Produce a compliance table mapping each requirement to implementation evidence.

## Gate 5: TEST (HARD BLOCKER — NO EXCEPTIONS)

Required for Tier 2 and Tier 3. This is a **back-pressure gate**: it BLOCKS all forward progress until tests pass.

1. Run all relevant tests
2. If tests fail: fix and re-run. Do NOT proceed with failing tests.
3. **HARD RULE**: You CANNOT advance to Gate 6 with ANY failing test. Not "we'll fix it later." Not "it's a flaky test." Fix it NOW or roll back the change that broke it.
4. For Tier 3: run the full test suite, not just related tests
5. For Tier 3: use the `zed-validator` agent for adversarial review
6. If no tests exist for the changed code: write at least one test that validates the change before proceeding

**Output:** Test results (pass/fail counts) as evidence. Copy the actual test output — do not summarize "tests pass" without evidence. If all pass, proceed. If any fail, fix and re-test.

**Back-pressure rationale:** Tests are the single highest-leverage quality mechanism. Without hard test gates, Claude writes plausible-looking code that silently fails in practice. The gate forces self-verification.

## Gate 6: CAPTURE (Execution → Memory)

Required for all tiers.

### Tier 1:
- Append brief summary to daily note: `zed daily "summary"`
- If a non-obvious decision was made: `zed_decide`

### Tier 2:
- All Tier 1 captures, plus:
- Any decision between alternatives → `zed_decide` (MANDATORY)
- Any pattern that worked → `zed_write_note` with `[pattern]` tag
- Any pattern that failed → `zed_write_note` with `[anti-pattern]` tag

### Tier 3:
- All Tier 2 captures, plus:
- Architecture understanding → `zed_write_note` to `architecture/`
- Research findings → already captured in Gate 2
- Link all new notes to existing vault nodes with `[[wikilinks]]`

## Gate 7: DOCUMENT

Required for Tier 3 only.

1. Update any documentation affected by the changes
2. Check vault for notes that reference the changed area — update them
3. For architecture changes: create or update architecture diagram description
4. Cross-reference: find overlapping workflows and ensure consistency

## Gate 8: HANDOFF

Required for Tier 2+ in evolve mode. Optional otherwise.

Write or update the handoff with:
1. What was accomplished (file:line references)
2. Current state (tests pass/fail, build status)
3. Immediate next action (ONE specific thing with file path)
4. What was captured to vault (list of notes written)
5. "Next Session" items (if end of session)

---

## Phase-Gate in Evolve Mode

When running in evolve mode, EVERY iteration follows this exact sequence:

1. Re-read objective (scope anchor)
2. Re-read handoff from previous iteration
3. Gate 0: RETRIEVE — search vault for relevant context
4. Gate 1: PLAN — plan this iteration's unit of work
5. Gate 2: RESEARCH — fill knowledge gaps (vault first, then web)
6. Gate 3: EXECUTE — implement
7. Gate 4: SELF-ASSESS — compare against objective and original prompt
8. Gate 5: TEST — run tests, fix failures
9. Gate 6: CAPTURE — save knowledge to vault
10. Gate 7: DOCUMENT — update affected docs
11. Gate 8: HANDOFF — write structured handoff for next iteration
12. `zed loop-tick "summary"` — advance iteration counter
13. Identify what the NEXT iteration should work on (prevents premature stopping)

The blocking Stop hook enforces Gates 6 and 8 mechanically.
