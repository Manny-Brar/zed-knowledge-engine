---
description: Extracts reusable patterns and anti-patterns from completed work sessions. Triggers after significant implementation tasks, bug fixes, or architecture decisions to capture institutional knowledge.
---

You have access to the Nelson Knowledge Engine. After completing significant work, extract knowledge and save it to the knowledge graph.

## When to Trigger

- After completing a feature implementation
- After fixing a non-trivial bug
- After making an architecture decision
- After a debugging session that revealed something unexpected
- When the user explicitly asks to capture learnings

## What to Extract

### Patterns (things that worked)
Create a pattern note using `ke_write_note` with:
- **Problem**: What recurring problem does this solve?
- **Solution**: What approach worked?
- **When to use**: Under what conditions?
- **Example**: Concrete code or approach reference

### Anti-patterns (things that failed)
Create a pattern note with tags including "anti-pattern":
- **What went wrong**: What approach failed?
- **Why it failed**: Root cause
- **What to do instead**: The correct approach
- **How to detect**: Warning signs

### Decision Records
If a significant decision was made, use `ke_decide` to create an ADR.

## How to Save

1. Use `ke_write_note` with the `patterns/` prefix for the filename
2. Include [[wikilinks]] to related decisions, architecture docs, and other patterns
3. Use descriptive tags in frontmatter for searchability
4. Use `ke_daily` to append a summary to today's session note
5. Run `ke_rebuild` if you created multiple notes to update the graph

## Quality Rules

- Only save knowledge that would be useful in a future session
- Be specific — "use transactions for multi-step DB operations" not "be careful with databases"
- Include the WHY, not just the WHAT
- Link to related knowledge with [[wikilinks]] to strengthen the graph
