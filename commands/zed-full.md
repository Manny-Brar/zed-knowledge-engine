<!-- KEEP IN SYNC WITH commands/zed.md -->
---
description: Activate Full mode (alias for /zed:zed)
---

Announce: **"ZED: Full mode active"**

Full mode combines deep context retrieval with active knowledge capture. Every output is evaluated for persistence-worthy insights.

## Step 0 — Goal Alignment (MANDATORY, BEFORE context load)

Before any L0 search, resolve the goal stack and decide whether to interrogate.

1. Run `zed goal-check --json` via the Bash tool.
2. Parse `recommendedAction` and `clarity` from the response.
3. Follow the goal-awareness skill's decision tree:
   - `inEvolveLoop=true` → skip Step 0 entirely; evolve-mode owns enforcement. Continue to Deep Context Load.
   - `clarity=clear` → proceed silently to Deep Context Load. Do not announce the goal — it's already in the session-start injection.
   - `clarity=missing` → use AskUserQuestion to ask what we're working toward. Route the answer through `zed goal-set` or `zed goal-pin`. THEN continue.
   - `clarity=vague` → ask for measurable success criteria. THEN continue.
   - `clarity=stale` → confirm Keep / Replace / Clear-and-skip. THEN continue.
4. If `$ARGUMENTS` is clearly orthogonal to the active goal, flag the misalignment and ask whether this is an explicit off-goal detour.

The full goal-awareness skill is the source of truth.

## Deep Context Load

1. **L0 — Vault search**: Run `zed_search` with the user's task or query ("$ARGUMENTS") to find relevant notes. If no argument was provided, search for terms related to the current conversation context.
2. **L1 — Read top results**: Use `zed_read_note` on the top 3–5 results to load full content into context.
3. **L2 — Follow connections**: Run `zed related <note>` via the Bash tool on each loaded note to discover second-degree connections. Load any that look relevant.

## Execute

If an argument was provided ("$ARGUMENTS"), execute that specific task using the loaded context.

If no argument was provided, activate Full mode for the remainder of this conversation — apply the deep context load and capture rubric to every subsequent response.

## Capture and Persist

After completing the task (or at natural breakpoints during an ongoing Full mode session):

1. **Evaluate output** against the capture rubric defined in `skills/full-mode/SKILL.md`. Ask: Does this contain a reusable pattern? A decision? A bug insight? A new connection?
2. **Write persistence-worthy knowledge** to the vault using `zed_write_note`. Tag appropriately (pattern, decision, learning, etc.) and add backlinks to related notes.
3. **Append session summary** to the daily note. Run `zed daily "summary text"` via the Bash tool with a brief summary of what was loaded, executed, and captured.
