#!/usr/bin/env node

/**
 * stress-test.cjs — Stress test ZED with a 500-note vault
 *
 * Generates a realistic 500-note vault with frontmatter, tags, body text,
 * and random wikilinks. Exercises the full ZED CLI surface area and
 * reports timing for each operation.
 *
 * Usage: node scripts/stress-test.cjs
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PROJECT_ROOT = path.join(__dirname, '..');
const TEMP_DATA_DIR = path.join(PROJECT_ROOT, '.stress-test-data');
const TEMP_VAULT = path.join(TEMP_DATA_DIR, 'vault');
const TEMP_DB = path.join(TEMP_DATA_DIR, 'knowledge.db');
const ZED_BIN = path.join(PROJECT_ROOT, 'bin', 'zed');
const NOTE_COUNT = 500;

// Categories for realistic note titles
const CATEGORIES = ['Architecture', 'Pattern', 'Decision', 'Debug', 'Research', 'API', 'Component', 'Service', 'Model', 'Config'];
const TOPICS = ['auth', 'cache', 'database', 'frontend', 'backend', 'testing', 'deployment', 'monitoring', 'security', 'performance'];
const TAG_POOL = ['architecture', 'pattern', 'decision', 'debug', 'research', 'api', 'important', 'wip', 'review', 'archived'];

// ---------------------------------------------------------------------------
// Generate vault
// ---------------------------------------------------------------------------

function generateVault() {
  // Clean up any previous run
  fs.rmSync(TEMP_DATA_DIR, { recursive: true, force: true });
  fs.mkdirSync(TEMP_VAULT, { recursive: true });

  // Create standard ZED subdirectories
  for (const sub of ['decisions', 'patterns', 'sessions', 'architecture', '_loop']) {
    fs.mkdirSync(path.join(TEMP_VAULT, sub), { recursive: true });
  }

  const titles = [];
  const filenames = [];

  for (let i = 0; i < NOTE_COUNT; i++) {
    const category = CATEGORIES[i % CATEGORIES.length];
    const topic = TOPICS[i % TOPICS.length];
    const title = `${category} ${topic} ${i}`;
    titles.push(title);
    filenames.push(`note-${String(i).padStart(4, '0')}.md`);
  }

  for (let i = 0; i < NOTE_COUNT; i++) {
    const title = titles[i];

    // 2-5 random wikilinks per note
    const linkCount = 2 + Math.floor(Math.random() * 4);
    const links = new Set();
    for (let j = 0; j < linkCount; j++) {
      const targetIdx = Math.floor(Math.random() * NOTE_COUNT);
      if (targetIdx !== i) links.add(`[[${titles[targetIdx]}]]`);
    }

    // 1-3 random tags per note
    const tagCount = 1 + Math.floor(Math.random() * 3);
    const tags = new Set();
    for (let j = 0; j < tagCount; j++) {
      tags.add(TAG_POOL[Math.floor(Math.random() * TAG_POOL.length)]);
    }

    const body = [
      `This is the body of ${title}. It covers ${TOPICS[i % TOPICS.length]} concepts.`,
      '',
      `Related notes: ${[...links].join(', ')}.`,
      '',
      'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
      `Keywords: knowledge, graph, ${CATEGORIES[i % CATEGORIES.length].toLowerCase()}, ${TOPICS[i % TOPICS.length]}.`,
      '',
      `## Details`,
      '',
      `This note contains detailed information about ${title}. It was created as part of the stress test suite.`,
      `The ${TOPICS[i % TOPICS.length]} system integrates with multiple components.`,
    ].join('\n');

    const content = [
      '---',
      `title: "${title}"`,
      `date: 2026-03-${String((i % 28) + 1).padStart(2, '0')}`,
      `type: ${CATEGORIES[i % CATEGORIES.length].toLowerCase()}`,
      `tags: [${[...tags].join(', ')}]`,
      '---',
      '',
      `# ${title}`,
      '',
      body,
      '',
    ].join('\n');

    // Distribute some notes into subdirectories
    let targetDir = TEMP_VAULT;
    if (i % 5 === 0) targetDir = path.join(TEMP_VAULT, 'decisions');
    else if (i % 5 === 1) targetDir = path.join(TEMP_VAULT, 'patterns');
    else if (i % 5 === 2) targetDir = path.join(TEMP_VAULT, 'architecture');

    fs.writeFileSync(path.join(targetDir, filenames[i]), content);
  }

  return { titles, filenames };
}

// ---------------------------------------------------------------------------
// Timing helper
// ---------------------------------------------------------------------------

function timeCommand(label, fn) {
  const start = process.hrtime.bigint();
  const result = fn();
  const end = process.hrtime.bigint();
  const ms = Number(end - start) / 1e6;
  return { label, ms, result };
}

function timeCLI(label, cmd) {
  const env = {
    ...process.env,
    ZED_DATA_DIR: TEMP_DATA_DIR,
  };
  const start = process.hrtime.bigint();
  let output;
  try {
    output = execSync(`node ${ZED_BIN} ${cmd}`, {
      env,
      cwd: PROJECT_ROOT,
      timeout: 30000,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (err) {
    output = err.stdout || err.stderr || err.message;
  }
  const end = process.hrtime.bigint();
  const ms = Number(end - start) / 1e6;
  return { label, ms, output: output.trim() };
}

// ---------------------------------------------------------------------------
// Engine-level benchmarks
// ---------------------------------------------------------------------------

function runEngineBenchmarks() {
  const KnowledgeEngine = require('../core/engine.cjs');

  const results = [];

  // Build
  const engine = new KnowledgeEngine({ vaultPath: TEMP_VAULT, dbPath: ':memory:' });
  results.push(timeCommand('engine.build()', () => engine.build()));

  // Stats
  results.push(timeCommand('engine.getStats()', () => engine.getStats()));

  // Search
  results.push(timeCommand('engine.searchNotes("architecture")', () => engine.searchNotes('architecture', { limit: 20 })));
  results.push(timeCommand('engine.searchNotes("cache security")', () => engine.searchNotes('cache security', { limit: 20 })));
  results.push(timeCommand('engine.tieredSearch("pattern")', () => engine.tieredSearch('pattern', { limit: 10 })));
  results.push(timeCommand('engine.searchWithSnippets("database")', () => engine.searchWithSnippets('database', { limit: 10 })));

  // Graph traversal
  const notes = engine.listNotes();
  results.push(timeCommand('engine.findHubs(10)', () => engine.findHubs(10)));
  results.push(timeCommand('engine.findHubs(100)', () => engine.findHubs(100)));
  results.push(timeCommand('engine.getOrphans()', () => engine.getOrphans()));
  results.push(timeCommand('engine.getClusters()', () => engine.getClusters()));

  if (notes.length >= 2) {
    results.push(timeCommand('engine.shortestPath()', () => engine.shortestPath(notes[0], notes[Math.floor(notes.length / 2)])));
    results.push(timeCommand('engine.getRelated(2 hops)', () => engine.getRelated(notes[0], 2)));
    results.push(timeCommand('engine.getBacklinks()', () => engine.getBacklinks(notes[0])));
  }

  // Tags
  results.push(timeCommand('engine.getAllTags()', () => engine.getAllTags()));
  results.push(timeCommand('engine.searchByTag("architecture")', () => engine.searchByTag('architecture', { limit: 50 })));

  // Rebuild
  results.push(timeCommand('engine.rebuild()', () => engine.rebuild()));

  // Incremental build (no changes)
  results.push(timeCommand('engine.incrementalBuild() (no changes)', () => engine.incrementalBuild()));

  engine.close();
  return results;
}

// ---------------------------------------------------------------------------
// CLI benchmarks
// ---------------------------------------------------------------------------

function runCLIBenchmarks() {
  const results = [];

  results.push(timeCLI('zed health', 'health'));
  results.push(timeCLI('zed overview', 'overview'));
  results.push(timeCLI('zed status', 'status'));
  results.push(timeCLI('zed tags', 'tags'));
  results.push(timeCLI('zed search architecture', 'search architecture'));
  results.push(timeCLI('zed graph hubs', 'graph hubs'));
  results.push(timeCLI('zed graph orphans', 'graph orphans'));
  results.push(timeCLI('zed graph clusters', 'graph clusters'));
  results.push(timeCLI('zed recent', 'recent'));
  results.push(timeCLI('zed snippets database', 'snippets database'));

  // Fix is destructive (creates stubs, modifies notes) — run last
  results.push(timeCLI('zed fix', 'fix'));

  return results;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

console.log('ZED Stress Test — 500-Note Vault');
console.log('='.repeat(60));
console.log();

// Step 1: Generate vault
console.log('Step 1: Generating 500-note vault...');
const genStart = process.hrtime.bigint();
generateVault();
const genEnd = process.hrtime.bigint();
const genMs = Number(genEnd - genStart) / 1e6;
console.log(`  Generated ${NOTE_COUNT} notes in ${genMs.toFixed(0)}ms`);
console.log();

// Step 2: Engine-level benchmarks
console.log('Step 2: Engine-level benchmarks');
console.log('-'.repeat(60));
const engineResults = runEngineBenchmarks();

const THRESHOLD_MS = 500;
let hasSlowOps = false;

for (const r of engineResults) {
  const flag = r.ms > THRESHOLD_MS ? ' *** SLOW ***' : '';
  if (r.ms > THRESHOLD_MS) hasSlowOps = true;
  console.log(`  ${r.label.padEnd(45)} ${r.ms.toFixed(1).padStart(8)}ms${flag}`);
}
console.log();

// Step 3: CLI benchmarks
console.log('Step 3: CLI benchmarks (includes process startup)');
console.log('-'.repeat(60));
const cliResults = runCLIBenchmarks();

for (const r of cliResults) {
  // CLI has Node startup overhead (~100-200ms), so we use a higher threshold
  const CLI_THRESHOLD = 2000;
  const flag = r.ms > CLI_THRESHOLD ? ' *** SLOW ***' : '';
  if (r.ms > CLI_THRESHOLD) hasSlowOps = true;
  console.log(`  ${r.label.padEnd(45)} ${r.ms.toFixed(0).padStart(8)}ms${flag}`);
}
console.log();

// Step 4: Verify CLI commands completed without errors
console.log('Step 4: Verify CLI outputs');
console.log('-'.repeat(60));
let allOk = true;
for (const r of cliResults) {
  const hasOutput = r.output && r.output.length > 0;
  const hasError = r.output && (r.output.includes('Error:') || r.output.includes('error:'));
  const status = hasError ? 'ERROR' : hasOutput ? 'OK' : 'EMPTY';
  if (hasError || !hasOutput) allOk = false;
  console.log(`  ${r.label.padEnd(45)} ${status}`);
  if (hasError) {
    console.log(`    Output: ${r.output.substring(0, 200)}`);
  }
}
console.log();

// Summary
console.log('='.repeat(60));
console.log('Summary');
console.log('='.repeat(60));
console.log(`  Vault size:       ${NOTE_COUNT} notes`);
console.log(`  Generation time:  ${genMs.toFixed(0)}ms`);
console.log(`  Engine ops:       ${engineResults.length} tested`);
console.log(`  CLI commands:     ${cliResults.length} tested`);
console.log(`  Slow operations:  ${hasSlowOps ? 'YES — investigate' : 'NONE'}`);
console.log(`  CLI errors:       ${allOk ? 'NONE' : 'YES — investigate'}`);
console.log();

// Cleanup
console.log('Cleaning up temp vault...');
fs.rmSync(TEMP_DATA_DIR, { recursive: true, force: true });
console.log('Done.');

process.exit(hasSlowOps || !allOk ? 1 : 0);
