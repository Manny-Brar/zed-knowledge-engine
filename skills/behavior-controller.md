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
| wall-breaker | Error/crash=ERROR, unknown API/tech=KNOWLEDGE, multiple approaches=DESIGN, missing package=DEPENDENCY, too complex=COMPLEXITY | MUST classify wall type and follow structured research protocol |
| onboarding | Vault empty (<3 notes) or first session with ZED | MUST run first-session setup flow |

---

### Context Budget Management

Claude Code's context window degrades at 60-70% usage (the "dumb zone" — Claude starts ignoring instructions, dropping context, and producing lower quality output). ZED MUST actively manage context budget.

**Auto-Compact Protocol:**
1. When context usage reaches ~50%, proactively run `/compact` to compress conversation history BEFORE the dumb zone hits
2. Before compacting, flush any unsaved knowledge to the vault (the PreCompact hook assists with this)
3. After compacting, re-anchor on the current task by re-reading the most recent vault context

**Token Overhead Awareness:**
- ZED skills load on-demand (more token-efficient than CLAUDE.md which loads every session)
- In Light mode, keep total ZED overhead under 500 tokens per prompt
- In Full mode, limit L2 context loading to 3 vault notes maximum unless the task explicitly requires more
- In Evolve mode, the objective + scope-boundary + handoff are loaded each iteration (~1000 tokens) — this is acceptable overhead for structured execution
- NEVER load the entire vault into context. Use targeted searches, not broad dumps.

**Subagent Context Isolation:**
- When delegating to subagents (zed-planner, zed-validator, zed-researcher), each gets its own clean context window
- Use subagents for research-heavy or validation-heavy tasks to prevent intermediate noise from polluting the main execution context
- Subagent results should be summarized before being consumed by the main agent — not dumped raw

---

### Back-Pressure Principle

The single highest-leverage optimization for Claude Code quality is **back-pressure**: mechanisms that let the agent verify its own work.

ZED enforces back-pressure through:
1. **Tests as hard gates** — Gate 5 (TEST) in the execution protocol BLOCKS further progress if tests fail. No exceptions.
2. **Self-assessment before completion** — Gate 4 requires re-reading the original request and checking against it
3. **Verification evidence** — Every gate transition requires explicit evidence that the prior gate passed (test output, diff review, etc.)
4. **Drift detection** — The stop hook calculates drift score and circuit-breaks on excessive deviation

Without back-pressure, Claude Code writes code that "looks right" but fails in practice. With back-pressure, it writes code that actually works.

---

### Rules

1. Light mode overhead MUST NOT degrade response speed for simple tasks. If the bailout check says skip, skip immediately.
2. MUST NOT force vault context into a response where it adds no value.
3. Write quality over write quantity — a vault full of noise is worse than an empty vault.
4. The bar for persistence is: "Would re-deriving this cost significant time or risk getting it wrong?" If yes, capture. If no, skip.
5. Every captured note MUST have a clear title, at least 2 tags, and enough context for a future session to act on it.
6. MUST monitor context usage and trigger `/compact` at ~50% — do NOT wait for automatic compaction in the dumb zone.
7. MUST use subagent delegation for tasks that would add >5000 tokens of intermediate output to the main context.
