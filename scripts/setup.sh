#!/bin/bash
# setup.sh — Nelson Knowledge Engine post-install setup
#
# Creates data directories, installs dependencies, and initializes the database.
# Uses ${CLAUDE_PLUGIN_DATA} for persistent storage across plugin updates.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_ROOT="$(dirname "$SCRIPT_DIR")"
DATA_DIR="${CLAUDE_PLUGIN_DATA:-$HOME/.nelson-ke-data}"

echo "Nelson Knowledge Engine v6 — Setup"
echo "==================================="
echo "Plugin root: $PLUGIN_ROOT"
echo "Data directory: $DATA_DIR"

# Create data directories
mkdir -p "$DATA_DIR/vault/decisions"
mkdir -p "$DATA_DIR/vault/patterns"
mkdir -p "$DATA_DIR/vault/sessions"
mkdir -p "$DATA_DIR/vault/architecture"

echo "✓ Data directories created"

# Install Node dependencies if needed
if [ ! -d "$PLUGIN_ROOT/node_modules" ]; then
  echo "Installing dependencies..."
  cd "$PLUGIN_ROOT"

  # Handle macOS C++ header issue for better-sqlite3
  if [[ "$(uname)" == "Darwin" ]]; then
    SDK_PATH="$(xcrun --show-sdk-path 2>/dev/null || true)"
    if [ -n "$SDK_PATH" ]; then
      export CXXFLAGS="-I${SDK_PATH}/usr/include/c++/v1 -isysroot ${SDK_PATH}"
    fi
  fi

  npm install --production 2>&1 | tail -3
  echo "✓ Dependencies installed"
else
  echo "✓ Dependencies already installed"
fi

# Initialize knowledge database
echo "Initializing knowledge graph..."
node -e "
  const KE = require('$PLUGIN_ROOT/core/engine.cjs');
  const engine = new KE({
    vaultPath: '$DATA_DIR/vault',
    dbPath: '$DATA_DIR/knowledge.db'
  });
  const result = engine.build();
  console.log('  Notes:', result.nodeCount, '| Connections:', result.edgeCount);
  engine.close();
"
echo "✓ Knowledge graph initialized"

# Create default config if not exists
CONFIG_FILE="$DATA_DIR/config.json"
if [ ! -f "$CONFIG_FILE" ]; then
  cat > "$CONFIG_FILE" << 'EOFCONFIG'
{
  "version": "6.0.0",
  "vault_path": null,
  "auto_daily": true,
  "auto_capture": true,
  "rebuild_on_start": true
}
EOFCONFIG
  echo "✓ Default config created"
else
  echo "✓ Config already exists"
fi

# Create index note if vault is empty
INDEX_FILE="$DATA_DIR/vault/index.md"
if [ ! -f "$INDEX_FILE" ]; then
  cat > "$INDEX_FILE" << 'EOFINDEX'
---
title: Knowledge Index
type: index
tags: [index, core]
---

# Knowledge Index

Welcome to your Nelson Knowledge Engine vault.

## Quick Start

- Use `/ke:decide` to record a decision
- Use `/ke:search` to find knowledge
- Use `/ke:daily` to view today's session notes
- Use `/ke:status` to see vault statistics
- Use `/ke:graph` to visualize your knowledge graph

## Structure

- [[decisions/]] — Architecture Decision Records
- [[patterns/]] — Reusable patterns and anti-patterns
- [[sessions/]] — Daily session notes
- [[architecture/]] — Architecture documentation
EOFINDEX
  echo "✓ Index note created"
fi

echo ""
echo "Setup complete! Start using the Knowledge Engine with /ke:help"
