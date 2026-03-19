#!/bin/bash
# session-end.sh — Run on Stop hook
#
# Auto-appends session activity to today's daily note.
# Captures git changes if in a git repo.

set -euo pipefail

PLUGIN_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATA_DIR="${CLAUDE_PLUGIN_DATA:-$HOME/.zed-data}"
VAULT_DIR="$DATA_DIR/vault"
DB_PATH="$DATA_DIR/knowledge.db"
DATE=$(date +%Y-%m-%d)
TIME=$(date +%H:%M)
DAILY_NOTE="$VAULT_DIR/sessions/$DATE.md"

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

# Append to daily note if it exists
if [ -f "$DAILY_NOTE" ] && [ -n "$GIT_INFO" ]; then
  echo "" >> "$DAILY_NOTE"
  echo -e "$GIT_INFO" >> "$DAILY_NOTE"
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
