#!/bin/bash
# post-edit-hook.sh — Lightweight edit tracker for PostToolUse hook
# Tracks edit count and unique files touched per session.

DATA_DIR="${CLAUDE_PLUGIN_DATA:-$HOME/.zed-data}"
TRACKER="$DATA_DIR/edit-tracker.json"

mkdir -p "$DATA_DIR"

# Initialize tracker if missing
if [ ! -f "$TRACKER" ]; then
  echo '{"edit_count":0,"files":[],"started":"'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'"}' > "$TRACKER"
fi

# Read current state
EDIT_COUNT=$(node -e "const t=require('$TRACKER'); console.log(t.edit_count || 0)" 2>/dev/null || echo 0)
NEW_COUNT=$((EDIT_COUNT + 1))

# Get the file being edited from CLAUDE_TOOL_ARG_file_path env var (if available)
FILE_ARG="${CLAUDE_TOOL_ARG_file_path:-unknown}"

# Update tracker atomically
node -e "
  const fs = require('fs');
  const t = JSON.parse(fs.readFileSync('$TRACKER','utf8'));
  t.edit_count = $NEW_COUNT;
  t.last_edit = new Date().toISOString();
  if ('$FILE_ARG' !== 'unknown' && !t.files.includes('$FILE_ARG')) t.files.push('$FILE_ARG');
  fs.writeFileSync('$TRACKER', JSON.stringify(t, null, 2));
  const fc = t.files.length;
  if ($NEW_COUNT > 25 || fc > 8) {
    process.stdout.write('ZED DRIFT WARNING: ' + $NEW_COUNT + ' edits across ' + fc + ' files. Consider pausing to verify scope.\\n');
  }
" 2>&1
