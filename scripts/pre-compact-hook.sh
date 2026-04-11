#!/bin/bash
# pre-compact-hook.sh — ZED v8.0 PreCompact hook
#
# Before Claude's conversation gets compacted, capture recent vault
# activity as a durable wiki/syntheses/ note. This turns an otherwise
# destructive compaction into a search-indexed artifact that future
# sessions can pick up via zed_search.
#
# Also warns loudly if there are uncaptured edits, and snapshots evolve
# loop state.

set -euo pipefail
trap 'echo "ZED hook error: $BASH_COMMAND failed" >&2' ERR

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_ROOT="${SCRIPT_DIR}/.."
DATA_DIR="${CLAUDE_PLUGIN_DATA:-$HOME/.zed-data}"
VAULT_DIR="$DATA_DIR/vault"
TRACKER="$DATA_DIR/edit-tracker.json"

export ZED_DATA_DIR="$DATA_DIR"

echo "=== ZED PreCompact hook ==="

# v8.0: persist the last few hours of vault activity as a searchable
# synthesis note under wiki/syntheses/. Deterministic — no LLM needed.
if [ -d "$VAULT_DIR" ]; then
  SYNTH_OUTPUT=$(node "$PLUGIN_ROOT/bin/zed" compile --synthesize --since 4 --label pre-compact 2>&1 || true)
  if [ -n "$SYNTH_OUTPUT" ]; then
    echo "$SYNTH_OUTPUT"
  fi
fi

# Remind Claude to flush important context
echo ""
echo "ZED: Context compaction imminent. If you have unsaved decisions,"
echo "patterns, or architecture insights, capture them NOW with"
echo "'zed_decide' / 'zed_write_note' before they are compressed."

# If evolve loop active, mention it
LOOP_DIR="$VAULT_DIR/_loop"
if [ -f "$LOOP_DIR/objective.md" ]; then
  OBJECTIVE_TITLE=$(ZED_FILE="$LOOP_DIR/objective.md" node -e "
    try {
      const c = require('fs').readFileSync(process.env.ZED_FILE, 'utf8');
      const m = c.match(/^title:\\s*(.+)/m);
      console.log(m ? m[1].trim() : 'unknown');
    } catch(e) { console.log('unknown'); }
  ")
  echo "ZED: Evolve loop objective preserved: $OBJECTIVE_TITLE"
fi

# Check edit tracker — warn if edits made but nothing captured
if [ -f "$TRACKER" ]; then
  EDITS=$(ZED_TRACKER="$TRACKER" node -e "try{console.log(JSON.parse(require('fs').readFileSync(process.env.ZED_TRACKER,'utf8')).edit_count||0)}catch(e){console.log(0)}")
  CAPS=$(ZED_TRACKER="$TRACKER" node -e "try{console.log(JSON.parse(require('fs').readFileSync(process.env.ZED_TRACKER,'utf8')).captures||0)}catch(e){console.log(0)}")
  if [ "$EDITS" -gt 0 ] && [ "$CAPS" -eq 0 ]; then
    echo ""
    echo "ZED WARNING: $EDITS edits made but nothing captured. Context is about to be"
    echo "  compressed. Save important decisions NOW via zed_decide or zed_write_note."
  fi
fi

echo "=========================="
