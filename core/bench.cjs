/**
 * bench.cjs — Performance Benchmark Suite for Nelson Knowledge Engine
 *
 * Generates synthetic vaults of varying sizes and measures:
 * - Full graph build time
 * - Search time
 * - Backlink lookup time
 * - Shortest path time
 * - Cluster detection time
 *
 * Usage: node bench.cjs [noteCount]
 */

'use strict';

const fs = require('fs');
const path = require('path');
const KnowledgeEngine = require('./engine.cjs');

const NOTE_COUNT = parseInt(process.argv[2] || '500', 10);
const VAULT_DIR = path.join(__dirname, '.bench-vault');

// ---------------------------------------------------------------------------
// Generate synthetic vault
// ---------------------------------------------------------------------------

function generateVault(noteCount) {
  fs.rmSync(VAULT_DIR, { recursive: true, force: true });
  fs.mkdirSync(VAULT_DIR, { recursive: true });

  const titles = [];
  for (let i = 0; i < noteCount; i++) {
    titles.push(`Note ${String(i).padStart(4, '0')}`);
  }

  for (let i = 0; i < noteCount; i++) {
    const title = titles[i];
    const tags = ['bench'];
    if (i % 10 === 0) tags.push('hub');
    if (i % 5 === 0) tags.push('important');

    // Create 2-5 random wikilinks per note
    const linkCount = 2 + Math.floor(Math.random() * 4);
    const links = [];
    for (let j = 0; j < linkCount; j++) {
      const targetIdx = Math.floor(Math.random() * noteCount);
      if (targetIdx !== i) {
        links.push(`[[${titles[targetIdx]}]]`);
      }
    }

    const body = [
      `This is the body of ${title}.`,
      `It contains some content about topic ${i % 20} and category ${i % 7}.`,
      links.join(' and ') + '.',
      '',
      'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
      `Keywords: performance, benchmark, knowledge, graph, note-${i}.`,
    ].join('\n');

    const content = [
      '---',
      `title: "${title}"`,
      `date: 2026-03-${String((i % 28) + 1).padStart(2, '0')}`,
      'type: note',
      `tags: [${tags.join(', ')}]`,
      '---',
      '',
      `# ${title}`,
      '',
      body,
    ].join('\n');

    fs.writeFileSync(path.join(VAULT_DIR, `note-${String(i).padStart(4, '0')}.md`), content);
  }
}

// ---------------------------------------------------------------------------
// Benchmark runner
// ---------------------------------------------------------------------------

function bench(name, fn, iterations = 1) {
  const times = [];
  for (let i = 0; i < iterations; i++) {
    const start = process.hrtime.bigint();
    const result = fn();
    const end = process.hrtime.bigint();
    times.push(Number(end - start) / 1e6); // ms
  }
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const min = Math.min(...times);
  const max = Math.max(...times);
  console.log(`  ${name}: avg=${avg.toFixed(1)}ms min=${min.toFixed(1)}ms max=${max.toFixed(1)}ms`);
  return { name, avg, min, max };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

console.log(`\nNelson Knowledge Engine v6 — Benchmark`);
console.log(`═══════════════════════════════════════`);
console.log(`Notes: ${NOTE_COUNT}\n`);

console.log('Generating vault...');
const genStart = process.hrtime.bigint();
generateVault(NOTE_COUNT);
const genEnd = process.hrtime.bigint();
console.log(`  Generated ${NOTE_COUNT} notes in ${(Number(genEnd - genStart) / 1e6).toFixed(0)}ms\n`);

const engine = new KnowledgeEngine({ vaultPath: VAULT_DIR, dbPath: ':memory:' });

console.log('Benchmarks:');

const results = [];

// Full build
results.push(bench('Full build', () => engine.build()));

// Stats
results.push(bench('getStats', () => engine.getStats(), 3));

// Search
results.push(bench('Search ("knowledge")', () => engine.searchNotes('knowledge', { limit: 10 }), 5));
results.push(bench('Search ("topic 5")', () => engine.searchNotes('topic 5', { limit: 10 }), 5));

// Backlinks (on a hub note)
const hubs = engine.findHubs(1);
if (hubs.length > 0) {
  results.push(bench('getBacklinks (top hub)', () => engine.getBacklinks(hubs[0].path), 5));
}

// Shortest path (between two random notes)
const notes = engine.listNotes();
if (notes.length >= 2) {
  results.push(bench('shortestPath', () => engine.shortestPath(notes[0], notes[Math.floor(notes.length / 2)]), 3));
}

// Related
if (notes.length > 0) {
  results.push(bench('getRelated (2 hops)', () => engine.getRelated(notes[0], 2), 3));
}

// Clusters
results.push(bench('getClusters', () => engine.getClusters(), 3));

// Find hubs
results.push(bench('findHubs (10)', () => engine.findHubs(10), 5));

// Rebuild (second time, same data)
results.push(bench('Rebuild (second pass)', () => engine.rebuild()));

engine.close();

// Cleanup
fs.rmSync(VAULT_DIR, { recursive: true, force: true });

console.log(`\n═══════════════════════════════════════`);

// Pass/fail against targets
const targets = {
  'Full build': NOTE_COUNT <= 500 ? 500 : 1000,
  'Search ("knowledge")': 50,
};

let pass = true;
for (const [name, maxMs] of Object.entries(targets)) {
  const result = results.find(r => r.name === name);
  if (result && result.avg > maxMs) {
    console.log(`FAIL: ${name} exceeded ${maxMs}ms target (${result.avg.toFixed(0)}ms)`);
    pass = false;
  }
}

if (pass) {
  console.log(`All benchmarks within targets.`);
}
console.log();

process.exit(pass ? 0 : 1);
