#!/bin/bash
trap 'echo "ZED pre-tool hook error: $BASH_COMMAND" >&2' ERR

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DATA_DIR="${CLAUDE_PLUGIN_DATA:-$HOME/.zed-data}"
TRACKER="$DATA_DIR/edit-tracker.json"
LOOP_DIR="$DATA_DIR/vault/_loop"
SCOPE_BOUNDARY="$LOOP_DIR/scope-boundary.md"
OBJECTIVE="$LOOP_DIR/objective.md"

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
