/**
 * tend.cjs — vault "gardening" operations behind `zed tend <subverb>`.
 *
 * stitchOrphans — bulk-connect orphan notes by appending semantic "## Related"
 * sections (FTS + tag matcher via engine.connectNote). Dry-run by DEFAULT:
 * returns the proposed changes without writing. `apply:true` writes each change
 * atomically and rebuilds the graph so the caller can report the orphan delta.
 *
 * Future subverbs (moc, distill) will live here too.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const fileLayer = require('./file-layer.cjs');
const atomicWrite = require('./atomic-write.cjs');

/**
 * @param {Object} engine — a built KnowledgeEngine
 * @param {Object} [opts]
 * @param {boolean} [opts.apply=false] — write changes (default: dry-run)
 * @param {number} [opts.limit=Infinity] — cap notes processed
 * @param {number} [opts.max=3] — max related links per note
 * @returns {{ before:number, after:(number|null), processed:number, changed:number,
 *             applied:boolean, report:Array<{title:string, path:string, added:string[]}> }}
 */
function stitchOrphans(engine, opts = {}) {
  const apply = opts.apply === true;
  const limit = typeof opts.limit === 'number' ? opts.limit : Infinity;
  const max = typeof opts.max === 'number' ? opts.max : 3;

  const before = engine.getOrphans().length;
  const orphans = engine.getOrphans();

  let processed = 0;
  let changed = 0;
  const report = [];

  for (const o of orphans) {
    if (processed >= limit) break;
    processed++;

    let raw;
    try { raw = fs.readFileSync(o.path, 'utf8'); } catch { continue; }

    let tags = [];
    try {
      const n = fileLayer.readNote(o.path);
      tags = (n.frontmatter && n.frontmatter.tags) || [];
    } catch { /* tagless is fine — content matching still works */ }

    const { content: connected, added } = engine.connectNote({
      content: raw,
      tags,
      selfPath: o.path,
      max,
    });

    if (added.length > 0) {
      changed++;
      report.push({ title: o.title, path: o.path, added });
      if (apply) {
        try { atomicWrite.writeAtomic(o.path, connected); } catch { /* skip this note on write error */ }
      }
    }
  }

  let after = null;
  if (apply) {
    engine.rebuild();
    after = engine.getOrphans().length;
  }

  return { before, after, processed, changed, applied: apply, report };
}

