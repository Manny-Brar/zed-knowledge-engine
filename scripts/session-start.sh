#!/bin/bash
# session-start.sh — Run on SessionStart hook
#
# Rebuilds the knowledge graph, outputs vault stats, and reminds of ZED-First Principle.

set -euo pipefail

PLUGIN_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATA_DIR="${CLAUDE_PLUGIN_DATA:-$HOME/.zed-data}"
VAULT_DIR="$DATA_DIR/vault"

# Skip if vault doesn't exist yet
if [ ! -d "$VAULT_DIR" ]; then
  exit 0
fi

export ZED_DATA_DIR="$DATA_DIR"

# Rebuild graph index
node "$PLUGIN_ROOT/bin/zed" rebuild >/dev/null 2>&1 || true

# Output vault stats so Claude sees them at session start
echo "=== ZED Session Start ==="
node "$PLUGIN_ROOT/bin/zed" overview 2>/dev/null || echo "Vault: present (stats unavailable)"

# ZED-First Principle reminder
echo ""
echo "ZED-First Principle: Before executing any task, check if the vault has relevant context. Before finishing any task, evaluate if something should be captured."

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
