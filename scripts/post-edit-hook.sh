#!/bin/bash
# post-edit-hook.sh — Lightweight edit tracker for PostToolUse hook
# Tracks edit count and unique files touched per session.

set -euo pipefail
trap 'echo "ZED hook error: $BASH_COMMAND failed" >&2' ERR

DATA_DIR="${CLAUDE_PLUGIN_DATA:-$HOME/.zed-data}"
TRACKER="$DATA_DIR/edit-tracker.json"

mkdir -p "$DATA_DIR"

# Initialize tracker if missing
if [ ! -f "$TRACKER" ]; then
  echo '{"edit_count":0,"files":[],"started":"'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'"}' > "$TRACKER"
fi

# Read current state
EDIT_COUNT=$(ZED_TRACKER="$TRACKER" node -e "try{const t=JSON.parse(require('fs').readFileSync(process.env.ZED_TRACKER,'utf8'));console.log(t.edit_count||0)}catch(e){console.log(0)}" 2>/dev/null || echo 0)
NEW_COUNT=$((EDIT_COUNT + 1))

# Get the file being edited from CLAUDE_TOOL_ARG_file_path env var (if available)
FILE_ARG="${CLAUDE_TOOL_ARG_file_path:-unknown}"

# Update tracker atomically
ZED_TRACKER="$TRACKER" ZED_FILE="$FILE_ARG" node -e "
  try {
    const fs = require('fs');
    const t = JSON.parse(fs.readFileSync(process.env.ZED_TRACKER, 'utf8'));
    t.edit_count = (t.edit_count || 0) + 1;
    t.last_edit = new Date().toISOString();
    const f = process.env.ZED_FILE;
    if (f && f !== 'unknown' && !t.files.includes(f)) t.files.push(f);
    fs.writeFileSync(process.env.ZED_TRACKER, JSON.stringify(t, null, 2));
    const fc = t.files.length;
    if (t.edit_count > 25 || fc > 8) {
      process.stdout.write('ZED DRIFT WARNING: ' + t.edit_count + ' edits across ' + fc + ' files. Consider pausing to verify scope.\n');
    }
  } catch(e) {}
" 2>&1
