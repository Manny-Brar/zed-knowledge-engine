#!/bin/bash
# session-end.sh — Run on Stop hook
#
# Auto-appends session activity to today's daily note.
# Captures git changes if in a git repo.
# Checks knowledge capture count and warns if zero.

set -euo pipefail
trap 'echo "ZED hook error: $BASH_COMMAND failed" >&2' ERR

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

# Use CLAUDE_PROJECT_DIR if set, otherwise fall back to current directory
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"

# Gather git info if available (run in the project directory)
GIT_INFO=""
if (cd "$PROJECT_DIR" && git rev-parse --is-inside-work-tree) >/dev/null 2>&1; then
  CHANGED_FILES=$(cd "$PROJECT_DIR" && git diff --name-only HEAD 2>/dev/null | head -10)
  LAST_COMMIT=$(cd "$PROJECT_DIR" && git log -1 --oneline 2>/dev/null || echo "none")
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
  EDITS=$(ZED_TRACKER="$TRACKER" node -e "try{console.log(JSON.parse(require('fs').readFileSync(process.env.ZED_TRACKER,'utf8')).edit_count||0)}catch(e){console.log(0)}")
  CAPS=$(ZED_TRACKER="$TRACKER" node -e "try{console.log(JSON.parse(require('fs').readFileSync(process.env.ZED_TRACKER,'utf8')).captures||0)}catch(e){console.log(0)}")
  FILES=$(ZED_TRACKER="$TRACKER" node -e "try{console.log((JSON.parse(require('fs').readFileSync(process.env.ZED_TRACKER,'utf8')).files||[]).length)}catch(e){console.log(0)}")

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
ZED_PLUGIN_ROOT="$PLUGIN_ROOT" ZED_VAULT_DIR="$VAULT_DIR" ZED_DB_PATH="$DB_PATH" node -e "
  const KE = require(process.env.ZED_PLUGIN_ROOT + '/core/engine.cjs');
  const engine = new KE({
    vaultPath: process.env.ZED_VAULT_DIR,
    dbPath: process.env.ZED_DB_PATH
  });
  engine.build();
  engine.close();
" 2>/dev/null || true
