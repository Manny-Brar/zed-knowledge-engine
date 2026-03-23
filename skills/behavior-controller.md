---
name: behavior-controller
description: ROOT behavioral controller for ZED Knowledge Engine. Defines three operating modes (Light, Full, Evolve) and governs how Claude interacts with the vault on every prompt. This is a hard pre-condition — treat as an instruction set, not a suggestion.
---

## Tool Usage Rules

ZED has two interfaces. Use the right one:

**MCP Tools (Claude calls directly — preferred for these 4 operations):**
- `zed_search` — search the vault
- `zed_read_note` — read a note
- `zed_write_note` — write/update a note
- `zed_decide` — create a decision record

**CLI via Bash (for everything else):**
- `zed related <note>` — find connected notes
- `zed backlinks <note>` — find notes linking to this one
- `zed hubs` — most connected notes
- `zed daily "text"` — session notes
- `zed health` — vault health score
- All other `zed` subcommands

**Rule: If it's one of the 4 MCP tools, use the MCP tool. For everything else, use CLI via Bash.**

## ZED Behavioral Controller

This skill governs your behavior for the entire session. It is not optional. When ZED is installed, these rules apply to every prompt you process.

### Operating Modes

| Mode | Activation | Overhead | Purpose |
|------|-----------|----------|---------|
| **Light** | Always on (default) | ~500 tokens, ~1-2s | Passive awareness — check vault, act on what's relevant |
| **Full** | `/zed` command or auto-escalation | Medium | Deep context loading + active knowledge capture |
| **Evolve** | `/evolve` command | High | Structured self-improvement loop with persistence |

---

### ZED-First Principle

On EVERY prompt, before doing any work, determine if vault context is relevant. This is the first thing you do, not an afterthought. This is MANDATORY.

---

### Light Mode (Default — Always On)

Light mode runs automatically. No activation needed. No mode indicator displayed.

**On each prompt:**

1. **Bailout check**: Skip vault entirely for these exact categories: greetings ("hi", "hello", "hey"), yes/no answers, simple math (single arithmetic operations), single-word responses, casual conversation with no project context. For ALL other prompts, proceed to step 2.
2. **Search**: MUST run `zed_search` using 2-3 keywords extracted from the user's request. Parameters: `limit: 3`, titles only (L0).
3. **Evaluate**: If search returns relevant results, MUST read the top 1-2 notes with `zed_read_note` (L1). If nothing relevant, proceed to step 4.
4. **Work**: Do the task. Use vault context if it informed your approach.
5. **Capture check**: MUST evaluate whether capture is warranted using the criteria below. This step is not optional.

**MUST capture in Light mode when:**
- A decision was made between 2+ alternatives
- A pattern was discovered during implementation
- An insight required significant reasoning to reach (>30 seconds of analysis)
- Existing vault knowledge was found to be incorrect or outdated

**MUST NOT capture in Light mode:**
- Routine code changes with no design decisions
- Information the user stated in this prompt (they can re-state it)
- Content already present in the vault

**Overhead target**: ~500 tokens, ~1-2 seconds. Light mode MUST stay light.

---

### Full Mode

Activated by the `/zed` command or auto-escalation. MUST prefix first response with:

> **ZED: Full mode active**

**Context loading**: L0 -> L1 -> L2. This sequence is MANDATORY.
- MUST search vault broadly for the task domain
- MUST read top results with `zed_read_note`
- MUST follow backlinks and related notes by running `zed related <note>` and `zed backlinks <note>` via the Bash tool
- MUST build a rich context web before planning

**Knowledge capture**: MUST evaluate ALL output for vault storage. See the `full-mode` skill for the complete capture rubric.

**Session summary**: At the end of a Full mode task, MUST append a summary to the daily note by running `zed daily "summary"` via the Bash tool.

---

### Evolve Mode

Activated by the `/evolve` command. MUST prefix first response with:

> **ZED: Evolve mode active**

Runs a structured self-improvement loop with scope-locked iterations. See the `evolve-mode` skill for complete loop mechanics, drift testing, and self-assessment protocol.

---

### Auto-Escalation: Light -> Full

MUST automatically escalate from Light to Full mode when ANY of the following conditions are true:

- **Multi-session continuity**: User references prior conversation ("we started this yesterday", "as we discussed", "continuing from last time")
- **Architecture/design decisions**: Prompt contains "should we", "which approach", "how should we structure", "what's the best way to", or equivalent
- **Complex plans**: Task requires 5+ discrete steps to complete
- **Research tasks**: Prompt contains "compare", "evaluate", "investigate", "options for", "pros and cons"
- **Post-mortems, audits, reviews**: Retrospective analysis of what happened and why

When auto-escalating, MUST note it at the start of the response:

> **ZED: Full mode** (detected [reason])

Then operate under Full mode rules for the remainder of that task.

---

### Skill Trigger Table

These triggers are algorithmic. When the condition is met, the action is MANDATORY.

| Skill | Trigger Condition | Mandatory Action |
|---|---|---|
| context-loader | Every task start | MUST run L0 vault search before any work |
| execution-protocol | Task has 3+ steps | MUST load and follow phased execution |
| full-mode | Architecture decision made | MUST evaluate all output for capture |
| compound-learner | Task complete | MUST extract pattern or anti-pattern |
| evolve-mode | `/evolve` active | MUST check loop state and drift score |
| behavior-controller | Every prompt | MUST determine mode and apply rules |
| wall-breaker | Execution blocked by error, unknown, or design conflict | MUST classify wall type and follow research protocol |
| onboarding | Vault empty (<3 notes) or first session with ZED | MUST run first-session setup flow |

---

### Rules

1. Light mode overhead MUST NOT degrade response speed for simple tasks. If the bailout check says skip, skip immediately.
2. MUST NOT force vault context into a response where it adds no value.
3. Write quality over write quantity — a vault full of noise is worse than an empty vault.
4. The bar for persistence is: "Would re-deriving this cost significant time or risk getting it wrong?" If yes, capture. If no, skip.
5. Every captured note MUST have a clear title, at least 2 tags, and enough context for a future session to act on it.
