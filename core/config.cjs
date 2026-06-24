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

// Guard against UNEXPANDED placeholders. When the plugin host fails to expand
// e.g. "${CLAUDE_PLUGIN_DATA}" (see .mcp.json), the literal string leaks in as
// the env value and path.join() would create a junk dir literally named
// "${CLAUDE_PLUGIN_DATA}" relative to cwd (the source of the stray in-repo
// vault). Treat any value containing an unexpanded $-placeholder as unset.
function cleanEnvPath(v) {
  if (!v || typeof v !== 'string') return null;
  if (/\$\{|\$[A-Za-z_]/.test(v)) return null;
  return v;
}

function resolveDataDir(env = process.env) {
  return cleanEnvPath(env.ZED_DATA_DIR) || cleanEnvPath(env.CLAUDE_PLUGIN_DATA) || path.join(homeDir(env), '.zed-data');
}

/**
 * Per-project vault mode: each project gets its OWN Obsidian vault (and thus its
 * own graph + DB), auto-derived as <ZED_VAULT_BASE>/<project-slug>. This is the
 * "separate graph per project" model. An explicit ZED_VAULT_DIR opts a single
 * project out (pins it to one vault). Distinct from ZED_VAULT_ROOT, which is the
 * "one shared vault, per-project subfolders, one merged graph" model.
 */
function perProjectVaultMode(env = process.env) {
  return !!cleanEnvPath(env.ZED_VAULT_BASE) && !cleanEnvPath(env.ZED_VAULT_DIR);
}

// Precedence: explicit ZED_VAULT_DIR > per-project ZED_VAULT_BASE/<slug>
// > shared ZED_VAULT_ROOT > <dataDir>/vault.
function resolveVaultDir(env = process.env, cwd) {
  const explicit = cleanEnvPath(env.ZED_VAULT_DIR);
  if (explicit) return explicit;
  const base = cleanEnvPath(env.ZED_VAULT_BASE);
  if (base) return path.join(base, resolveProjectSlug(env, cwd) || '_default');
  const root = cleanEnvPath(env.ZED_VAULT_ROOT);
  if (root) return root;
  return path.join(resolveDataDir(env), 'vault');
}

// In per-project-vault mode the DB is keyed by project too, so separate vaults
// never merge through a shared index: <dataDir>/graphs/<slug>/knowledge.db.
function resolveDbPath(env = process.env, cwd) {
  const explicit = cleanEnvPath(env.ZED_DB_PATH);
  if (explicit) return explicit;
  if (perProjectVaultMode(env)) {
    return path.join(resolveDataDir(env), 'graphs', resolveProjectSlug(env, cwd) || '_default', 'knowledge.db');
  }
  return path.join(resolveDataDir(env), 'knowledge.db');
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
  // Prefer an explicit project root over process.cwd(): hooks can fire with a
  // subdirectory as cwd, which would yield an unstable slug. CLAUDE_PROJECT_DIR
  // (set by the host) is the reliable project root, so it wins over cwd.
  const base = path.basename(
    cwd || env.ZED_CWD || env.CLAUDE_PROJECT_DIR || process.cwd() || ''
  );
  return base ? slugify(base) : '';
}

/**
 * Resolve the per-project evolve-loop state directory. Loop state (objective,
 * progress, handoff, cron-state, assessments) is RUNTIME scaffolding, not
 * knowledge — so it lives under the DATA dir, never inside the Obsidian vault,
 * and is keyed by project slug so a loop started in project A never bleeds into
 * project B. Falls back to a shared "_default" bucket when no slug is derivable.
 *
 * Layout: <dataDir>/loops/<project-slug>/
 *
 * @param {Object} [env=process.env]
 * @param {string} [cwd] — override cwd (for tests)
 * @returns {string} absolute loop dir
 */
function resolveLoopDir(env = process.env, cwd) {
  const dataDir = resolveDataDir(env);
  const slug = resolveProjectSlug(env, cwd) || '_default';
  return path.join(dataDir, 'loops', slug);
}

/**
 * Per-project mode is ON only when the user opts in via ZED_VAULT_ROOT (an
 * Obsidian vault root) or an explicit ZED_PROJECT. This keeps the historical
 * flat single-vault behavior unchanged for users who set neither.
 */
function projectModeOn(env = process.env) {
  // Subfolder prefixing applies ONLY to the shared-vault (ZED_VAULT_ROOT) model.
  // In per-project-vault mode each project IS its own vault root, so notes go to
  // the vault root (decisions/, patterns/, …) with no slug prefix.
  if (perProjectVaultMode(env)) return false;
  return !!(cleanEnvPath(env.ZED_VAULT_ROOT) || Object.prototype.hasOwnProperty.call(env, 'ZED_PROJECT'));
}

/**
 * Resolve the absolute path a note should be WRITTEN to. In per-project mode,
 * notes are written under <vaultDir>/<projectSlug>/ so projects stay organized
 * inside one shared graph. Paths already under the slug, or under the shared
 * "_global/" area, are left unprefixed. Outside project mode it is a plain join
 * (unchanged behavior).
 *
 * @param {string} vaultDir — the vault graph root
 * @param {string} fileName — vault-relative path (e.g. "decisions/x.md")
 * @param {Object} [env=process.env]
 * @param {string} [cwd] — override cwd (for tests)
 * @returns {string} absolute write path
 */
function resolveWritePath(vaultDir, fileName, env = process.env, cwd) {
  const clean = String(fileName || '').replace(/^[/\\]+/, '');
  if (!projectModeOn(env)) return path.join(vaultDir, clean);
  const slug = resolveProjectSlug(env, cwd);
  if (!slug) return path.join(vaultDir, clean);
  const first = clean.split(/[/\\]/)[0];
  if (first === slug || first === '_global') return path.join(vaultDir, clean);
  return path.join(vaultDir, slug, clean);
}

module.exports = {
  resolveDataDir,
  resolveVaultDir,
  resolveDbPath,
  resolveProjectSlug,
  resolveLoopDir,
  perProjectVaultMode,
  projectModeOn,
  resolveWritePath,
  slugify,
};
