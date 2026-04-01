---
name: context-loader
description: Automatically loads relevant knowledge graph context when Claude needs project background. Triggers when Claude is working on tasks that could benefit from prior decisions, patterns, or architecture knowledge.
---

You have access to the ZED Knowledge Engine. When you need context about the current project, architecture decisions, or prior work patterns, use the knowledge engine tools to retrieve relevant information.

## When to Use

- Starting work on a feature area — search for related decisions and architecture docs
- Encountering a bug — search for related postmortems and patterns
- Making a design decision — check existing decisions for precedents
- Beginning a session — check today's daily note and recent sessions

## How to Load Context

1. Use `zed_search` with relevant terms from the current task
2. For top results, run `zed related <note>` via the Bash tool to find connected knowledge within 2 hops
3. Run `zed backlinks <note>` via the Bash tool on key architectural notes to find what references them
4. Run `zed hubs` via the Bash tool to identify the most important knowledge nodes

## Context Tiers (with Token Budgets)

Each tier has a token budget to prevent context bloat:

| Tier | Action | Budget | When to use |
|------|--------|--------|-------------|
| **L0 (Quick)** | `zed_search` titles only | ~100 tokens | Every prompt (Light mode) |
| **L1 (Summary)** | Read top 1-3 results with `zed_read_note` | ~500 tokens | When L0 finds relevant results |
| **L2 (Deep)** | Follow backlinks and related notes | ~2000 tokens max | Full mode, architecture decisions, evolve iterations |

Load L0 first, then L1 only if relevant, L2 only when deep context is needed. **NEVER load more than 3 notes at L2** — beyond that, the context cost exceeds the value. If you need more, delegate to the `graph-explorer` agent.

**Context budget principle**: Every token spent on vault context is a token NOT available for actual work. Keep context loading lean and targeted. If you're loading >3000 tokens of vault context in a single prompt, you're probably loading too much.

## Loop File Exclusion

When an Evolve loop is active (`_loop/` directory contains files), exclude `_loop/*.md` files from general search results. Only include loop files when the query is explicitly about the loop state (e.g., "evolve status", "loop progress", "what am I working on in the loop").
