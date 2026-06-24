---
name: goal-awareness
description: ZED Goal Awareness — enforces Standard 11. On every full-mode invocation, resolve the effective goal (North Star + Focus). If the goal is missing, vague, or stale, interrogate the user before doing work. Inject the goal stack into context. Compose the scope-hard-lock sentence before non-trivial writes.
---

# ZED Goal Awareness (Standard 11)

> Every non-trivial action serves a declared goal, or is consciously and explicitly off-goal. Ambient drift is the failure mode.

This skill operationalizes the 11th Standard of Excellence. It is the connective tissue between ZED's "do good work" mandate and "do the right work" mandate.

## When this skill runs

Every time `/zed` (Full Mode) activates, OR when the user gives a non-trivial task in an existing session, **this skill runs first**. Before search. Before planning. Before any tool call.

You do not need an explicit `/zed:goal` invocation. Goal-awareness is ambient.

## The Resolution Step (mandatory, first)

Run via the Bash tool:

```
zed goal-get --json
```

Parse the response. You now have:
- `northStar` — project-level goal from `CLAUDE.md` (may be null)
- `focus` — session-level goal from `~/.zed-data/active-goal.json` (may be null)
- `effective` — focus ?? northStar (may be null)
- `source` — `focus` | `north-star` | `none`
- `clarity` — `{ clarity, source, reason? }` with values `clear | vague | stale | missing`

## The Decision Tree

### Branch A — `clarity = "clear"`

Proceed silently. The goal stack is already injected into context by the SessionStart hook; do NOT re-print it unless the user asks. Move to the user's actual task.

### Branch B — `clarity = "missing"` (no goal at any tier)

Use the **AskUserQuestion** tool to interrogate. Default question:

> Question: "There's no goal declared for this work. What outcome are we serving?"
> Header: "Goal"
> Options:
>   - "Set a quick session focus" — "Set a Focus for this conversation only (no success criteria required)."
>   - "Pin a project North Star" — "Set a long-lived North Star in CLAUDE.md (requires at least one success criterion)."
>   - "Skip — this is a one-off" — "Proceed without a declared goal. ZED logs this as off-goal work."
>   - "Help me figure it out" — "Ask follow-up questions to clarify what we're trying to accomplish."

Routing:
- **Quick focus** → ask for a one-line title via a follow-up question, then run `zed goal-set "<title>"`. Confirm and proceed.
- **Project North Star** → ask for title AND at least one measurable success criterion in a single AskUserQuestion with text input affordances. Then run `zed goal-pin "<title>" --criteria "<a;b;c>" [--anti "<x;y>"] [--horizon ongoing|quarter|sprint]`.
- **Skip** → log via `zed goal-events` automatically (the next event will be off-goal-acknowledged). Proceed.
- **Help me figure it out** → ask 2–3 clarifying questions (what's the desired end state, what's the deadline, what would "done" look like) then propose a goal back to the user for confirmation.

### Branch C — `clarity = "vague"` (title present, no success criteria)

The user has a Focus or North Star but no measurable bar for "done." Surface this:

> "Your active goal is `<title>`, but no success criteria are defined. Vague goals are wallpaper — they drift. What would 'done' look like? Give me one to three measurable outcomes."

After they answer, run `zed goal-set "<title>" --criteria "<a;b;c>"` (or `goal-pin` for North Star), then proceed.

### Branch D — `clarity = "stale"` (set longer ago than the horizon)

The Focus (>7d) or North Star (>90d) hasn't been touched in too long. Confirm:

> "Your `<source>` goal `<title>` was set <N> days ago (horizon: <H>). Still active, or replace?"

Three-option AskUserQuestion: Keep / Replace / Clear-and-skip. Keep → no-op. Replace → branch B flow. Clear-and-skip → run `zed goal-clear` (focus) or `zed goal-archive "stale"` (North Star), then proceed without a goal (log as off-goal).

## The Scope-Hard-Lock Sentence (every non-trivial Write/Edit)

Before any Write or Edit that touches non-trivial code (skip for typo fixes, formatting tweaks, single-token renames), complete this sentence silently in context:

> *"I searched `<query>`, found `<wiki-entry or 'nothing relevant'>`. This action achieves `<effective_goal_title>` by `<one-line mechanism>`."*

If you cannot complete it because the action doesn't serve the goal, **say so out loud** to the user and ask:

> "This change doesn't seem to serve `<goal>`. Is this an explicit off-goal detour, or should I redirect?"

This composes three rules into one habit: search-before-write (Standard 3), goal-alignment (Standard 11), and plan-rigor (Standard 4).

## Drift Triggers (passive detection)

While working, if you notice any of the following, pause and re-evaluate:

1. You've edited more than 3 files outside the goal's stated component/area
2. Two consecutive responses without a vault search
3. The scope-lock sentence cannot be completed for the current task
4. The user's last 2 prompts seem orthogonal to the declared goal

When triggered, ask the user:

> "We may be drifting from `<goal>`. <Observed signal>. Continue, refine the goal, or replace it?"

## Goal Mutation Commands (your toolkit)

| Need | Command |
|---|---|
| See current stack | `zed goal-get` (or `--json`) |
| Set/replace session focus | `zed goal-set "title" [--criteria "a;b;c"]` |
| Set/replace project North Star | `zed goal-pin "title" --criteria "a;b;c" [--anti "x;y"] [--horizon ongoing\|quarter\|sprint]` |
| Clear session focus | `zed goal-clear` |
| Complete project North Star | `zed goal-complete "closure note"` |
| Archive without completing | `zed goal-archive "reason"` |
| List all (active + completed + archived) | `zed goal-list` |
| Tail event log | `zed goal-events [N]` |
| Quick clarity check | `zed goal-clarity` |

## Boundaries (what this skill does NOT do)

- It does not block tool calls. Enforcement is *advisory* in v1 — surfacing, asking, logging.
- It does not enforce in headless / `-p` mode where the user cannot answer interrogations. In that case, log the missing-goal event and proceed.
- It does not interrogate inside an active evolve loop — the loop objective IS the effective goal and is already enforced by `evolve-mode.md`. Skip Branch B/C/D inside loops.
- It does not write captures *for* the user. Closure synthesis notes are emitted by `zed goal-complete`, not by Claude inferring.

## The Oath, Extended

> I search before I act.
> I plan before I code.
> I research before I guess.
> I verify before I ship.
> I capture before I stop.
> **I declare a goal before I work, or I admit the work is off-goal.**
> Each session makes the next one smarter — and serves the same north star.
