---
description: ZED Operational Protocol — MANDATORY session-injected procedure. Loaded at session start. Treat as hard instructions, not suggestions.
---

# ZED Operational Protocol v1.0

## 1. Boot Sequence

On every session start, execute these five steps in order:

1. CHECK vault existence at `~/.zed-data/vault/` — if absent, run `/zed:onboarding`
2. LOAD vault stats via `zed overview` — note count, graph density, recent activity
3. SEARCH vault for active context: open evolve loops, recent decisions, today's daily note
4. ASSESS incoming task complexity using the tier table in Section 3
5. SELECT operating mode (Light/Full/Evolve) per behavior-controller rules

## 2. ZED-First Principle

Before executing any task, check if the vault has relevant context. Before finishing any task, evaluate if something should be captured.

This is not optional. This is not "when convenient." This is the first and last thing you do on every task.

## 3. Complexity Tiers — Mandatory Actions

### Tier 1: Simple (bug fix, rename, config change, single-file edit)

```
1. context check   → zed_search with 2 keywords, L0 titles only
2. execute         → do the task
3. quick verify    → confirm the change works
```

No capture required unless a decision was made between alternatives.

### Tier 2: Medium (feature, refactor, multi-file change)

```
1. context check   → zed_search with 3 keywords, read top 2 results (L1)
2. plan            → outline steps before executing
3. execute         → implement step by step
4. verify          → run tests, check for regressions
5. capture         → write decisions, patterns, or architecture notes via zed_write_note
```

MUST capture if: a design decision was made, a pattern was discovered, or the approach differed from what vault context suggested.

### Tier 3: Complex (architecture, system design, multi-system integration)

```
1. deep context    → zed_search broad + zed_read_note on top 5 + follow backlinks (L2)
2. 5-level plan    → objective → phases → steps → substeps → verification criteria
3. execute         → implement with checkpoint after each phase
4. 3-stage verify  → spec compliance → code quality → adversarial red-team
5. capture all     → decisions (zed_decide), patterns, architecture notes, anti-patterns
```

MUST use the zed-validator agent for stage 4 verification on Tier 3 tasks.

## 4. Skill Trigger Table

These triggers are algorithmic. When the condition is met, the action is MANDATORY.

| Skill | Trigger Condition | Mandatory Action |
|---|---|---|
| context-loader | Every task start | MUST run L0 vault search before any work |
| execution-protocol | Task has 3+ steps | MUST load and follow phased execution |
| full-mode | Architecture decision made | MUST evaluate all output for capture |
| compound-learner | Task complete | MUST extract pattern or anti-pattern |
| evolve-mode | `/evolve` active | MUST check loop state and drift score |
| behavior-controller | Every prompt | MUST determine mode and apply rules |

## 5. Knowledge Capture Rules

These are concrete criteria. Do not interpret "if relevant" — use these exact conditions.

### ALWAYS Capture (via zed_decide)

- A choice was made between 2+ alternatives (e.g., "use X instead of Y because Z")
- An architecture boundary was defined or changed
- A trade-off was evaluated (performance vs. readability, etc.)

### ALWAYS Capture (via zed_write_note)

- A pattern that worked — tag with `[pattern, <domain>]`
- A pattern that failed — tag with `[anti-pattern, <domain>]`
- New understanding of system architecture — create or update architecture note
- A debugging approach that resolved a non-obvious issue — tag with `[debug, <domain>]`

### NEVER Capture

- Routine code that is self-documenting
- Information the user can trivially re-state
- Duplicates of existing vault content
- Temporary workarounds with no lasting value

### Capture Quality Bar

Every note MUST have:
- A clear title (not "misc" or "notes")
- At least 2 tags
- Enough context that a future session can act on it without re-deriving

## 6. Verification Protocol — 3 Stages

### Stage 1: Spec Compliance

- [ ] Does the output match what was requested?
- [ ] Are all acceptance criteria met?
- [ ] Are edge cases from the spec handled?

### Stage 2: Code Quality

- [ ] No lint errors or warnings
- [ ] Tests pass (existing + new)
- [ ] No hardcoded values that should be configurable
- [ ] Error handling present for failure paths

### Stage 3: Adversarial Red-Team

- [ ] What happens with unexpected input?
- [ ] What fails if a dependency is unavailable?
- [ ] What breaks under concurrent access?
- [ ] Is there a security concern (injection, leaks, permissions)?

For Tier 1 tasks: Stage 1 only.
For Tier 2 tasks: Stages 1 + 2.
For Tier 3 tasks: All three stages. Use the zed-validator agent.

## 7. Session Discipline

- At session start: boot sequence runs automatically via hook
- During session: skill triggers fire per the table above
- At session end: stop hook checks capture count and warns if zero captures were made during a significant session
- Between sessions: vault persists all context; next session picks up where this one left off

This protocol is the operating system for ZED. It is not a reference document. Follow it.
