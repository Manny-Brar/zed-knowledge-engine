#!/bin/bash
# ZED Knowledge Engine — Uninstaller
# Usage: ./uninstall.sh
# Removes plugin registration, cache, and marketplace.
# Preserves vault data at ~/.zed-data/

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}ZED Knowledge Engine — Uninstaller${NC}"
echo ""

PLUGIN_NAME="zed"
MARKETPLACE_NAME="zed-marketplace"
CLAUDE_DIR="$HOME/.claude"
PLUGINS_DIR="$CLAUDE_DIR/plugins"

# --- Remove from settings.json (enabledPlugins) ---
SETTINGS="$CLAUDE_DIR/settings.json"
if [ -f "$SETTINGS" ]; then
  node -e "
const fs = require('fs');
const path = '${SETTINGS}';
const data = JSON.parse(fs.readFileSync(path, 'utf-8'));
if (data.enabledPlugins) {
  delete data.enabledPlugins['${PLUGIN_NAME}@${MARKETPLACE_NAME}'];
}
fs.writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
" && echo -e "${GREEN}✓${NC} Removed from settings.json" \
  || echo -e "${YELLOW}  Warning: Could not update settings.json${NC}"
else
  echo -e "${YELLOW}  settings.json not found — skipping${NC}"
fi

# --- Remove from installed_plugins.json ---
INSTALLED="$PLUGINS_DIR/installed_plugins.json"
if [ -f "$INSTALLED" ]; then
  node -e "
const fs = require('fs');
const path = '${INSTALLED}';
const data = JSON.parse(fs.readFileSync(path, 'utf-8'));
if (data.plugins) {
  delete data.plugins['${PLUGIN_NAME}@${MARKETPLACE_NAME}'];
}
fs.writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
" && echo -e "${GREEN}✓${NC} Removed from installed_plugins.json" \
  || echo -e "${YELLOW}  Warning: Could not update installed_plugins.json${NC}"
else
  echo -e "${YELLOW}  installed_plugins.json not found — skipping${NC}"
fi

# --- Remove from known_marketplaces.json ---
KNOWN_MKT="$PLUGINS_DIR/known_marketplaces.json"
if [ -f "$KNOWN_MKT" ]; then
  node -e "
const fs = require('fs');
const path = '${KNOWN_MKT}';
const data = JSON.parse(fs.readFileSync(path, 'utf-8'));
delete data['${MARKETPLACE_NAME}'];
fs.writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
" && echo -e "${GREEN}✓${NC} Removed from known_marketplaces.json" \
  || echo -e "${YELLOW}  Warning: Could not update known_marketplaces.json${NC}"
else
  echo -e "${YELLOW}  known_marketplaces.json not found — skipping${NC}"
fi

# --- Remove cache directory ---
CACHE_DIR="$PLUGINS_DIR/cache/$MARKETPLACE_NAME"
if [ -d "$CACHE_DIR" ]; then
  rm -rf "$CACHE_DIR"
  echo -e "${GREEN}✓${NC} Removed cache directory"
else
  echo -e "${YELLOW}  Cache directory not found — skipping${NC}"
fi

# --- Remove legacy install directory ---
LEGACY_DIR="$PLUGINS_DIR/ZED"
if [ -d "$LEGACY_DIR" ]; then
  rm -rf "$LEGACY_DIR"
  echo -e "${GREEN}✓${NC} Removed legacy install directory"
fi

# --- Remove marketplace directory ---
MARKETPLACE_DIR="$PLUGINS_DIR/repos/$MARKETPLACE_NAME"
if [ -d "$MARKETPLACE_DIR" ]; then
  rm -rf "$MARKETPLACE_DIR"
  echo -e "${GREEN}✓${NC} Removed marketplace directory"
else
  echo -e "${YELLOW}  Marketplace directory not found — skipping${NC}"
fi

# --- Remove plugin data directory ---
PLUGIN_DATA="$PLUGINS_DIR/data/$PLUGIN_NAME-$MARKETPLACE_NAME"
if [ -d "$PLUGIN_DATA" ]; then
  rm -rf "$PLUGIN_DATA"
  echo -e "${GREEN}✓${NC} Removed plugin data directory"
fi

echo ""
echo -e "${GREEN}ZED plugin removed.${NC}"
echo ""
echo "Your vault data at ~/.zed-data/ was preserved."
echo "To also remove vault data: rm -rf ~/.zed-data/"
echo ""
echo "Restart Claude Code to complete removal."
echo ""
