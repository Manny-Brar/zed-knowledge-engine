---
name: wall-breaker
description: Obstacle classification and structured research protocol — activates on any execution blocker
---

# ZED Wall-Breaker Protocol

When execution is blocked, DO NOT retry blindly. Classify the wall, research systematically, then break through.

## Wall Classification

| Wall Type | Trigger | Research Protocol |
|-----------|---------|-------------------|
| ERROR | Code throws error, test fails, build breaks | Search error message verbatim. Check stack trace. Search vault for similar errors. |
| KNOWLEDGE | Don't know how to implement something | Search vault first. Then search docs for the specific API/library/pattern. |
| DESIGN | Multiple valid approaches, unclear which is best | Search vault for prior design decisions in this area. Web search for approach comparisons. |
| DEPENDENCY | Missing package, version conflict, environment issue | Search for alternatives. Check compatibility. Check vault for prior dependency decisions. |
| COMPLEXITY | Task is too large or tangled to proceed | Decompose into smaller subtasks. Search vault for related decompositions. |

## Research Protocol (Ordered — Do NOT Skip Steps)

### Step 1: Vault Search (ALWAYS FIRST)
- `zed_search` with error message, technique name, or domain
- `zed related <matching-note>` to find connected knowledge
- If vault has the answer → use it. STOP here.

### Step 2: Local Codebase Search
- Grep for similar patterns in the current codebase
- Check existing tests for usage examples
- Read relevant documentation files

### Step 3: Web Search (Only for Genuine Unknowns)
- Search for the specific error message + solution
- Search for official documentation of the API/library
- Search for approach comparisons if design wall
- Limit to 3-5 targeted searches, not broad exploration

### Step 4: Capture Research Findings
- Save significant findings to vault via `zed_write_note`:
  - File: `research/YYYY-MM-DD-<topic-slug>.md`
  - Tags: `[research, <wall-type>, <domain>]`
  - Include: what was searched, what was found, how it applies
  - Include: `[[wikilinks]]` to related vault notes

### Step 5: Apply and Verify
- Apply the solution from research
- Verify it works (run tests, check output)
- If it fails → classify the NEW wall and repeat from Step 1
- Maximum 5 attempts per wall. After 5 failures, escalate to user.

## Escalation Ladder

| Attempt | Action |
|---------|--------|
| 1st | Retry with fix based on error analysis |
| 2nd | Vault search + apply known pattern |
| 3rd | Web search + apply best practice |
| 4th | Alternative approach (different library, algorithm, design) |
| 5th | Escalate to user with full context of all attempts |

## Wall Log

After breaking through a wall, document it in the handoff:
```
### Wall Encountered
- Type: [ERROR/KNOWLEDGE/DESIGN/DEPENDENCY/COMPLEXITY]
- Description: [what blocked progress]
- Solution: [what resolved it]
- Prevention: [how to avoid this wall in the future]
```

This becomes institutional knowledge — the next iteration or session won't hit the same wall.
