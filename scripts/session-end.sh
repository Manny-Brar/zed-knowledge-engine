#!/bin/bash
# session-end.sh — Run on Stop hook
#
# Auto-appends session activity to today's daily note.
# Captures git changes if in a git repo.
# Checks knowledge capture count and warns if zero.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_ROOT="${SCRIPT_DIR}/.."
DATA_DIR="${CLAUDE_PLUGIN_DATA:-$HOME/.zed-data}"
VAULT_DIR="$DATA_DIR/vault"
DB_PATH="$DATA_DIR/knowledge.db"
DATE=$(date +%Y-%m-%d)
TIME=$(date +%H:%M)
DAILY_NOTE="$VAULT_DIR/sessions/$DATE.md"
TRACKER="$DATA_DIR/edit-tracker.json"

# Skip if vault doesn't exist
if [ ! -d "$VAULT_DIR" ]; then
  exit 0
fi

# Gather git info if available
GIT_INFO=""
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  CHANGED_FILES=$(git diff --name-only HEAD 2>/dev/null | head -10)
  LAST_COMMIT=$(git log -1 --oneline 2>/dev/null || echo "none")
  if [ -n "$CHANGED_FILES" ]; then
    GIT_INFO="### Session Activity ($TIME)\n- Last commit: $LAST_COMMIT\n- Files changed:\n$(echo "$CHANGED_FILES" | sed 's/^/  - /')"
  fi
fi

# Auto-create daily note if it doesn't exist
if [ ! -f "$DAILY_NOTE" ]; then
  mkdir -p "$(dirname "$DAILY_NOTE")"
  cat > "$DAILY_NOTE" << DAILY_EOF
---
title: "Session $(date +%Y-%m-%d)"
type: daily
tags: [daily]
date: $(date +%Y-%m-%d)
---

# Session $(date +%Y-%m-%d)

## Work Done

## Decisions Made

## Next Session
DAILY_EOF
fi

# Append to daily note if it exists
if [ -f "$DAILY_NOTE" ] && [ -n "$GIT_INFO" ]; then
  echo "" >> "$DAILY_NOTE"
  printf '%s\n' "$GIT_INFO" >> "$DAILY_NOTE"
fi

# Protocol adherence summary
if [ -f "$TRACKER" ]; then
  EDITS=$(node -e "try{console.log(JSON.parse(require('fs').readFileSync('$TRACKER','utf8')).edit_count||0)}catch(e){console.log(0)}")
  CAPS=$(node -e "try{console.log(JSON.parse(require('fs').readFileSync('$TRACKER','utf8')).captures||0)}catch(e){console.log(0)}")
  FILES=$(node -e "try{console.log((JSON.parse(require('fs').readFileSync('$TRACKER','utf8')).files||[]).length)}catch(e){console.log(0)}")

  echo ""
  echo "=== ZED Session Summary ==="
  echo "  Edits: $EDITS  |  Files touched: $FILES  |  Knowledge captured: $CAPS"

  # Capture ratio
  if [ "$EDITS" -gt 0 ]; then
    if [ "$CAPS" -gt 0 ]; then
      echo "  Capture ratio: good ($CAPS captures / $EDITS edits)"
    elif [ "$EDITS" -gt 5 ]; then
      echo "  Capture ratio: LOW — $EDITS edits but $CAPS captures. Consider recording decisions."
    fi
  fi
  echo "==========================="

  # Append session summary to daily note
  if [ -f "$DAILY_NOTE" ] && [ "$EDITS" -gt 0 ]; then
    printf '\n### Session Summary (%s)\n  Edits: %s | Files: %s | Captured: %s\n' \
      "$(date +%H:%M)" "$EDITS" "$FILES" "$CAPS" >> "$DAILY_NOTE"
  fi

  # Reset the edit tracker
  rm -f "$TRACKER"
fi

# Rebuild graph to pick up any new notes
node -e "
  const KE = require('$PLUGIN_ROOT/core/engine.cjs');
  const engine = new KE({
    vaultPath: '$VAULT_DIR',
    dbPath: '$DB_PATH'
  });
  engine.build();
  engine.close();
" 2>/dev/null || true
