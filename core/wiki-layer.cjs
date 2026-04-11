/**
 * wiki-layer.cjs — ZED v8.0 Karpathy Wiki Compile Layer
 *
 * Implements the "raw/ → wiki/ → schema.md" architecture from
 * Karpathy's LLM Wiki gist (April 2026). The wiki is the
 * LLM-compiled, compounding knowledge artifact built from immutable
 * raw/ sources.
 *
 * Design: this module is DETERMINISTIC — it never calls an LLM itself.
 * Karpathy's insight is that the LLM IS the user's current Claude session;
 * the wiki layer just produces the plan (what needs compiling, what's
 * stale, what's orphaned) and maintains the deterministic pieces
 * (index.md, log.md, session syntheses). Claude then uses
 * zed_read_note + zed_write_note to actually author wiki entries.
 *
 * Public API:
 *   planCompile(opts)     — scan raw/ + wiki/, return a job list
 *   updateIndex(opts)     — rebuild wiki/index.md from wiki/ files
 *   appendLog(entry, opts) — append a line to wiki/log.md
 *   healthCheck(opts)     — lint wiki/ (orphans, stale sources, broken links)
 *   writeSessionSynthesis({since, vaultPath}) — deterministic session snapshot
 *   ensureSchema(vaultPath) — copy templates/schema.md if vault has none
 */

'use strict';

const fs = require('fs');
const path = require('path');
const fileLayer = require('./file-layer.cjs');

const BUNDLED_SCHEMA_PATH = path.resolve(__dirname, '..', 'templates', 'schema.md');

// ---------------------------------------------------------------------------
// Inventory helpers
// ---------------------------------------------------------------------------

/**
 * List all .md files under <vault>/raw/ with their metadata.
 * Returns [{ path, relPath, mtime, title, source, type, category }]
 */
function listRawFiles(vaultPath) {
  const rawDir = path.join(vaultPath, 'raw');
  if (!fs.existsSync(rawDir)) return [];
  const files = fileLayer.listNotes(rawDir);
  return files.map((p) => {
    const rel = path.relative(vaultPath, p);
    const stat = fs.statSync(p);
    let note;
    try { note = fileLayer.readNote(p); } catch { note = { frontmatter: {}, title: null }; }
    const parts = path.relative(rawDir, p).split(path.sep);
    const category = parts.length > 1 ? parts[0] : 'uncategorised';
    return {
      path: p,
      relPath: rel,
      mtime: stat.mtimeMs,
      mtimeIso: stat.mtime.toISOString(),
      title: note.title,
      source: note.frontmatter.source || null,
      type: note.frontmatter.type || 'clip',
      category,
    };
  });
}

/**
 * List all .md files under <vault>/wiki/ with their metadata including
 * references to raw source files (from frontmatter `source_paths`).
 *
 * Also surfaces temporal fields (Graphiti-style) if present in frontmatter:
 *   - created:       when the wiki entry was first authored (YYYY-MM-DD)
 *   - updated:       last semantic update (YYYY-MM-DD)
 *   - expires_at:    when the entry's knowledge becomes stale (YYYY-MM-DD)
 *   - superseded_by: wikilink target that replaces this entry
 *
 * Missing fields fall back to file stat mtime / null.
 */
function listWikiFiles(vaultPath) {
  const wikiDir = path.join(vaultPath, 'wiki');
  if (!fs.existsSync(wikiDir)) return [];
  const files = fileLayer.listNotes(wikiDir);
  return files.map((p) => {
    const rel = path.relative(vaultPath, p);
    const stat = fs.statSync(p);
    let note;
    try { note = fileLayer.readNote(p); } catch { note = { frontmatter: {}, title: null, wikilinks: [] }; }
    const parts = path.relative(wikiDir, p).split(path.sep);
    const category = parts.length > 1 ? parts[0] : 'meta';
    const sp = note.frontmatter.source_paths;
    const sources = Array.isArray(sp) ? sp : sp ? [sp] : [];
    return {
      path: p,
      relPath: rel,
      mtime: stat.mtimeMs,
      mtimeIso: stat.mtime.toISOString(),
      title: note.title,
      type: note.frontmatter.type || 'wiki',
      sources,
      wikilinks: note.wikilinks || [],
      summary: note.frontmatter.summary || note.frontmatter.context_summary || null,
      category,
      // v8.1 temporal metadata (all optional; null if absent)
      created: note.frontmatter.created || null,
      updated: note.frontmatter.updated || null,
      expiresAt: note.frontmatter.expires_at || null,
      supersededBy: note.frontmatter.superseded_by || null,
    };
  });
}

