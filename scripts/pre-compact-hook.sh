#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_ROOT="${SCRIPT_DIR}/.."
DATA_DIR="${CLAUDE_PLUGIN_DATA:-$HOME/.zed-data}"
VAULT_DIR="$DATA_DIR/vault"

# Before compaction, remind Claude to flush important context
echo "ZED: Context compaction imminent. If you have unsaved decisions, patterns, or architecture insights from this session, capture them now with 'zed daily \"summary\"' or 'zed template decision \"title\"' before they are compressed."
