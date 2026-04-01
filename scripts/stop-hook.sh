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
trap 'echo "ZED hook error: $BASH_COMMAND failed" >&2' ERR

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

# Check cron mode state
CRON_STATE="$LOOP_DIR/cron-state.json"
CRON_ACTIVE="false"
if [ -f "$CRON_STATE" ]; then
  CRON_ACTIVE=$(ZED_CRON="$CRON_STATE" node -e "try{const s=JSON.parse(require('fs').readFileSync(process.env.ZED_CRON,'utf8'));console.log(s.active?'true':'false')}catch(e){console.log('false')}")
fi

# Read scope boundary for enforcement
SCOPE_BOUNDARY="$LOOP_DIR/scope-boundary.md"
SCOPE_VIOLATION=""
if [ -f "$SCOPE_BOUNDARY" ] && [ -f "$TRACKER" ]; then
  # Check if any edited files are outside scope boundary
  SCOPE_VIOLATION=$(ZED_TRACKER="$TRACKER" ZED_SCOPE="$SCOPE_BOUNDARY" node -e "
    try {
      const t = JSON.parse(require('fs').readFileSync(process.env.ZED_TRACKER, 'utf8'));
      const scope = require('fs').readFileSync(process.env.ZED_SCOPE, 'utf8');
      const files = t.files || [];
      const outOfScope = files.filter(f => !scope.includes(f));
      if (outOfScope.length > 0) {
        console.log('OUT_OF_SCOPE: ' + outOfScope.join(', '));
      }
    } catch(e) {}
  ")
fi

# Gate 4a: Scope violation check
if [ -n "$SCOPE_VIOLATION" ]; then
  REASONS="${REASONS}SCOPE VIOLATION: Files edited outside scope-boundary.md: $SCOPE_VIOLATION. Re-read the objective and scope boundary. Revert out-of-scope changes or justify adding these files to scope-boundary.md. "
  DRIFT=$((DRIFT + 3))
fi

# Gate 4: If max iterations not reached OR cron mode active, inject next iteration prompt
SHOULD_CONTINUE="false"
if [ "$MAX_ITERATIONS" -gt 0 ] && [ "$ITERATION" -lt "$MAX_ITERATIONS" ]; then
  SHOULD_CONTINUE="true"
elif [ "$MAX_ITERATIONS" -eq 0 ]; then
  # Unlimited iterations — always continue unless objective completed
  SHOULD_CONTINUE="true"
fi

if [ "$SHOULD_CONTINUE" = "true" ]; then
  if [ -z "$REASONS" ]; then
    # No blocking reasons, but loop isn't done — inject next iteration
    # Read objective for re-anchoring
    OBJ_TITLE=$(ZED_OBJECTIVE="$OBJECTIVE" node -e "try{const c=require('fs').readFileSync(process.env.ZED_OBJECTIVE,'utf8');const m=c.match(/^title:\\s*[\"']?(.+?)[\"']?$/m);console.log(m?m[1]:'(unknown)')}catch(e){console.log('(unknown)')}")

    if [ "$CRON_ACTIVE" = "true" ]; then
      REASONS="EVOLVE CRON LOOP ACTIVE (iteration $ITERATION). Continue working toward: $OBJ_TITLE. CRON MODE: After completing this iteration, sleep 180 seconds, then start next iteration. Steps: (1) Re-read objective at $OBJECTIVE, (2) Re-read scope boundary at $SCOPE_BOUNDARY, (3) Use 5-Level ULTRATHINK to select highest-impact next task within scope, (4) Verify task passes scope-lock sentence: 'This action achieves [objective] by [mechanism]', (5) Execute one unit of work (IMPLEMENT/FIX/TEST/HARDEN/OPTIMIZE/DOCUMENT only), (6) Run tests, (7) Capture knowledge, (8) Write handoff, (9) Run 'zed loop-tick' to advance iteration, (10) Run evolve-cron.sh tick, (11) Sleep 180 seconds, (12) Check cron-state.json — if still active, begin next iteration. "
    else
      REASONS="EVOLVE LOOP ACTIVE (iteration $ITERATION$([ "$MAX_ITERATIONS" -gt 0 ] && echo "/$MAX_ITERATIONS")). Continue working toward: $OBJ_TITLE. Steps: (1) Re-read objective at $OBJECTIVE, (2) Re-read scope boundary at $SCOPE_BOUNDARY, (3) Use 5-Level ULTRATHINK to select highest-impact next task within scope, (4) Verify task passes scope-lock sentence: 'This action achieves [objective] by [mechanism]', (5) Execute one unit of work (IMPLEMENT/FIX/TEST/HARDEN/OPTIMIZE/DOCUMENT only), (6) Run tests, (7) Capture knowledge, (8) Write handoff, (9) Run 'zed loop-tick' to advance iteration. "
    fi
  fi
fi

# If we have blocking reasons, block
if [ -n "$REASONS" ]; then
  # Use node for safe JSON construction (handles special characters)
  ZED_REASONS="$REASONS" node -e "console.log(JSON.stringify({decision:'block',reason:process.env.ZED_REASONS}))"
  exit 0
fi

# All gates passed — allow stop
# Run session-end cleanup before allowing stop
"$PLUGIN_ROOT/scripts/session-end.sh" 2>/dev/null || true
exit 0