// ---------------------------------------------------------------------------
// planCompile — the Karpathy compile task list
// ---------------------------------------------------------------------------

/**
 * Scan raw/ and wiki/ and return a structured compile plan:
 *
 *   {
 *     rawCount,
 *     wikiCount,
 *     uncompiled: [...],   // raw files with no wiki entry referencing them
 *     stale: [...],        // wiki entries whose raw source mtime is newer
 *     orphanWiki: [...],   // wiki entries whose referenced raw files are gone
 *     byCategory: { papers: 3, clips: 12, ... },
 *     since: mtimeMs | null,
 *   }
 *
 * Pass `since` (hours) to only include raw files modified in the last N hours.
 */
function planCompile(opts) {
  if (!opts || !opts.vaultPath) throw new Error('planCompile: vaultPath required');
  const vaultPath = opts.vaultPath;
  const sinceHours = opts.since;
  const cutoff = sinceHours ? Date.now() - sinceHours * 3600 * 1000 : null;

  const raws = listRawFiles(vaultPath);
  // Exclude the auto-generated meta files (index.md, log.md) from all
  // wiki-facing counts. They are scaffolding, not knowledge. This keeps
  // planCompile consistent with healthCheck and with what users expect
  // when they ask "how many wiki entries do I have?"
  const allWikis = listWikiFiles(vaultPath);
  const wikis = allWikis.filter((w) => {
    const base = path.basename(w.path);
    return base !== 'index.md' && base !== 'log.md';
  });

  // Build a fast lookup: which raw files are already referenced by a wiki?
  const referencedRaws = new Map(); // raw relPath -> array of wiki entries
  for (const w of wikis) {
    for (const srcPath of w.sources) {
      if (!referencedRaws.has(srcPath)) referencedRaws.set(srcPath, []);
      referencedRaws.get(srcPath).push(w);
    }
  }

  const uncompiled = [];
  const byCategory = {};
  for (const r of raws) {
    if (cutoff && r.mtime < cutoff) continue;
    byCategory[r.category] = (byCategory[r.category] || 0) + 1;
    if (!referencedRaws.has(r.relPath)) {
      uncompiled.push(r);
    }
  }

  // Stale: any wiki whose raw source mtime > wiki mtime
  const stale = [];
  const rawByRel = new Map(raws.map((r) => [r.relPath, r]));
  for (const w of wikis) {
    for (const srcPath of w.sources) {
      const rawEntry = rawByRel.get(srcPath);
      if (rawEntry && rawEntry.mtime > w.mtime + 1000) {
        stale.push({ wiki: w, source: rawEntry });
        break;
      }
    }
  }

  // Orphan wiki: references a raw path that no longer exists
  const orphanWiki = [];
  for (const w of wikis) {
    for (const srcPath of w.sources) {
      if (!rawByRel.has(srcPath)) {
        orphanWiki.push({ wiki: w, missing_source: srcPath });
        break;
      }
    }
  }

  return {
    vaultPath,
    rawCount: raws.length,
    wikiCount: wikis.length,
    uncompiled,
    stale,
    orphanWiki,
    byCategory,
    since: sinceHours || null,
  };
}

// ---------------------------------------------------------------------------
// updateIndex — rebuild wiki/index.md from current wiki content
// ---------------------------------------------------------------------------

