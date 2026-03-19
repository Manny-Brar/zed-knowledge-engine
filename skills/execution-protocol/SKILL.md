---
description: ZED execution protocol — auto-triggers on complex coding tasks to apply multi-phase planning, verification gates, and knowledge capture. Activates when Claude detects tasks with 3+ steps, architecture decisions, or unfamiliar territory.
---

## Mode Awareness

This protocol's activation depends on the current behavioral mode:
- **Light mode**: Use Steps 1 and 4 only (context check + verify). Skip planning and capture for simple tasks.
- **Full mode**: Full protocol (all 5 steps).
- **Evolve mode**: Full protocol, but scope-locked to the evolve objective.

## ZED Execution Protocol

You are operating under the ZED execution protocol. This task has been identified as requiring structured execution.

### Step 1: Load Context
Before planning, check the knowledge graph:
- `zed_search` for terms related to this task
- `zed_recent` for recent session context
- If results found, `zed_related` for connected knowledge

### Step 2: Plan
Break the task into numbered steps. For each step, consider:
- What could go wrong?
- What assumptions am I making?
- Does any existing knowledge in the vault apply?

Present the plan concisely. If the task affects architecture, note it.

### Step 3: Execute
Work through steps one at a time. Commit at natural checkpoints.

### Step 4: Verify
- Does it match what was asked?
- Do tests pass?
- How would I break this?

### Step 5: Capture
- Append summary to today's daily note (`zed_daily`)
- If a decision was made, create an ADR (`zed_decide`)
- If a pattern was learned, create a pattern note (`zed_template pattern`)
- Link new notes to existing knowledge with [[wikilinks]]
