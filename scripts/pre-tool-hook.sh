#!/bin/bash
trap 'echo "ZED pre-tool hook error: $BASH_COMMAND" >&2' ERR

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_ROOT="${SCRIPT_DIR}/.."
DATA_DIR="${CLAUDE_PLUGIN_DATA:-$HOME/.zed-data}"
TRACKER="$DATA_DIR/edit-tracker.json"
LOOP_DIR="$DATA_DIR/vault/_loop"
SCOPE_BOUNDARY="$LOOP_DIR/scope-boundary.md"
OBJECTIVE="$LOOP_DIR/objective.md"

# v8.3: Goal-awareness enforcement (Standard 11)
# Calls `zed goal-check --json` to get the recommended action for this write.
# - allow:   no-op (we're inside an evolve loop or in block-all mode w/ clear goal)
# - surface: print the scope-hard-lock sentence reminder (once per session per goal)
# - warn:    print a warning (every fire — but only when goal is vague/stale/missing AND mode=warn)
# - block:   emit a JSON block decision to stop the tool call
GOAL_CHECK=$(ZED_DATA_DIR="$DATA_DIR" node "$PLUGIN_ROOT/bin/zed" goal-check --json 2>/dev/null || echo '{}')
GOAL_ACTION=$(node -e "try{const j=JSON.parse(process.argv[1]||'{}');console.log(j.recommendedAction||'allow')}catch(e){console.log('allow')}" "$GOAL_CHECK")
GOAL_REASON=$(node -e "try{const j=JSON.parse(process.argv[1]||'{}');console.log(j.reason||'')}catch(e){console.log('')}" "$GOAL_CHECK")
GOAL_TITLE=$(node -e "try{const j=JSON.parse(process.argv[1]||'{}');console.log(j.goalTitle||'')}catch(e){console.log('')}" "$GOAL_CHECK")
GOAL_ID=$(node -e "try{const j=JSON.parse(process.argv[1]||'{}');console.log(j.goalId||'')}catch(e){console.log('')}" "$GOAL_CHECK")

if [ "$GOAL_ACTION" = "block" ]; then
  ZED_REASON="$GOAL_REASON" node -e "
    console.log(JSON.stringify({
      decision: 'block',
      reason: 'ZED GOAL LOCK: ' + process.env.ZED_REASON + '. Set a goal first: zed goal-pin \"title\" --criteria \"...\" — or run zed goal-unlock to relax the lock.'
    }));
  "
  exit 0
fi

if [ "$GOAL_ACTION" = "warn" ]; then
  echo "ZED GOAL WARNING: $GOAL_REASON. Set or refine the goal: zed goal-set \"title\" --criteria \"...\""
fi

if [ "$GOAL_ACTION" = "surface" ] && [ -n "$GOAL_TITLE" ]; then
  # Once-per-session-per-goal surfacing of the scope-hard-lock formula
  GOAL_SURFACED_FLAG="$DATA_DIR/.goal-surfaced-${GOAL_ID}"
  if [ ! -f "$GOAL_SURFACED_FLAG" ]; then
    echo "ZED GOAL: Active goal — \"$GOAL_TITLE\""
    echo "Before this write, complete: 'I searched <query>, found <wiki entry or nothing>. This action achieves $GOAL_TITLE by <mechanism>.'"
    touch "$GOAL_SURFACED_FLAG" 2>/dev/null || true
  fi
fi

