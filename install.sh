#!/bin/bash
# ZED Knowledge Engine — Installer
# Usage: ./install.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_NAME="zed"
MARKETPLACE_NAME="zed-marketplace"
CLAUDE_DIR="$HOME/.claude"
PLUGINS_DIR="$CLAUDE_DIR/plugins"
INSTALL_DIR="$PLUGINS_DIR/ZED"

echo "Installing ZED Knowledge Engine..."

# 1. Install npm dependencies
echo "  Installing dependencies..."
cd "$SCRIPT_DIR"
npm install --silent

# 2. Create install directory and copy plugin files
echo "  Setting up plugin directory..."
mkdir -p "$INSTALL_DIR"/{.claude-plugin,commands,skills,agents,hooks}

# Copy plugin files (not the full source repo)
cp -r "$SCRIPT_DIR/.claude-plugin/"* "$INSTALL_DIR/.claude-plugin/"
cp -r "$SCRIPT_DIR/commands/"* "$INSTALL_DIR/commands/"
cp -r "$SCRIPT_DIR/agents/"* "$INSTALL_DIR/agents/"
cp -r "$SCRIPT_DIR/hooks/"* "$INSTALL_DIR/hooks/"

# Flatten skills if needed
for f in "$SCRIPT_DIR/skills/"*.md; do
  cp "$f" "$INSTALL_DIR/skills/$(basename "$f")"
done

# Create .mcp.json with absolute paths
cat > "$INSTALL_DIR/.mcp.json" << MCPEOF
{
  "mcpServers": {
    "zed-knowledge-engine": {
      "command": "node",
      "args": ["$SCRIPT_DIR/server/mcp-server.mjs"],
      "env": {
        "CLAUDE_PLUGIN_DATA": "$PLUGINS_DIR/data/$PLUGIN_NAME-$MARKETPLACE_NAME"
      }
    }
  }
}
MCPEOF

# Fix hooks to use absolute paths
cat > "$INSTALL_DIR/hooks/hooks.json" << HOOKEOF
{
  "hooks": {
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "$SCRIPT_DIR/scripts/session-end.sh",
            "timeout": 10000
          }
        ]
      }
    ]
  }
}
HOOKEOF

# 3. Create marketplace
echo "  Creating marketplace..."
MARKETPLACE_DIR="$PLUGINS_DIR/repos/$MARKETPLACE_NAME"
mkdir -p "$MARKETPLACE_DIR/.claude-plugin"
cat > "$MARKETPLACE_DIR/.claude-plugin/marketplace.json" << MKTEOF
{
  "\$schema": "https://anthropic.com/claude-code/marketplace.schema.json",
  "name": "$MARKETPLACE_NAME",
  "version": "1.0.0",
  "description": "ZED Knowledge Engine marketplace",
  "owner": { "name": "$(git config user.name 2>/dev/null || echo 'User')" },
  "plugins": [
    {
      "name": "$PLUGIN_NAME",
      "description": "ZED Knowledge Engine — persistent memory + structured execution for Claude Code",
      "version": "$(node -e "console.log(require('./package.json').version)")",
      "source": "./zed-knowledge-engine"
    }
  ]
}
MKTEOF

# Symlink source into marketplace
ln -sf "$SCRIPT_DIR" "$MARKETPLACE_DIR/zed-knowledge-engine"

# 4. Register marketplace in known_marketplaces.json
echo "  Registering marketplace..."
KNOWN_MKT="$PLUGINS_DIR/known_marketplaces.json"
if [ ! -f "$KNOWN_MKT" ]; then
  echo "{}" > "$KNOWN_MKT"
fi
# Use node for safe JSON merging
node -e "
const fs = require('fs');
const data = JSON.parse(fs.readFileSync('$KNOWN_MKT', 'utf-8'));
data['$MARKETPLACE_NAME'] = {
  source: { source: 'directory', path: '$MARKETPLACE_DIR' },
  installLocation: '$MARKETPLACE_DIR',
  lastUpdated: new Date().toISOString()
};
fs.writeFileSync('$KNOWN_MKT', JSON.stringify(data, null, 2));
"

# 5. Register plugin in installed_plugins.json
echo "  Registering plugin..."
INSTALLED="$PLUGINS_DIR/installed_plugins.json"
if [ ! -f "$INSTALLED" ]; then
  echo '{"version":2,"plugins":{}}' > "$INSTALLED"
fi
node -e "
const fs = require('fs');
const data = JSON.parse(fs.readFileSync('$INSTALLED', 'utf-8'));
if (!data.plugins) data.plugins = {};
data.plugins['$PLUGIN_NAME@$MARKETPLACE_NAME'] = [{
  scope: 'user',
  installPath: '$INSTALL_DIR',
  version: '$(node -e "console.log(require('./package.json').version)")',
  installedAt: new Date().toISOString(),
  lastUpdated: new Date().toISOString()
}];
fs.writeFileSync('$INSTALLED', JSON.stringify(data, null, 2));
"

# 6. Enable plugin in settings.json
echo "  Enabling plugin..."
SETTINGS="$CLAUDE_DIR/settings.json"
if [ ! -f "$SETTINGS" ]; then
  echo '{}' > "$SETTINGS"
fi
node -e "
const fs = require('fs');
const data = JSON.parse(fs.readFileSync('$SETTINGS', 'utf-8'));
if (!data.enabledPlugins) data.enabledPlugins = {};
data.enabledPlugins['$PLUGIN_NAME@$MARKETPLACE_NAME'] = true;
fs.writeFileSync('$SETTINGS', JSON.stringify(data, null, 2));
"

# 7. Create plugin data directory
mkdir -p "$PLUGINS_DIR/data/$PLUGIN_NAME-$MARKETPLACE_NAME"

echo ""
echo "ZED Knowledge Engine installed successfully!"
echo ""
echo "Restart Claude Code to activate. After restart:"
echo "  /zed:help     -- Full command reference"
echo "  /zed:overview -- Vault dashboard"
echo "  /zed          -- Activate Full mode"
echo ""
