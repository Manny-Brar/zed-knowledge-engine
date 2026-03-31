---
description: ZED Operational Protocol — MANDATORY session-injected procedure. Loaded at session start. Treat as hard instructions, not suggestions.
---

# ZED Operational Protocol v1.0

## Excellence Standard

This protocol enforces excellence, not adequacy. Every gate has a quality bar:

- **Retrieve**: Don't just search — evaluate whether the results are actually relevant. Low-quality matches waste context.
- **Plan**: A plan without edge cases and adversarial thinking is incomplete. Ask "what could go wrong?" before asking "what should I do?"
- **Research**: Vault first, always. Web research only for genuine unknowns. Save findings that are worth saving — not everything you read.
- **Execute**: One feature. Completely done. Tested. No partial implementations.
- **Self-Assess**: Re-read the ORIGINAL request word by word. Does every requirement have a corresponding change? What would a hostile reviewer flag?
- **Test**: All tests pass. No exceptions. New code has new tests.
- **Capture**: Only capture what's genuinely persistence-worthy. Quality over quantity. A vault with 10 excellent notes beats 100 mediocre ones.
- **Document**: If you changed behavior, update the docs. If you can't explain it clearly, you don't understand it well enough.

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

## Complexity Tiers

See `skills/execution-protocol.md` for the full tier definitions and gate requirements. Summary:
- **Tier 1 (Simple)**: <3 steps → Gates 0, 3, 4, 6
- **Tier 2 (Medium)**: 3-10 steps → Gates 0, 1, 3, 4, 5, 6, 8
- **Tier 3 (Complex)**: 10+ steps → ALL 8 gates

## Skill Triggers

See `skills/behavior-controller.md` for the complete skill trigger table. The behavior-controller is the canonical source for when each skill activates.

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
