#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_ROOT="${SCRIPT_DIR}/.."
DATA_DIR="${CLAUDE_PLUGIN_DATA:-$HOME/.zed-data}"
VAULT_DIR="$DATA_DIR/vault"
TRACKER="$DATA_DIR/edit-tracker.json"

# Before compaction, remind Claude to flush important context
echo "ZED: Context compaction imminent. If you have unsaved decisions, patterns, or architecture insights from this session, capture them now with 'zed daily \"summary\"' or 'zed template decision \"title\"' before they are compressed."

# If evolve loop active, auto-save progress snapshot
LOOP_DIR="$VAULT_DIR/_loop"
if [ -f "$LOOP_DIR/objective.md" ]; then
  OBJECTIVE_TITLE=$(ZED_FILE="$LOOP_DIR/objective.md" node -e "
    try {
      const c = require('fs').readFileSync(process.env.ZED_FILE, 'utf8');
      const m = c.match(/^title:\\s*(.+)/m);
      console.log(m ? m[1].trim() : 'unknown');
    } catch(e) { console.log('unknown'); }
  ")
  echo "ZED: Auto-saving evolve loop context before compaction (objective: $OBJECTIVE_TITLE)"
fi

# Check edit tracker — warn if edits made but nothing captured
if [ -f "$TRACKER" ]; then
  EDITS=$(ZED_TRACKER="$TRACKER" node -e "try{console.log(JSON.parse(require('fs').readFileSync(process.env.ZED_TRACKER,'utf8')).edit_count||0)}catch(e){console.log(0)}")
  CAPS=$(ZED_TRACKER="$TRACKER" node -e "try{console.log(JSON.parse(require('fs').readFileSync(process.env.ZED_TRACKER,'utf8')).captures||0)}catch(e){console.log(0)}")
  if [ "$EDITS" -gt 0 ] && [ "$CAPS" -eq 0 ]; then
    echo "ZED WARNING: $EDITS edits made but nothing captured. Context is about to be compressed. Save important decisions NOW."
  fi
fi
