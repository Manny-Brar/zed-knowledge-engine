---
description: ROOT behavioral controller for ZED Knowledge Engine. Defines three operating modes (Light, Full, Evolve) and governs how Claude interacts with the vault on every prompt. This is a hard pre-condition — treat as an instruction set, not a suggestion.
---

## ZED Behavioral Controller

This skill governs your behavior for the entire session. It is not optional. When ZED is installed, these rules apply to every prompt you process.

### Operating Modes

| Mode | Activation | Overhead | Purpose |
|------|-----------|----------|---------|
| **Light** | Always on (default) | ~500 tokens, ~1-2s | Passive awareness — check vault, act on what's relevant |
| **Full** | `/zed` command | Medium | Deep context loading + active knowledge capture |
| **Evolve** | `/evolve` command | High | Structured self-improvement loop with persistence |

---

### ZED-First Principle

On EVERY prompt, before doing any work, determine if vault context is relevant. This is the first thing you do, not an afterthought.

---

### Light Mode (Default — Always On)

Light mode runs automatically. No activation needed. No mode indicator displayed.

**On each prompt:**

1. **Bailout check**: Skip vault entirely for trivial prompts — greetings, simple factual questions with no project context, arithmetic, casual conversation. Do not waste tokens on "hey how's it going."
2. **Search**: Run `zed_search` using 2-3 keywords extracted from the user's request. Parameters: `limit: 3`, titles only (L0).
3. **Evaluate**: If search returns relevant results, read the top 1-2 notes with `zed_read_note` (L1). If nothing relevant, move on — do not force context that isn't there.
4. **Work**: Do the task. Use vault context if it informed your approach.
5. **Write (selective)**: Only write to vault when something is genuinely persistence-worthy. Ask yourself: "Would it be costly to re-derive this in a future session?" If yes, write it. If no, skip.

**Write criteria for Light mode:**
- Decisions that affect future work
- Patterns discovered during implementation
- Insights that required significant reasoning to reach
- Corrections to existing vault knowledge

**Do NOT write in Light mode:**
- Routine code changes
- Things the user can trivially re-state
- Information already captured in the vault

**Overhead target**: ~500 tokens, ~1-2 seconds. Light mode must stay light.

---

### Full Mode

Activated by the `/zed` command. Prefix your first response with:

> **ZED: Full mode active**

**Context loading**: L0 → L1 → L2.
- Search vault broadly for the task domain
- Read top results with `zed_read_note`
- Follow backlinks and related notes with `zed_related` and `zed_backlinks`
- Build a rich context web before planning

**Knowledge capture**: Evaluate ALL output for vault storage. See the `full-mode` skill for the complete capture rubric — what to write, what to skip, and quality standards.

**Session summary**: At the end of a Full mode task, append a summary to the daily note via `zed daily "summary"`.

---

### Evolve Mode

Activated by the `/evolve` command. Prefix your first response with:

> **ZED: Evolve mode active**

Runs a structured self-improvement loop with scope-locked iterations. See the `evolve-mode` skill for complete loop mechanics, drift testing, and self-assessment protocol.

---

### Auto-Escalation: Light → Full

You MUST automatically escalate from Light to Full mode when you detect any of the following:

- **Multi-session continuity**: User references prior conversation ("we started this yesterday", "as we discussed", "continuing from last time")
- **Architecture/design decisions**: Keywords like "should we", "which approach", "how should we structure", "what's the best way to"
- **Complex plans**: Task requires 5+ discrete steps to complete
- **Research tasks**: Keywords like "compare", "evaluate", "investigate", "options for", "pros and cons"
- **Post-mortems, audits, reviews**: Retrospective analysis of what happened and why

When auto-escalating, note it briefly at the start of your response:

> **ZED: Full mode** (detected [reason])

Then operate under Full mode rules for the remainder of that task.

---

### Rules

1. Light mode overhead must not degrade response speed for simple tasks. If the bailout check says skip, skip.
2. Never force vault context into a response where it adds no value.
3. Write quality over write quantity — a vault full of noise is worse than an empty vault.
4. When in doubt about whether to write, don't. The bar for persistence is "would re-deriving this cost significant time or risk getting it wrong."
