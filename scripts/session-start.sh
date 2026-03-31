#!/bin/bash
# session-start.sh — Run on SessionStart hook
#
# Rebuilds the knowledge graph, outputs vault stats, and reminds of ZED-First Principle.

set -euo pipefail
trap 'echo "ZED hook error: $BASH_COMMAND failed" >&2' ERR

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_ROOT="${SCRIPT_DIR}/.."
DATA_DIR="${CLAUDE_PLUGIN_DATA:-$HOME/.zed-data}"
VAULT_DIR="$DATA_DIR/vault"

# Skip if vault doesn't exist yet
if [ ! -d "$VAULT_DIR" ]; then
  exit 0
fi

export ZED_DATA_DIR="$DATA_DIR"

# Rebuild graph index (graceful failure)
node "$PLUGIN_ROOT/bin/zed" rebuild >/dev/null 2>&1 || echo "ZED: Graph rebuild failed — vault may need repair. Run: zed fix"

# Output vault stats so Claude sees them at session start
echo "=== ZED Session Start ==="
node "$PLUGIN_ROOT/bin/zed" overview 2>/dev/null || echo "Vault: present (stats unavailable)"

# Check if vault is nearly empty — trigger onboarding
NOTE_COUNT=$(find "$VAULT_DIR" -name "*.md" -not -path "*/_loop/*" 2>/dev/null | wc -l | tr -d ' ')
if [ "$NOTE_COUNT" -lt 3 ]; then
  echo ""
  echo "=== ZED: New vault detected ==="
  echo "Your knowledge vault is empty. ZED will auto-scan your project on the first task."
  echo "Or run: zed scan . (to scan now)"
  echo "==============================="
fi

# Load soul document (first 30 lines)
SOUL="$PLUGIN_ROOT/memory/ZED_SOUL.md"
if [ -f "$SOUL" ]; then
  echo ""
  head -30 "$SOUL" 2>/dev/null || echo "ZED: Soul document exists but could not be read."
fi

# ZED-First Principle reminder
echo ""
echo "ZED-First Principle: Before executing any task, check if the vault has relevant context. Before finishing any task, evaluate if something should be captured."

# Cross-session continuity: surface yesterday's "Next Session" items
YESTERDAY=$(date -v-1d +%Y-%m-%d 2>/dev/null || date -d "yesterday" +%Y-%m-%d 2>/dev/null)
YESTERDAY_NOTE="$VAULT_DIR/sessions/$YESTERDAY.md"
if [ -f "$YESTERDAY_NOTE" ]; then
  # Extract content after "## Next Session" header
  NEXT_SESSION=$(sed -n '/^## Next Session/,/^## /{ /^## Next Session/d; /^## /d; p; }' "$YESTERDAY_NOTE" | head -10)
  if [ -n "$NEXT_SESSION" ] && [ "$(echo "$NEXT_SESSION" | tr -d '[:space:]')" != "" ]; then
    echo ""
    echo "=== From yesterday's session ==="
    echo "$NEXT_SESSION"
    echo "================================"
  fi
fi

# Check for active evolve loops
LOOP_OBJ="$VAULT_DIR/_loop/objective.md"
if [ -f "$LOOP_OBJ" ]; then
  if ! grep -q "completed: true" "$LOOP_OBJ" 2>/dev/null; then
    echo ""
    echo "ZED: Evolve loop active — run '/evolve --status' or '/evolve --resume' to continue."
  fi
fi

# Reset edit tracker for new session
TRACKER="$DATA_DIR/edit-tracker.json"
echo '{"edit_count":0,"files":[],"started":"'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'","captures":0}' > "$TRACKER"

echo "========================="