# v8.1: Once-per-session search suggestion
# If no zed_search has been called yet this session, gently remind.
# Uses a flag file so the reminder only fires once.
SEARCH_REMINDED="$DATA_DIR/.search-reminded"
if [ ! -f "$SEARCH_REMINDED" ]; then
  PLUGIN_ROOT="${SCRIPT_DIR}/.."
  HAS_SEARCHED=$(ZED_DATA="$DATA_DIR" node -e "
    try {
      const el = require('$PLUGIN_ROOT/core/event-log.cjs');
      const sid = el.getSessionId({ dataDir: '$DATA_DIR' });
      if (!sid) { console.log('unknown'); process.exit(0); }
      const events = el.readEvents({ dataDir: '$DATA_DIR', sessionId: sid });
      const searched = events.some(e => e.tool === 'zed_search');
      console.log(searched ? 'yes' : 'no');
    } catch(e) { console.log('unknown'); }
  " 2>/dev/null || echo "unknown")
  if [ "$HAS_SEARCHED" = "no" ]; then
    echo "ZED: No vault search this session. Consider running zed_search before editing to check for relevant prior work."
    touch "$SEARCH_REMINDED"
  elif [ "$HAS_SEARCHED" = "yes" ]; then
    touch "$SEARCH_REMINDED"  # Don't remind again
  fi
fi

# Read current drift metrics
if [ ! -f "$TRACKER" ]; then
  exit 0  # No tracker = no drift data = allow
fi

EDIT_COUNT=$(ZED_TRACKER="$TRACKER" node -e "try{console.log(JSON.parse(require('fs').readFileSync(process.env.ZED_TRACKER,'utf8')).edit_count||0)}catch(e){console.log(0)}")
FILE_COUNT=$(ZED_TRACKER="$TRACKER" node -e "try{console.log((JSON.parse(require('fs').readFileSync(process.env.ZED_TRACKER,'utf8')).files||[]).length)}catch(e){console.log(0)}")

# --- Scope Boundary Enforcement (Evolve Mode Only) ---
# When an evolve loop is active AND a scope-boundary.md exists,
# warn if the target file is outside the declared scope.
# This is a pre-edit warning, not a hard block — the stop hook handles blocking.
if [ -f "$OBJECTIVE" ] && [ -f "$SCOPE_BOUNDARY" ]; then
  # Check if objective is not already completed
  COMPLETED="false"
  if grep -q "completed: true" "$OBJECTIVE" 2>/dev/null; then
    COMPLETED="true"
  fi

  if [ "$COMPLETED" = "false" ]; then
    # Extract the target file from the tool input (passed via TOOL_INPUT env)
    TARGET_FILE="${TOOL_INPUT_FILE:-}"
    if [ -n "$TARGET_FILE" ]; then
      # Check if the target file appears in scope-boundary.md
      IN_SCOPE=$(ZED_SCOPE="$SCOPE_BOUNDARY" ZED_TARGET="$TARGET_FILE" node -e "
        try {
          const scope = require('fs').readFileSync(process.env.ZED_SCOPE, 'utf8');
          const target = process.env.ZED_TARGET;
          // Check if any line in scope-boundary contains the target filename or path
          const basename = require('path').basename(target);
          const inScope = scope.includes(target) || scope.includes(basename);
          console.log(inScope ? 'true' : 'false');
        } catch(e) { console.log('true'); }  // Default to allowing on error
      ")

      if [ "$IN_SCOPE" = "false" ]; then
        echo "ZED SCOPE WARNING: Editing '$TARGET_FILE' which is NOT listed in scope-boundary.md. Verify this file is required for the evolve objective before proceeding."
      fi
    fi
  fi
fi

# Circuit breaker: block if extreme drift (>40 edits or >12 files)
if [ "$EDIT_COUNT" -gt 40 ] || [ "$FILE_COUNT" -gt 12 ]; then
  ZED_EDITS="$EDIT_COUNT" ZED_FILES="$FILE_COUNT" node -e "
    console.log(JSON.stringify({
      decision: 'block',
      reason: 'ZED CIRCUIT BREAKER: ' + process.env.ZED_EDITS + ' edits across ' + process.env.ZED_FILES + ' files this session. This is extreme drift. Stop and re-read the original objective. If this is intentional (large refactor), acknowledge by running: zed daily \"Drift acknowledged — large refactor in progress\"'
    }));
  "
  exit 0
fi

# Warning at moderate drift (>25 edits or >8 files) — allow but warn
if [ "$EDIT_COUNT" -gt 25 ] || [ "$FILE_COUNT" -gt 8 ]; then
  echo "ZED DRIFT WARNING: $EDIT_COUNT edits, $FILE_COUNT files. Consider focusing scope."
fi

exit 0
