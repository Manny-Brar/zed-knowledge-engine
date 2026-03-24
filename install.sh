#!/bin/bash
# ZED Knowledge Engine — Installer
# Usage: ./install.sh
# Idempotent — safe to re-run at any time.

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}ZED Knowledge Engine — Installer${NC}"
echo ""

# --- Dependency checks ---
check_cmd() {
  if ! command -v "$1" &>/dev/null; then
    echo -e "${RED}ERROR: $1 not found. Please install $1 first.${NC}"
    exit 1
  fi
}
check_cmd node
check_cmd npm
check_cmd git
check_cmd rsync

# Check Node version (need 18+)
NODE_VER=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VER" -lt 18 ]; then
  echo -e "${RED}ERROR: Node.js 18+ required (found $(node -v))${NC}"
  exit 1
fi

NPM_VER=$(npm -v | cut -d. -f1)
echo -e "${GREEN}✓${NC} Dependencies checked (Node v${NODE_VER}, npm v${NPM_VER})"

# --- Resolve paths ---
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
VERSION=$(node -e "console.log(require('${SCRIPT_DIR}/package.json').version)")
PLUGIN_NAME="zed"
MARKETPLACE_NAME="zed-marketplace"
CLAUDE_DIR="$HOME/.claude"
PLUGINS_DIR="$CLAUDE_DIR/plugins"
CACHE_DIR="$PLUGINS_DIR/cache/$MARKETPLACE_NAME/$PLUGIN_NAME/$VERSION"
MARKETPLACE_DIR="$PLUGINS_DIR/repos/$MARKETPLACE_NAME"

# --- Install npm dependencies in source ---
cd "$SCRIPT_DIR"
npm install --silent 2>&1 || {
  echo -e "${RED}ERROR: npm install failed. Check network connection and try again.${NC}"
  exit 1
}
echo -e "${GREEN}✓${NC} npm packages installed"

# --- Clear old plugin cache ---
echo -e "${YELLOW}  Clearing plugin cache...${NC}"
rm -rf "$PLUGINS_DIR/cache/$MARKETPLACE_NAME/$PLUGIN_NAME/" 2>/dev/null || true
# Also remove legacy install location if it exists
rm -rf "$PLUGINS_DIR/ZED" 2>/dev/null || true

# --- Copy plugin files to cache (including node_modules) ---
mkdir -p "$CACHE_DIR"
rsync -a \
  --exclude='.git' \
  --exclude='cli/test-*.cjs' \
  --exclude='core/test.cjs' \
  --exclude='core/bench.cjs' \
  "$SCRIPT_DIR/" "$CACHE_DIR/"
echo -e "${GREEN}✓${NC} Plugin files copied to ${CACHE_DIR}"

# --- Create .mcp.json with absolute paths in cache ---
cat > "$CACHE_DIR/.mcp.json" << MCPEOF
{
  "mcpServers": {
    "zed-knowledge-engine": {
      "command": "node",
      "args": ["${CACHE_DIR}/server/mcp-server.mjs"],
      "env": {
        "CLAUDE_PLUGIN_DATA": "${PLUGINS_DIR}/data/${PLUGIN_NAME}-${MARKETPLACE_NAME}"
      }
    }
  }
}
MCPEOF

# --- Fix hooks to use absolute paths in cache ---
cat > "$CACHE_DIR/hooks/hooks.json" << HOOKEOF
{
  "hooks": {
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "${CACHE_DIR}/scripts/session-end.sh",
            "timeout": 10000
          }
        ]
      }
    ]
  }
}
HOOKEOF

# --- Create marketplace ---
mkdir -p "$MARKETPLACE_DIR/.claude-plugin"
GIT_USER=$(git config user.name 2>/dev/null || echo 'User')
cat > "$MARKETPLACE_DIR/.claude-plugin/marketplace.json" << MKTEOF
{
  "\$schema": "https://anthropic.com/claude-code/marketplace.schema.json",
  "name": "${MARKETPLACE_NAME}",
  "version": "1.0.0",
  "description": "ZED Knowledge Engine marketplace",
  "owner": { "name": "${GIT_USER}" },
  "plugins": [
    {
      "name": "${PLUGIN_NAME}",
      "description": "ZED Knowledge Engine — persistent memory + structured execution for Claude Code",
      "version": "${VERSION}",
      "source": "./zed-knowledge-engine"
    }
  ]
}
MKTEOF

