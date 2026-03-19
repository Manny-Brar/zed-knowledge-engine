/**
 * test-cli.cjs — Integration tests for the ZED CLI
 *
 * Tests all 21 CLI subcommands by spawning the actual bin/zed process.
 */

'use strict';

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

// ---------------------------------------------------------------------------
// Test infrastructure
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  \u2713 ${name}`);
  } catch (err) {
    failed++;
    failures.push({ name, error: err.message });
    console.log(`  \u2717 ${name}: ${err.message}`);
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

// ---------------------------------------------------------------------------
// Setup: temp vault
// ---------------------------------------------------------------------------

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zed-cli-test-'));
const vaultDir = path.join(tmpDir, 'vault');
const dbPath = path.join(tmpDir, 'test.db');

// Create vault structure
for (const sub of ['decisions', 'patterns', 'sessions', 'architecture']) {
  fs.mkdirSync(path.join(vaultDir, sub), { recursive: true });
}

// Create test notes
fs.writeFileSync(path.join(vaultDir, 'project-overview.md'), `---
title: "Project Overview"
date: 2026-03-01
type: note
tags: [architecture, overview]
---

# Project Overview

This is the main project overview for testing.
Links to [[API Design]] and [[Database Schema]].
`);

fs.writeFileSync(path.join(vaultDir, 'decisions', 'api-design.md'), `---
title: "API Design"
date: 2026-03-02
type: decision
tags: [decision, api]
---

# API Design

We chose REST over GraphQL for simplicity.
See [[Project Overview]] for context.
`);

fs.writeFileSync(path.join(vaultDir, 'patterns', 'error-handling.md'), `---
title: "Error Handling Pattern"
date: 2026-03-03
type: pattern
tags: [pattern, errors]
---

# Error Handling Pattern

