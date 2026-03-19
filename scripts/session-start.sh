#!/bin/bash
# session-start.sh — Run on SessionStart hook
#
# Rebuilds the knowledge graph index and outputs a brief status.
# Output is shown to Claude as context at session start.

set -euo pipefail

PLUGIN_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATA_DIR="${CLAUDE_PLUGIN_DATA:-$HOME/.nelson-ke-data}"
VAULT_DIR="$DATA_DIR/vault"
DB_PATH="$DATA_DIR/knowledge.db"

# Skip if vault doesn't exist yet (setup not run)
if [ ! -d "$VAULT_DIR" ]; then
  exit 0
fi

# Rebuild index and output status
node -e "
  const KE = require('$PLUGIN_ROOT/core/engine.cjs');
  const engine = new KE({
    vaultPath: '$VAULT_DIR',
    dbPath: '$DB_PATH'
  });
  const result = engine.build();
  const stats = engine.getStats();

  if (stats.nodeCount > 0) {
    console.log('[KE] Knowledge Engine: ' + stats.nodeCount + ' notes, ' + stats.edgeCount + ' connections, ' + stats.clusterCount + ' clusters');

    const hubs = engine.findHubs(3);
    if (hubs.length > 0 && hubs[0].backlink_count > 0) {
      console.log('[KE] Top hubs: ' + hubs.filter(h => h.backlink_count > 0).map(h => h.title + ' (' + h.backlink_count + ')').join(', '));
    }
  }

  engine.close();
" 2>/dev/null || true
