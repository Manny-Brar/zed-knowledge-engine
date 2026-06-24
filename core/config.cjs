/**
 * config.cjs — single source of truth for ZED path resolution.
 *
 * Decouples the VAULT (where notes live — e.g. an Obsidian vault) from the
 * DATA dir (where the derived SQLite cache + state live). This lets ZED point
 * at a specific Obsidian vault folder via ZED_VAULT_DIR while keeping binary
 * artifacts (the .db) OUT of that vault.
 *
 * Resolution precedence:
 *   data dir  : ZED_DATA_DIR  > CLAUDE_PLUGIN_DATA > ~/.zed-data
 *   vault dir : ZED_VAULT_DIR > ZED_VAULT_ROOT     > <dataDir>/vault
 *   db path   : ZED_DB_PATH   > <dataDir>/knowledge.db   (NEVER inside the vault)
 *
 * Per-project layout (one Obsidian vault, per-project folders): the vault dir
 * is the graph ROOT (the whole Obsidian vault); resolveProjectSlug() gives the
 * subfolder new notes are written under, so projects share one graph but stay
 * organized. ZED_PROJECT overrides the auto-derived slug; ZED_PROJECT="" disables.
 */

'use strict';

const path = require('path');

function homeDir(env) {
  return env.HOME || env.USERPROFILE || '.';
}

function resolveDataDir(env = process.env) {
  return env.ZED_DATA_DIR || env.CLAUDE_PLUGIN_DATA || path.join(homeDir(env), '.zed-data');
}

function resolveVaultDir(env = process.env) {
  return env.ZED_VAULT_DIR || env.ZED_VAULT_ROOT || path.join(resolveDataDir(env), 'vault');
}

function resolveDbPath(env = process.env) {
  return env.ZED_DB_PATH || path.join(resolveDataDir(env), 'knowledge.db');
}

function slugify(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * The per-project write subfolder within the vault. Derives from ZED_PROJECT
 * or the basename of the current working directory. Returns '' when disabled
 * (ZED_PROJECT="") or underivable — callers then write to the vault root.
 *
 * @param {Object} [env=process.env]
 * @param {string} [cwd] — override cwd (for tests)
 * @returns {string}
 */
function resolveProjectSlug(env = process.env, cwd) {
  if (Object.prototype.hasOwnProperty.call(env, 'ZED_PROJECT')) {
    return slugify(env.ZED_PROJECT); // explicit (incl. "" -> "" disables)
  }
  const base = path.basename(cwd || env.ZED_CWD || '');
  return base ? slugify(base) : '';
}

module.exports = {
  resolveDataDir,
  resolveVaultDir,
  resolveDbPath,
  resolveProjectSlug,
  slugify,
};
