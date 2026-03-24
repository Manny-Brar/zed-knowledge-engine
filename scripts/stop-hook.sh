#!/bin/bash
# stop-hook.sh — Blocking Stop hook for ZED evolve mode
#
# When an evolve loop is active, enforces protocol compliance:
# - Gate 1: Knowledge capture required (if >5 edits with zero captures)
# - Gate 2: Handoff file required (if >3 edits)
# - Gate 3: Drift circuit breaker (score >= 7/10)
# - Gate 4: Loop continuation (if max_iterations not reached)
#
# Returns JSON: {"decision": "block", "reason": "..."} to prevent stop
# Returns nothing or exits cleanly to allow stop

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_ROOT="${SCRIPT_DIR}/.."
DATA_DIR="${CLAUDE_PLUGIN_DATA:-$HOME/.zed-data}"
VAULT_DIR="$DATA_DIR/vault"
LOOP_DIR="$VAULT_DIR/_loop"
TRACKER="$DATA_DIR/edit-tracker.json"

# If no active evolve loop, allow stop
OBJECTIVE="$LOOP_DIR/objective.md"
if [ ! -f "$OBJECTIVE" ]; then
  # Run session-end cleanup before allowing stop
  "$PLUGIN_ROOT/scripts/session-end.sh" 2>/dev/null || true
  exit 0
fi

# Check if loop is already completed
if grep -q "completed: true" "$OBJECTIVE" 2>/dev/null; then
  # Run session-end cleanup before allowing stop
  "$PLUGIN_ROOT/scripts/session-end.sh" 2>/dev/null || true
  exit 0
fi

# Read tracker state
EDIT_COUNT=0
CAPTURES=0
FILE_COUNT=0
if [ -f "$TRACKER" ]; then
  EDIT_COUNT=$(ZED_TRACKER="$TRACKER" node -e "try{const t=JSON.parse(require('fs').readFileSync(process.env.ZED_TRACKER,'utf8'));console.log(t.edit_count||0)}catch(e){console.log(0)}")
  CAPTURES=$(ZED_TRACKER="$TRACKER" node -e "try{const t=JSON.parse(require('fs').readFileSync(process.env.ZED_TRACKER,'utf8'));console.log(t.captures||0)}catch(e){console.log(0)}")
  FILE_COUNT=$(ZED_TRACKER="$TRACKER" node -e "try{const t=JSON.parse(require('fs').readFileSync(process.env.ZED_TRACKER,'utf8'));console.log((t.files||[]).length)}catch(e){console.log(0)}")
fi

# Read current iteration from progress
ITERATION=0
PROGRESS="$LOOP_DIR/progress.md"
if [ -f "$PROGRESS" ]; then
  ITERATION=$(ZED_PROGRESS="$PROGRESS" node -e "try{const c=require('fs').readFileSync(process.env.ZED_PROGRESS,'utf8');const m=c.match(/^iteration:\\s*(\\d+)/m);console.log(m?m[1]:0)}catch(e){console.log(0)}")
fi

# Read max iterations from objective
MAX_ITERATIONS=0
if [ -f "$OBJECTIVE" ]; then
  MAX_ITERATIONS=$(ZED_OBJECTIVE="$OBJECTIVE" node -e "try{const c=require('fs').readFileSync(process.env.ZED_OBJECTIVE,'utf8');const m=c.match(/^max_iterations:\\s*(\\d+)/m);console.log(m?m[1]:0)}catch(e){console.log(0)}")
fi

# Calculate drift score (0-10)
DRIFT=0
if [ "$EDIT_COUNT" -gt 30 ]; then DRIFT=$((DRIFT + 2))
elif [ "$EDIT_COUNT" -gt 20 ]; then DRIFT=$((DRIFT + 1)); fi
if [ "$FILE_COUNT" -gt 8 ]; then DRIFT=$((DRIFT + 2))
elif [ "$FILE_COUNT" -gt 5 ]; then DRIFT=$((DRIFT + 1)); fi
if [ "$ITERATION" -gt 10 ]; then DRIFT=$((DRIFT + 2))
elif [ "$ITERATION" -gt 5 ]; then DRIFT=$((DRIFT + 1)); fi

# Build blocking reasons
REASONS=""

# Gate 1: If significant work done but zero captures, block
if [ "$EDIT_COUNT" -gt 5 ] && [ "$CAPTURES" -eq 0 ]; then
  REASONS="${REASONS}CAPTURE REQUIRED: You made $EDIT_COUNT edits but captured zero knowledge. Before stopping, save at least one decision ('zed template decision <title>' via Bash) or pattern ('zed template pattern <title>' via Bash) to the vault. "
fi

# Gate 2: Check if handoff was written this iteration
HANDOFF="$LOOP_DIR/handoff.md"
if [ "$EDIT_COUNT" -gt 3 ] && [ ! -f "$HANDOFF" ]; then
  REASONS="${REASONS}HANDOFF REQUIRED: Write a structured handoff to $LOOP_DIR/handoff.md with: (1) what was accomplished with file:line refs, (2) current state (tests/build), (3) immediate next action, (4) what was captured to vault. "
fi

# Gate 3: Drift circuit breaker
if [ "$DRIFT" -ge 7 ]; then
  REASONS="${REASONS}DRIFT DETECTED (score $DRIFT/10): You are drifting. Re-read the objective at $OBJECTIVE. Confirm your current work directly serves it. If not, course-correct before continuing. "
fi

# Gate 4: If max iterations not reached, inject next iteration prompt
if [ "$MAX_ITERATIONS" -gt 0 ] && [ "$ITERATION" -lt "$MAX_ITERATIONS" ]; then
  if [ -z "$REASONS" ]; then
    # No blocking reasons, but loop isn't done — inject next iteration
    # Read objective for re-anchoring
    OBJ_TITLE=$(ZED_OBJECTIVE="$OBJECTIVE" node -e "try{const c=require('fs').readFileSync(process.env.ZED_OBJECTIVE,'utf8');const m=c.match(/^title:\\s*[\"']?(.+?)[\"']?$/m);console.log(m?m[1]:'(unknown)')}catch(e){console.log('(unknown)')}")

    REASONS="EVOLVE LOOP ACTIVE (iteration $ITERATION/$MAX_ITERATIONS). Continue working toward: $OBJ_TITLE. Steps: (1) Re-read objective at $OBJECTIVE, (2) Read progress at $PROGRESS, (3) Search vault for relevant prior work, (4) Research best practices for next task, (5) Execute one unit of work, (6) Run tests, (7) Capture knowledge, (8) Write handoff, (9) Run 'zed loop-tick' to advance iteration. "
  fi
fi

# If we have blocking reasons, block
if [ -n "$REASONS" ]; then
  # Escape for JSON
  REASONS_ESCAPED=$(echo "$REASONS" | sed 's/\\/\\\\/g' | sed 's/"/\\"/g' | tr '\n' ' ')
  printf '{"decision": "block", "reason": "%s"}\n' "$REASONS_ESCAPED"
  exit 0
fi

# All gates passed — allow stop
# Run session-end cleanup before allowing stop
"$PLUGIN_ROOT/scripts/session-end.sh" 2>/dev/null || true
exit 0
