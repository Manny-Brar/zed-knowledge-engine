#!/bin/bash
# session-start.sh — Run on SessionStart hook
#
# Rebuilds the knowledge graph and outputs a brief status via CLI.

set -euo pipefail

PLUGIN_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATA_DIR="${CLAUDE_PLUGIN_DATA:-$HOME/.zed-data}"
VAULT_DIR="$DATA_DIR/vault"

# Skip if vault doesn't exist yet
if [ ! -d "$VAULT_DIR" ]; then
  exit 0
fi

export ZED_DATA_DIR="$DATA_DIR"

# Rebuild graph silently
node "$PLUGIN_ROOT/bin/zed" rebuild >/dev/null 2>&1 || true

# Show overview
node "$PLUGIN_ROOT/bin/zed" overview 2>/dev/null || true

# Check for active evolve loop
LOOP_OBJ="$VAULT_DIR/_loop/objective.md"
if [ -f "$LOOP_OBJ" ]; then
  # Check if completed
  if ! grep -q "completed: true" "$LOOP_OBJ" 2>/dev/null; then
    echo ""
    echo "ZED: Evolve loop active — run '/evolve --status' or '/evolve --resume' to continue."
  fi
fi
