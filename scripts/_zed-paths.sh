#!/bin/bash
# _zed-paths.sh — canonical ZED path resolution for hooks (SOURCED, not executed).
#
# Makes the bash hooks agree with `bin/zed` and the MCP server by resolving
# paths through core/config.cjs — the single source of truth that honors
# ZED_VAULT_ROOT / ZED_VAULT_DIR / ZED_DATA_DIR / ZED_DB_PATH. Before this,
# every hook hardcoded `DATA_DIR=${CLAUDE_PLUGIN_DATA:-~/.zed-data}` and
# `VAULT_DIR=$DATA_DIR/vault`, so once ZED_VAULT_ROOT pointed at an external
# Obsidian vault (e.g. NELSON) the hook's bash logic and its own `node bin/zed`
# calls disagreed — producing false "empty vault" / "rebuild failed" banners.
#
# Caller contract: set PLUGIN_ROOT before sourcing. On success this sets
# DATA_DIR, VAULT_DIR, DB_PATH from config.cjs. On ANY failure it falls back to
# the legacy ad-hoc layout so a hook can never break.

_zed_resolved=""
if [ -n "${PLUGIN_ROOT:-}" ] && [ -f "${PLUGIN_ROOT}/core/config.cjs" ]; then
  _zed_resolved=$(ZED_CFG="${PLUGIN_ROOT}/core/config.cjs" node -e '
    try {
      const c = require(process.env.ZED_CFG);
      process.stdout.write([c.resolveDataDir(), c.resolveVaultDir(), c.resolveDbPath(), c.resolveLoopDir()].join("\n"));
    } catch (e) { process.exit(1); }
  ' 2>/dev/null) || _zed_resolved=""
fi

if [ -n "$_zed_resolved" ]; then
  DATA_DIR=$(printf '%s\n' "$_zed_resolved" | sed -n '1p')
  VAULT_DIR=$(printf '%s\n' "$_zed_resolved" | sed -n '2p')
  DB_PATH=$(printf '%s\n' "$_zed_resolved" | sed -n '3p')
  LOOP_DIR=$(printf '%s\n' "$_zed_resolved" | sed -n '4p')
else
  # Legacy fallback — config.cjs absent or errored.
  DATA_DIR="${CLAUDE_PLUGIN_DATA:-$HOME/.zed-data}"
  VAULT_DIR="$DATA_DIR/vault"
  DB_PATH="$DATA_DIR/knowledge.db"
  LOOP_DIR="$DATA_DIR/loops/_default"
fi
