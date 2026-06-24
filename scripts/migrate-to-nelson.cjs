#!/usr/bin/env node
/**
 * migrate-to-nelson.cjs — one-off: copy existing flat vault notes into NELSON
 * organized by per-project folders. COPY-ONLY (never deletes the source).
 *
 * Usage:
 *   node scripts/migrate-to-nelson.cjs            # dry-run (prints the plan)
 *   node scripts/migrate-to-nelson.cjs --apply    # copies files into NELSON
 *
 * Env:
 *   ZED_SRC   source vault (default: cfg.resolveVaultDir() current default)
 *   ZED_DEST  destination NELSON vault root (default: the iCloud NELSON path)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const cfg = require('../core/config.cjs');
const fl = require('../core/file-layer.cjs');

const SRC = process.env.ZED_SRC || cfg.resolveVaultDir({ CLAUDE_PLUGIN_DATA: process.env.CLAUDE_PLUGIN_DATA, HOME: process.env.HOME });
const DEST = process.env.ZED_DEST || '/Users/mannybrar/Library/Mobile Documents/iCloud~md~obsidian/Documents/NELSON';
const APPLY = process.argv.includes('--apply');

function classify(rel, tags) {
  const hay = (rel + ' ' + tags).toLowerCase();
  const has = (...ks) => ks.some((k) => hay.includes(k));
  if (has('dm_setter', 'dmsetter', 'zernio', 'brian', 'bakeoff', 'ban-safety', 'deliverability',
          'onboarding-funnel', 'temporal-guard', 'master-doc', 'recon-before', 'survey-all-emitters',
          'extract-invariants', 'cross-area-join', 'comment-and-dm', 'outbound-links', 'readiness',
          'flow-runtime', 'pg-cron', 'useeffect-state-dep')) return 'dm_setter';
  if (has('unfiltered', 'podcast', 'podtrac', 'op3')) return 'unfiltered_podcast';
  if (has('slateos', 'carousel', 'myna', 'instagram', 'ig-carousel', 'canvas-sprint', 'oklch',
          'design-system', 'visual-carousel', 'dogfood', 'polish-trap', 'hook-frame', 'composer',
          'nano-banana', 'gpt-image', 'konva', 'imageops', 'v1-playbook', 'v1-architecture', 'v2.2',
          'w2-moat', 'inngest', 'lazy-cascade', 'additive-realtime', 'ai-draft-verify', 'smoke-test',
          'ultrathink-architecture', 'post-phase-2', 'brand')) return 'slateos';
  if (has('zed', 'knowledge-management', 'consolidation', 'evolve')) return 'zed-knowledge-engine';
  return '_global';
}

const notes = fl.listNotes(SRC);
const plan = {};
const assignments = [];
for (const p of notes) {
  let tags = '';
  try { const n = fl.readNote(p); const t = (n.frontmatter && n.frontmatter.tags) || []; tags = Array.isArray(t) ? t.join(',') : String(t); } catch {}
  const rel = path.relative(SRC, p);
  const project = classify(rel, tags);
  const dest = path.join(DEST, project, rel);
  plan[project] = (plan[project] || 0) + 1;
  assignments.push({ rel, project, dest });
  if (APPLY) {
    try {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      if (!fs.existsSync(dest)) fs.copyFileSync(p, dest);
    } catch (e) { console.error('skip', rel, e.message); }
  }
}

console.log('SRC :', SRC);
console.log('DEST:', DEST);
console.log('MODE:', APPLY ? 'APPLY (copying)' : 'DRY RUN');
console.log('--- per-project counts ---');
for (const [proj, n] of Object.entries(plan).sort((a, b) => b[1] - a[1])) console.log(`  ${proj}: ${n}`);
console.log(`  TOTAL: ${notes.length}`);
if (!APPLY) {
  console.log('--- sample assignments ---');
  for (const a of assignments.slice(0, 12)) console.log(`  [${a.project}] ${a.rel}`);
  console.log('\nRun with --apply to copy (source is never modified).');
}