function buildMocContent(title, tag, members) {
  const safe = String(title).replace(/"/g, '\\"');
  return [
    '---',
    `title: "${safe}"`,
    'type: moc',
    `tags: [moc, ${tag}]`,
    '---',
    '',
    `# ${title}`,
    '',
    `Map of Content for **${tag}** — ${members.length} notes.`,
    '',
    ...members.map((m) => `- [[${m}]]`),
    '',
  ].join('\n');
}

/**
 * Generate Map-of-Content (MOC) hub notes: for every tag with at least
 * `minMembers` notes, create/refresh a "MOC - <tag>" note under _moc/ that
 * [[links]] all its members — turning loose tag groups into navigable hubs and
 * giving orphans something to attach to. Dry-run by DEFAULT.
 *
 * @param {Object} engine — a built KnowledgeEngine
 * @param {Object} [opts]
 * @param {boolean} [opts.apply=false]
 * @param {number} [opts.minMembers=3]
 * @param {string} [opts.vaultDir] — required when apply:true (write location)
 * @returns {{ applied:boolean, generated:number, report:Array<{tag,title,count,relPath,members:string[]}> }}
 */
function generateMOCs(engine, opts = {}) {
  const apply = opts.apply === true;
  const minMembers = typeof opts.minMembers === 'number' ? opts.minMembers : 3;
  const vaultDir = opts.vaultDir;

  const tags = engine.getAllTags(); // Map<tag, count>
  const report = [];

  for (const [tag, count] of tags) {
    if (tag === 'moc') continue; // don't build a MOC of MOCs
    if (count < minMembers) continue;
    const members = [...new Set(
      engine.search.searchByTag(tag, { limit: 500 }).map((r) => r.node.title).filter(Boolean)
    )];
    if (members.length < minMembers) continue;

    const slug = String(tag).toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
    const title = `MOC - ${tag}`;
    const relPath = path.join('_moc', `${slug}.md`);
    report.push({ tag, title, count: members.length, relPath, members });

    if (apply && vaultDir) {
      try { atomicWrite.writeAtomic(path.join(vaultDir, relPath), buildMocContent(title, tag, members)); }
      catch { /* skip this MOC on write error */ }
    }
  }

  if (apply && vaultDir) engine.rebuild();
  return { applied: apply, generated: report.length, report };
}

/**
 * Surface notes with WEAK titles — date-only (e.g. "2026-06-24") or generic
 * ("Untitled", "Note", "Session …") — that no content/title matcher can hub
 * well. These are the floor on how low orphanRatio can go; report-only (no
 * rename) so a human can give them atomic, concept-bearing titles.
 *
 * @param {Object} engine — a built KnowledgeEngine
 * @param {Object} [opts]
 * @param {number} [opts.limit=Infinity]
 * @param {boolean} [opts.orphansOnly=true] — only flag weak-titled ORPHANS
 * @returns {Array<{title:string, path:string, reason:string, orphan:boolean}>}
 */
function findWeakTitles(engine, opts = {}) {
  const limit = typeof opts.limit === 'number' ? opts.limit : Infinity;
  const orphansOnly = opts.orphansOnly !== false;
  const orphanPaths = new Set(engine.getOrphans().map((o) => path.resolve(o.path)));
  const nodes = engine.graph.db.prepare('SELECT id, path, title FROM nodes').all();

  const weak = [];
  for (const n of nodes) {
    const t = (n.title || '').trim();
    const isDate = /^\d{4}-\d{2}-\d{2}/.test(t);
    const isGeneric = !t || t.length < 4 || /^(untitled|note|notes|index|readme|session|daily)\b/i.test(t);
    if (!isDate && !isGeneric) continue;
    const orphan = orphanPaths.has(path.resolve(n.path));
    if (orphansOnly && !orphan) continue;
    weak.push({ title: t, path: n.path, reason: isDate ? 'date-title' : 'generic-title', orphan });
  }
  weak.sort((a, b) => (b.orphan === a.orphan ? 0 : b.orphan ? 1 : -1));
  return weak.slice(0, limit);
}

/**
 * Deterministic vault distill: run the gardening passes that compound
 * connectivity, in order — generate MOC hubs, then stitch remaining orphans —
 * and report the orphan delta. Pure composition of generateMOCs + stitchOrphans;
 * NO LLM, NO merge/promote (those stay a separate, human-approved step). This is
 * the one-command "tidy the vault" that took NELSON from 42 orphans to 0.
 *
 * @param {Object} engine — a built KnowledgeEngine
 * @param {Object} [opts]
 * @param {boolean} [opts.apply=false]
 * @param {string} [opts.vaultDir] — required when apply:true (for MOC writes)
 * @param {number} [opts.minMembers=3]
 * @param {number} [opts.max=3]
 * @returns {{ applied:boolean, before:number, after:(number|null), mocsGenerated:number, stitched:number }}
 */
function distill(engine, opts = {}) {
  const apply = opts.apply === true;
  const before = engine.getOrphans().length;
  const moc = generateMOCs(engine, { apply, vaultDir: opts.vaultDir, minMembers: opts.minMembers || 3 });
  const stitch = stitchOrphans(engine, { apply, max: opts.max || 3 });
  const after = apply ? engine.getOrphans().length : null;
  return { applied: apply, before, after, mocsGenerated: moc.generated, stitched: stitch.changed };
}

module.exports = { stitchOrphans, generateMOCs, findWeakTitles, distill };