function updateIndex(opts) {
  if (!opts || !opts.vaultPath) throw new Error('updateIndex: vaultPath required');
  const vaultPath = opts.vaultPath;
  const wikis = listWikiFiles(vaultPath);
  const indexPath = path.join(vaultPath, 'wiki', 'index.md');

  // Exclude index.md + log.md themselves
  const entries = wikis.filter((w) => {
    const base = path.basename(w.path);
    return base !== 'index.md' && base !== 'log.md';
  });

  // Group by category
  const grouped = {};
  for (const e of entries) {
    if (!grouped[e.category]) grouped[e.category] = [];
    grouped[e.category].push(e);
  }

  const lines = [
    '---',
    `title: "Wiki Index"`,
    `type: wiki-index`,
    `updated: ${new Date().toISOString()}`,
    `entries: ${entries.length}`,
    `tags: [wiki, index, navigation]`,
    '---',
    '',
    '# Wiki Index',
    '',
    `> Auto-generated by \`zed compile\`. Do not edit directly.`,
    `> ${entries.length} entries across ${Object.keys(grouped).length} categories.`,
    '',
  ];

  const categories = Object.keys(grouped).sort();
  for (const cat of categories) {
    lines.push(`## ${cat}`);
    lines.push('');
    const sorted = grouped[cat].slice().sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    for (const e of sorted) {
      const summary = e.summary ? ` — ${e.summary}` : '';
      const title = e.title || path.basename(e.path, '.md');
      lines.push(`- [[${title}]]${summary}`);
    }
    lines.push('');
  }

  if (entries.length === 0) {
    lines.push('_(empty — run `zed compile` to start building the wiki from raw/ sources)_');
    lines.push('');
  }

  const content = lines.join('\n');
  fileLayer.writeNote(indexPath, content);
  return { path: indexPath, entries: entries.length, categories: categories.length };
}

// ---------------------------------------------------------------------------
// appendLog — atomic append to wiki/log.md
// ---------------------------------------------------------------------------

function appendLog(entry, opts) {
  if (!opts || !opts.vaultPath) throw new Error('appendLog: vaultPath required');
  const logPath = path.join(opts.vaultPath, 'wiki', 'log.md');
  const ts = new Date().toISOString();
  const line = `- ${ts} — ${entry}\n`;

  if (!fs.existsSync(logPath)) {
    const header = [
      '---',
      `title: "Wiki Change Log"`,
      `type: wiki-log`,
      `tags: [wiki, log, history]`,
      '---',
      '',
      '# Wiki Change Log',
      '',
      '> Append-only record of every wiki compile pass. Most recent entries at the bottom.',
      '',
    ].join('\n') + '\n';
    fileLayer.writeNote(logPath, header + line);
  } else {
    // Atomic append via read + write-tmp + rename
    const existing = fs.readFileSync(logPath, 'utf-8');
    const tmpPath = logPath + '.tmp.' + process.pid;
    fs.writeFileSync(tmpPath, existing + line, 'utf-8');
    fs.renameSync(tmpPath, logPath);
  }
  return { path: logPath, entry };
}

// ---------------------------------------------------------------------------
// healthCheck — lint the wiki
// ---------------------------------------------------------------------------

