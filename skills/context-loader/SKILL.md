---
description: Automatically loads relevant knowledge graph context when Claude needs project background. Triggers when Claude is working on tasks that could benefit from prior decisions, patterns, or architecture knowledge.
---

You have access to the Nelson Knowledge Engine. When you need context about the current project, architecture decisions, or prior work patterns, use the knowledge engine tools to retrieve relevant information.

## When to Use

- Starting work on a feature area — search for related decisions and architecture docs
- Encountering a bug — search for related postmortems and patterns
- Making a design decision — check existing decisions for precedents
- Beginning a session — check today's daily note and recent sessions

## How to Load Context

1. Use `ke_search` with relevant terms from the current task
2. For top results, use `ke_related` to find connected knowledge within 2 hops
3. Use `ke_backlinks` on key architectural notes to find what references them
4. Use `ke_hubs` to identify the most important knowledge nodes

## Context Tiers

- **L0 (Quick)**: Use `ke_search` for titles only — good for orientation
- **L1 (Summary)**: Read the top 3 search results with `ke_read_note`
- **L2 (Deep)**: Follow backlinks and related notes for full context web

Load L0 first, then L1 only if relevant, L2 only when deep context is needed. Don't overload the context window.