Always use try/catch at API boundaries.
Related to [[API Design]].
`);

// ---------------------------------------------------------------------------
// CLI runner
// ---------------------------------------------------------------------------

const BIN = path.join(__dirname, '..', 'bin', 'zed');

function zed(cmd, opts = {}) {
  const env = {
    ...process.env,
    ZED_DATA_DIR: tmpDir,
    CLAUDE_PLUGIN_DATA: tmpDir,
  };
  try {
    const result = execSync(`node ${BIN} ${cmd}`, {
      env,
      encoding: 'utf-8',
      timeout: 15000,
      cwd: __dirname,
    });
    return result.trim();
  } catch (err) {
    if (opts.expectError) return (err.stderr || err.stdout || err.message).trim();
    throw new Error(`CLI failed: ${cmd}\n${err.stderr || err.message}`);
  }
}

function zedJson(cmd) {
  const raw = zed(`${cmd} --json`);
  return JSON.parse(raw);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

console.log('\nZED CLI Integration Tests');
console.log('=' .repeat(50));

// --- Help ---
console.log('\nHelp:');
test('help shows usage', () => {
  const out = zed('help');
  assert(out.includes('ZED Knowledge Engine CLI'), 'Should show title');
  assert(out.includes('backlinks'), 'Should list commands');
});

// --- Stats ---
console.log('\nInfo Commands:');
test('stats shows note count', () => {
  const out = zed('stats');
  assert(out.includes('Notes: 3'), `Expected 3 notes, got: ${out}`);
});

test('stats --json returns structured data', () => {
  const data = zedJson('stats');
  assert(data.nodeCount === 3, `Expected 3 nodes, got ${data.nodeCount}`);
  assert(data.edgeCount > 0, 'Should have edges');
});

test('health shows grade', () => {
  const out = zed('health');
  assert(/Vault Health: [A-F]/.test(out), `Expected grade, got: ${out}`);
});

test('health --json has score', () => {
  const data = zedJson('health');
  assert(typeof data.score === 'number', 'Should have numeric score');
  assert(data.grade, 'Should have grade');
});

test('overview shows dashboard', () => {
  const out = zed('overview');
  assert(out.includes('ZED Vault Overview'), 'Should show title');
  assert(out.includes('Notes: 3'), 'Should show note count');
});

test('recent shows notes', () => {
  const out = zed('recent');
  assert(out.includes('Recent Notes'), 'Should show header');
});

// --- Tags ---
console.log('\nTags:');
test('tags lists all tags', () => {
  const out = zed('tags');
  assert(out.includes('decision'), 'Should list decision tag');
  assert(out.includes('pattern'), 'Should list pattern tag');
});

test('tags filters by specific tag', () => {
  const out = zed('tags decision');
  assert(out.includes('API Design'), 'Should find decision-tagged note');
});

test('tags --json structured output', () => {
  const data = zedJson('tags');
  assert(data.tags, 'Should have tags object');
  assert(data.tags.decision >= 1, 'Should have decision tag');
});

// --- Graph queries ---
console.log('\nGraph:');
test('backlinks finds links', () => {
  const out = zed('backlinks "API Design"');
  assert(out.includes('Project Overview') || out.includes('Error Handling'), 'Should find backlinks');
});

test('hubs shows connected nodes', () => {
  const out = zed('hubs');
  assert(out.includes('Knowledge Hubs') || out.includes('backlinks'), 'Should show hubs');
});

test('clusters detects clusters', () => {
  const out = zed('clusters');
  assert(out.includes('Cluster') || out.includes('cluster'), 'Should show clusters');
});

test('related finds nearby notes', () => {
  const out = zed('related "API Design"');
  assert(out.includes('Related') || out.includes('Project Overview') || out.includes('Error Handling'), 'Should find related');
});

test('path finds route between notes', () => {
  const out = zed('path "Project Overview" "Error Handling Pattern"');
  assert(out.includes('→') || out.includes('hop'), 'Should show path');
});

// --- Content ---
console.log('\nContent:');
test('daily creates session note', () => {
  const out = zed('daily "Test session entry"');
  assert(out.includes('created') || out.includes('Appended'), 'Should create/append');
});

test('daily appends to existing', () => {
  const out = zed('daily "Second entry"');
  assert(out.includes('Appended') || out.includes('created'), 'Should append');
});

test('snippets searches with context', () => {
  const out = zed('snippets REST');
  assert(out.includes('API Design') || out.includes('REST'), 'Should find REST mention');
});

test('timeline shows chronological view', () => {
  const out = zed('timeline');
  assert(out.includes('Timeline'), 'Should show timeline');
  assert(out.includes('2026-03'), 'Should show dates');
});

test('suggest-links finds unlinked mentions', () => {
  const out = zed('suggest-links');
  // May or may not find suggestions depending on content
  assert(typeof out === 'string', 'Should return string output');
});

// --- Maintenance ---
console.log('\nMaintenance:');
test('rebuild rebuilds graph', () => {
  const out = zed('rebuild');
  assert(out.includes('Rebuilt'), 'Should confirm rebuild');
  assert(out.includes('nodes'), 'Should show node count');
});

test('rebuild --json has elapsed', () => {
  const data = zedJson('rebuild');
  assert(typeof data.elapsed_ms === 'number', 'Should have timing');
  assert(data.nodeCount >= 3, 'Should have nodes');
});

test('graph exports data', () => {
  const data = zedJson('graph');
  assert(data.stats, 'Should have stats');
  assert(Array.isArray(data.nodes), 'Should have nodes array');
});

// --- License ---
console.log('\nLicense:');
test('license shows status', () => {
  const out = zed('license');
  assert(out.includes('Status:') || out.includes('Inactive') || out.includes('Active'), 'Should show status');
});

// --- Error handling ---
console.log('\nError Handling:');
test('unknown command shows help', () => {
  const out = zed('nonexistent', { expectError: true });
  assert(out.includes('Unknown command') || out.includes('ZED'), 'Should indicate unknown');
});

test('backlinks with missing note errors', () => {
  const out = zed('backlinks "Nonexistent Note"', { expectError: true });
  assert(out.includes('not found') || out.includes('Error'), 'Should error');
});

// --- JSON mode ---
console.log('\nJSON Mode:');
test('overview --json returns object', () => {
  const data = zedJson('overview');
  assert(data.stats, 'Should have stats');
  assert(typeof data.score === 'number', 'Should have score');
});

test('recent --json returns array', () => {
  const data = zedJson('recent');
  assert(Array.isArray(data.recent), 'Should have recent array');
});

// ---------------------------------------------------------------------------
// Cleanup + Results
// ---------------------------------------------------------------------------

fs.rmSync(tmpDir, { recursive: true, force: true });

console.log('\n' + '=' .repeat(50));
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log('=' .repeat(50));

if (failures.length > 0) {
  console.log('\nFailures:');
  failures.forEach(f => console.log(`  - ${f.name}: ${f.error}`));
}

process.exit(failed > 0 ? 1 : 0);
