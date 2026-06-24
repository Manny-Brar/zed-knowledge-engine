---
description: View, set, or manage the ZED goal stack (North Star + Focus). The North Star is the project-level long-running goal; the Focus is the session-level goal. Either can be missing.
---

Parse the arguments from "$ARGUMENTS" to determine the action.

The first token routes the subcommand. Quoted strings stay together. Recognized actions:

- `<empty>` or `show` or `status` → show the current goal stack
- `pin "<title>" --criteria "a;b;c" [--anti "x;y"] [--horizon ongoing|quarter|sprint]` → set project North Star
- `set "<title>" [--criteria "a;b;c"] [--pinned]` → set session Focus
- `clear` → clear the session Focus (leaves North Star untouched)
- `complete ["closure note"]` → mark the North Star complete, archive it, clean up CLAUDE.md
- `archive ["reason"]` → archive the North Star without marking complete (for goal replacement)
- `list` → list active + completed + archived goals
- `events [N]` → tail the last N goal events
- `clarity` → quick clarity verdict (clear|vague|stale|missing)

---

## Show (default)

If no argument is given OR the argument is `show` or `status`:

1. Run `zed goal-get` via the Bash tool.
2. Display the output as-is to the user.
3. If clarity is not "clear", surface a one-line nudge:
   - **missing** → "No goal declared. Run `/zed:goal set \"…\"` (session) or `/zed:goal pin \"…\" --criteria \"…\"` (project)."
   - **vague**   → "Goal lacks success criteria. Run `/zed:goal set \"…\" --criteria \"a;b;c\"` to make it measurable."
   - **stale**   → "Goal has not been updated within its horizon. Run `/zed:goal pin …` to refresh, or `/zed:goal archive …` to retire."

## Pin (set North Star)

When the first token is `pin`:

1. Parse the quoted title.
2. Require at least one success criterion (passed via `--criteria "a;b;c"`). If missing, ask the user via AskUserQuestion:
   > "A North Star without success criteria becomes wallpaper. What would 'done' look like? Give me 1-3 measurable outcomes."
3. Run via Bash:
   ```
   zed goal-pin "<title>" --criteria "<a;b;c>" [--anti "<x;y>"] [--horizon <h>]
   ```
4. Display the confirmation. Suggest follow-up: "Set a Focus for this session with `/zed:goal set \"…\"`."

## Set (Focus)

When the first token is `set`:

1. Parse the quoted title.
2. Run: `zed goal-set "<title>" [--criteria "..."] [--pinned]`
3. If criteria were not provided, run `zed goal-clarity` and if "vague", gently prompt for criteria (but don't block — Focus is allowed to be vague for quick one-off sessions).

## Clear

When the first token is `clear`:

1. Run `zed goal-clear`.
2. If the user's intent appears to be "replace the goal" rather than "clear and go off-goal", ask whether they'd like to set a new Focus next.

## Complete

When the first token is `complete`:

1. The remaining argument (if any) is a closure note.
2. Run `zed goal-complete "<note>"` via Bash.
3. After completion, ask via AskUserQuestion: "What's the next North Star? Or leave blank and ZED will operate without one until you set one."

## Archive

When the first token is `archive`:

1. The remaining argument (if any) is the reason.
2. Run `zed goal-archive "<reason>"`.
3. Unlike `complete`, this is for goals you're abandoning or replacing — no closure synthesis is emitted.

## List

When the first token is `list`:

1. Run `zed goal-list` and display the output.

## Events

When the first token is `events`:

1. Parse optional integer limit (default 50).
2. Run `zed goal-events <N>` and display.

## Clarity

When the first token is `clarity`:

1. Run `zed goal-clarity` and display the one-line verdict.
