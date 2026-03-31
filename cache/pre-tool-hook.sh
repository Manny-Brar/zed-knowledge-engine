#!/bin/bash
trap 'echo "ZED pre-tool hook error: $BASH_COMMAND" >&2' ERR

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DATA_DIR="${CLAUDE_PLUGIN_DATA:-$HOME/.zed-data}"
TRACKER="$DATA_DIR/edit-tracker.json"

# Read current drift metrics
if [ ! -f "$TRACKER" ]; then
  exit 0  # No tracker = no drift data = allow
fi

EDIT_COUNT=$(ZED_TRACKER="$TRACKER" node -e "try{console.log(JSON.parse(require('fs').readFileSync(process.env.ZED_TRACKER,'utf8')).edit_count||0)}catch(e){console.log(0)}")
FILE_COUNT=$(ZED_TRACKER="$TRACKER" node -e "try{console.log((JSON.parse(require('fs').readFileSync(process.env.ZED_TRACKER,'utf8')).files||[]).length)}catch(e){console.log(0)}")

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