function healthCheck(opts) {
  if (!opts || !opts.vaultPath) throw new Error('healthCheck: vaultPath required');
  const plan = planCompile({ vaultPath: opts.vaultPath });
  const allWikis = listWikiFiles(opts.vaultPath);
  // Exclude the auto-generated meta files from health counts — they're
  // scaffolding, not knowledge.
  const wikis = allWikis.filter((w) => {
    const base = path.basename(w.path);
    return base !== 'index.md' && base !== 'log.md';
  });
  const rawFiles = listRawFiles(opts.vaultPath);
  const rawByRel = new Map(rawFiles.map((r) => [r.relPath, r]));

  // Unreferenced raw: raw files with no wiki entry (== plan.uncompiled)
  const unreferencedRaw = plan.uncompiled;

  // Broken wikilinks: any [[link]] that doesn't resolve to ANY note in
  // the vault — wiki entries, raw sources, or canonical vault-level notes
  // like schema.md / decisions/*.md / patterns/*.md. Wikilinks can
  // legitimately cross these directories (session syntheses point at raw
  // clips, wiki concepts reference decisions, etc.), so we resolve against
  // the full set. Resolution matches on title OR basename, case-insensitive.
  const allTargets = new Set();
  const allVaultNotes = fileLayer.listNotes(opts.vaultPath);
  for (const notePath of allVaultNotes) {
    const base = path.basename(notePath, '.md').toLowerCase();
    allTargets.add(base);
    try {
      const n = fileLayer.readNote(notePath);
      if (n.title) allTargets.add(n.title.toLowerCase());
    } catch (_) { /* unreadable — basename is enough */ }
  }
  const brokenLinks = [];
  for (const w of wikis) {
    for (const link of w.wikilinks || []) {
      const target = (link.target || '').toLowerCase();
      if (!target) continue;
      if (!allTargets.has(target)) {
        brokenLinks.push({ from: w.relPath, target: link.target });
      }
    }
  }

  // Wikis with no source_paths at all (no provenance). Auto-generated
  // session snapshots (type: synthesis) are excluded — they're system
  // artifacts, not curated wiki entries, so provenance doesn't apply.
  const noProvenance = wikis.filter((w) => {
    if (w.type === 'synthesis') return false;
    return !w.sources || w.sources.length === 0;
  });

  // Expired: entries whose expires_at frontmatter field is in the past
  const now = Date.now();
  const expired = [];
  for (const w of wikis) {
    if (!w.expiresAt) continue;
    const t = Date.parse(w.expiresAt);
    if (Number.isFinite(t) && t < now) {
      expired.push({ wiki: w, expired_at: w.expiresAt });
    }
  }

  // Superseded: entries with superseded_by pointing to an existing entry
  const superseded = [];
  for (const w of wikis) {
    if (!w.supersededBy) continue;
    const target = String(w.supersededBy).toLowerCase();
    const replacement = wikis.find((other) =>
      (other.title || '').toLowerCase() === target ||
      path.basename(other.path, '.md').toLowerCase() === target
    );
    superseded.push({
      wiki: w,
      superseded_by: w.supersededBy,
      replacement_found: !!replacement,
    });
  }

  // Compute a simple health score (0-100)
  let score = 100;
  score -= Math.min(30, unreferencedRaw.length * 2);
  score -= Math.min(20, plan.stale.length * 3);
  score -= Math.min(20, plan.orphanWiki.length * 5);
  score -= Math.min(15, brokenLinks.length * 1);
  score -= Math.min(15, noProvenance.length * 2);
  score -= Math.min(10, expired.length * 3);
  score = Math.max(0, Math.min(100, Math.round(score)));

  let grade;
  if (score >= 90) grade = 'A';
  else if (score >= 75) grade = 'B';
  else if (score >= 60) grade = 'C';
  else if (score >= 40) grade = 'D';
  else grade = 'F';

  return {
    score,
    grade,
    rawCount: plan.rawCount,
    // wikiCount excludes index.md and log.md (scaffolding, not knowledge)
    wikiCount: wikis.length,
    uncompiled: unreferencedRaw,
    stale: plan.stale,
    orphanWiki: plan.orphanWiki,
    brokenLinks,
    noProvenance,
    expired,
    superseded,
    byCategory: plan.byCategory,
  };
}

// ---------------------------------------------------------------------------
// writeSessionSynthesis — deterministic snapshot (for pre-compact hook)
// ---------------------------------------------------------------------------

/**
 * Capture recent vault activity as a wiki/syntheses/ entry. Deterministic —
 * no LLM involved. Used by the PreCompact hook to persist session context
 * as a searchable artifact before Claude's conversation gets compacted.
 *
 * @param {Object} opts
 * @param {string} opts.vaultPath
 * @param {number} [opts.since=24]   — hours; default last 24h
 * @param {string} [opts.label]      — optional synthesis label
 */