# Symlink source into marketplace
ln -sf "$SCRIPT_DIR" "$MARKETPLACE_DIR/zed-knowledge-engine"
echo -e "${GREEN}✓${NC} Marketplace registered"

# --- Register marketplace in known_marketplaces.json ---
KNOWN_MKT="$PLUGINS_DIR/known_marketplaces.json"
if [ ! -f "$KNOWN_MKT" ]; then
  echo '{}' > "$KNOWN_MKT"
fi
node -e "
const fs = require('fs');
const path = '${KNOWN_MKT}';
const data = JSON.parse(fs.readFileSync(path, 'utf-8'));
data['${MARKETPLACE_NAME}'] = {
  source: { source: 'directory', path: '${MARKETPLACE_DIR}' },
  installLocation: '${MARKETPLACE_DIR}',
  lastUpdated: new Date().toISOString()
};
fs.writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
" || {
  echo -e "${RED}ERROR: Failed to register marketplace in known_marketplaces.json${NC}"
  exit 1
}

# --- Register plugin in installed_plugins.json ---
INSTALLED="$PLUGINS_DIR/installed_plugins.json"
if [ ! -f "$INSTALLED" ]; then
  echo '{"version":2,"plugins":{}}' > "$INSTALLED"
fi
node -e "
const fs = require('fs');
const path = '${INSTALLED}';
const data = JSON.parse(fs.readFileSync(path, 'utf-8'));
if (!data.plugins) data.plugins = {};
const key = '${PLUGIN_NAME}@${MARKETPLACE_NAME}';
const now = new Date().toISOString();
const existing = data.plugins[key];
data.plugins[key] = [{
  scope: 'user',
  installPath: '${CACHE_DIR}',
  version: '${VERSION}',
  installedAt: existing && existing[0] ? existing[0].installedAt : now,
  lastUpdated: now
}];
fs.writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
" || {
  echo -e "${RED}ERROR: Failed to register plugin in installed_plugins.json${NC}"
  exit 1
}
echo -e "${GREEN}✓${NC} Plugin registered"

# --- Enable plugin in settings.json ---
SETTINGS="$CLAUDE_DIR/settings.json"
if [ ! -f "$SETTINGS" ]; then
  echo '{}' > "$SETTINGS"
fi
node -e "
const fs = require('fs');
const path = '${SETTINGS}';
const data = JSON.parse(fs.readFileSync(path, 'utf-8'));
if (!data.enabledPlugins) data.enabledPlugins = {};
data.enabledPlugins['${PLUGIN_NAME}@${MARKETPLACE_NAME}'] = true;
fs.writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
" || {
  echo -e "${RED}ERROR: Failed to enable plugin in settings.json${NC}"
  exit 1
}
echo -e "${GREEN}✓${NC} Plugin enabled"

# --- Create plugin data directory ---
mkdir -p "$PLUGINS_DIR/data/$PLUGIN_NAME-$MARKETPLACE_NAME"

# --- Protect vault from accidental git commits ---
if [ ! -f "$HOME/.zed-data/.gitignore" ]; then
  mkdir -p "$HOME/.zed-data"
  echo "# ZED vault data — do not commit" > "$HOME/.zed-data/.gitignore"
  echo "*" >> "$HOME/.zed-data/.gitignore"
fi

echo ""
echo -e "${GREEN}ZED v${VERSION} installed successfully!${NC}"
echo -e "Restart Claude Code to activate."
echo ""
echo "  /zed:help     -- Full command reference"
echo "  /zed:overview -- Vault dashboard"
echo "  /zed          -- Activate Full mode"
echo ""