function writeSessionSynthesis(opts) {
  if (!opts || !opts.vaultPath) throw new Error('writeSessionSynthesis: vaultPath required');
  const sinceHours = opts.since || 24;
  const cutoff = Date.now() - sinceHours * 3600 * 1000;

  const notes = fileLayer.listNotes(opts.vaultPath);
  const recent = [];
  for (const p of notes) {
    try {
      const stat = fs.statSync(p);
      if (stat.mtimeMs < cutoff) continue;
      const note = fileLayer.readNote(p);
      const base = path.basename(p);
      if (base === 'index.md' || base === 'log.md') continue;
      // Skip the synthesis itself (if being regenerated)
      if (p.includes('/wiki/syntheses/session-')) continue;
      recent.push({
        path: p,
        relPath: path.relative(opts.vaultPath, p),
        title: note.title,
        type: note.frontmatter.type || 'note',
        tags: note.frontmatter.tags || [],
        mtime: stat.mtimeMs,
        mtimeIso: stat.mtime.toISOString(),
      });
    } catch (e) { /* skip unreadable */ }
  }

  recent.sort((a, b) => b.mtime - a.mtime);

  // Group by type
  const byType = {};
  for (const r of recent) {
    if (!byType[r.type]) byType[r.type] = [];
    byType[r.type].push(r);
  }

  // Top tags
  const tagCounts = new Map();
  for (const r of recent) {
    for (const t of r.tags) {
      tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
    }
  }
  const topTags = Array.from(tagCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  const now = new Date();
  const label = opts.label
    ? opts.label.replace(/[^a-z0-9-]/gi, '-').toLowerCase().slice(0, 40)
    : `${now.getUTCHours().toString().padStart(2, '0')}${now.getUTCMinutes().toString().padStart(2, '0')}`;
  const fileName = `session-${now.toISOString().slice(0, 10)}-${label}.md`;
  const synthPath = path.join(opts.vaultPath, 'wiki', 'syntheses', fileName);

  const lines = [
    '---',
    `title: "Session synthesis ${now.toISOString().slice(0, 16).replace('T', ' ')}"`,
    `type: synthesis`,
    `generated: ${now.toISOString()}`,
    `since_hours: ${sinceHours}`,
    `note_count: ${recent.length}`,
    `tags: [wiki, synthesis, session-snapshot]`,
    '---',
    '',
    `# Session synthesis — last ${sinceHours}h`,
    '',
    `> Auto-generated by \`zed compile --synthesize\` at ${now.toISOString()}.`,
    `> ${recent.length} notes modified in the last ${sinceHours}h.`,
    '',
  ];

  if (topTags.length > 0) {
    lines.push('## Top tags');
    lines.push('');
    for (const [tag, count] of topTags) {
      lines.push(`- \`${tag}\` × ${count}`);
    }
    lines.push('');
  }

  const typeOrder = ['decision', 'pattern', 'architecture', 'clip', 'paper', 'transcript', 'synthesis', 'daily', 'note'];
  const types = Object.keys(byType).sort((a, b) => {
    const ia = typeOrder.indexOf(a);
    const ib = typeOrder.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

  for (const type of types) {
    lines.push(`## ${type} (${byType[type].length})`);
    lines.push('');
    for (const r of byType[type].slice(0, 20)) {
      const title = r.title || path.basename(r.path, '.md');
      lines.push(`- [[${title}]] — \`${r.relPath}\``);
    }
    if (byType[type].length > 20) {
      lines.push(`- _…and ${byType[type].length - 20} more_`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push('_Tip: run `zed compile` after this synthesis to integrate new raw/ sources into the wiki._');
  lines.push('');

  const content = lines.join('\n');
  fileLayer.writeNote(synthPath, content);

  // Log it
  try { appendLog(`session-synthesis: ${fileName} (${recent.length} notes, ${sinceHours}h)`, opts); } catch {}

  return { path: synthPath, relPath: path.relative(opts.vaultPath, synthPath), noteCount: recent.length };
}

// ---------------------------------------------------------------------------
// ensureSchema — copy bundled schema.md into the vault if it doesn't exist
// ---------------------------------------------------------------------------

function ensureSchema(vaultPath) {
  const dest = path.join(vaultPath, 'schema.md');
  if (fs.existsSync(dest)) return { path: dest, created: false };
  if (!fs.existsSync(BUNDLED_SCHEMA_PATH)) return { path: dest, created: false, missingBundled: true };
  const content = fs.readFileSync(BUNDLED_SCHEMA_PATH, 'utf-8');
  fileLayer.writeNote(dest, content);
  return { path: dest, created: true };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  listRawFiles,
  listWikiFiles,
  planCompile,
  updateIndex,
  appendLog,
  healthCheck,
  writeSessionSynthesis,
  ensureSchema,
};
