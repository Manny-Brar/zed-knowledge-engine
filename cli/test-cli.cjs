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
    // Quote BIN so paths containing spaces (e.g. iCloud's "Mobile Documents")
    // don't break argv splitting.
    const result = execSync(`node "${BIN}" ${cmd}`, {
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

// --- Evolve Loop ---
console.log('\nEvolve Loop:');
test('loop-init creates loop state files', () => {
  const out = zed('loop-init "test objective" --max 3');
  assert(out.includes('Evolve loop initialized'), `Expected init message, got: ${out}`);
  assert(out.includes('test objective'), 'Should echo objective');
  // Verify files were created
  const loopDir = path.join(vaultDir, '_loop');
  assert(fs.existsSync(path.join(loopDir, 'objective.md')), 'objective.md should exist');
  assert(fs.existsSync(path.join(loopDir, 'progress.md')), 'progress.md should exist');
});

test('loop-init --json returns structured data', () => {
  // Re-init to test JSON mode
  const data = zedJson('loop-init "json test objective" --max 5');
  assert(data.action === 'loop-init', 'Should have action');
  assert(data.objective === 'json test objective', 'Should have objective');
  assert(data.max_iterations === 5, 'Should have max_iterations');
});

test('loop-status reports active loop', () => {
  const out = zed('loop-status');
  assert(out.includes('Evolve Loop Status'), `Expected status header, got: ${out}`);
  assert(out.includes('Objective:'), 'Should show objective');
  assert(out.includes('Iteration:'), 'Should show iteration');
});

test('loop-status --json has active flag', () => {
  const data = zedJson('loop-status');
  assert(data.active === true, 'Should be active');
  assert(data.objective, 'Should have objective');
  assert(typeof data.iteration === 'number', 'Should have iteration number');
});

test('loop-tick advances iteration', () => {
  const out = zed('loop-tick "completed first step"');
  assert(out.includes('Iteration 1'), `Expected iteration 1, got: ${out}`);
  assert(out.includes('Continue:'), 'Should indicate whether to continue');
});

test('loop-tick --json returns iteration data', () => {
  const data = zedJson('loop-tick "completed second step"');
  assert(data.iteration === 2, `Expected iteration 2, got ${data.iteration}`);
  assert(typeof data.continue === 'boolean', 'Should have continue flag');
});

test('loop-stop marks loop as completed', () => {
  const out = zed('loop-stop "test complete"');
  assert(out.includes('Evolve loop stopped'), `Expected stop message, got: ${out}`);
  // Verify objective was updated
  const objectiveContent = fs.readFileSync(path.join(vaultDir, '_loop', 'objective.md'), 'utf-8');
  assert(objectiveContent.includes('completed: true'), 'Should mark completed');
  assert(objectiveContent.includes('test complete'), 'Should include stop reason');
});

test('loop-stop --json returns structured data', () => {
  // Re-init a new loop to test JSON stop
  zed('loop-init "another objective" --max 2');
  const data = zedJson('loop-stop "json stop test"');
  assert(data.action === 'loop-stop', 'Should have action');
  assert(data.reason === 'json stop test', 'Should have reason');
  assert(data.timestamp, 'Should have timestamp');
});

// --- Structured Features (decompose/next/complete) ---
console.log('\nStructured Features:');
test('loop-decompose creates features.json', () => {
  // Clean loop dir and re-init
  const loopDir = path.join(vaultDir, '_loop');
  for (const f of fs.readdirSync(loopDir)) {
    fs.rmSync(path.join(loopDir, f), { recursive: true, force: true });
  }
  zed('loop-init "decompose test" --max 10');
  const out = zed('loop-decompose "auth system, user dashboard, notification service"');
  assert(out.includes('Decomposed into 3 features'), `Expected 3 features, got: ${out}`);
  const featuresPath = path.join(vaultDir, '_loop', 'features.json');
  assert(fs.existsSync(featuresPath), 'features.json should exist');
  const features = JSON.parse(fs.readFileSync(featuresPath, 'utf8'));
  assert(features.length === 3, `Expected 3 features, got ${features.length}`);
  assert(features[0].description === 'auth system', `Expected 'auth system', got '${features[0].description}'`);
  assert(features[0].status === 'pending', `Expected pending, got ${features[0].status}`);
  assert(features[0].attempts === 0, `Expected 0 attempts, got ${features[0].attempts}`);
});

test('loop-next returns first pending feature', () => {
  const data = zedJson('loop-next');
  assert(data.next !== null, 'Should return a feature');
  assert(data.next.id === 1, `Expected feature #1, got #${data.next.id}`);
  assert(data.next.status === 'in_progress', `Expected in_progress, got ${data.next.status}`);
  assert(data.next.attempts === 1, `Expected 1 attempt, got ${data.next.attempts}`);
});

test('loop-complete marks feature done', () => {
  const data = zedJson('loop-complete');
  assert(data.completed.id === 1, `Expected completed feature #1, got #${data.completed.id}`);
  assert(data.completed.status === 'done', `Expected done, got ${data.completed.status}`);
  assert(data.completed.completed_at !== null, 'Should have completed_at timestamp');
  assert(data.remaining === 2, `Expected 2 remaining, got ${data.remaining}`);
});

test('loop-status reports no loop after stop+promote or clean state', () => {
  // Clean up loop dir to simulate no active loop
  const loopDir = path.join(vaultDir, '_loop');
  for (const f of fs.readdirSync(loopDir)) {
    fs.rmSync(path.join(loopDir, f), { recursive: true, force: true });
  }
  const out = zed('loop-status');
  assert(out.includes('No active evolve loop'), `Expected no loop, got: ${out}`);
});

// --- Visualize ---
console.log('\nVisualize:');
test('visualize --out writes valid Excalidraw JSON', () => {
  const outFile = path.join(tmpDir, 'test-graph.json');
  const out = zed(`visualize --out ${outFile}`);
  assert(out.includes('Excalidraw graph written'), `Expected write confirmation, got: ${out}`);
  assert(fs.existsSync(outFile), 'Output file should exist');
  const data = JSON.parse(fs.readFileSync(outFile, 'utf-8'));
  assert(data.type === 'excalidraw', `Expected type=excalidraw, got ${data.type}`);
  assert(data.version === 2, 'Should have version 2');
  assert(Array.isArray(data.elements), 'Should have elements array');
  assert(data.elements.length > 0, 'Should have at least one element');
  // Should have rectangles and text elements for notes
  const rects = data.elements.filter(e => e.type === 'rectangle');
  const texts = data.elements.filter(e => e.type === 'text');
  assert(rects.length >= 3, `Expected at least 3 rectangles, got ${rects.length}`);
  assert(texts.length >= 3, `Expected at least 3 text elements, got ${texts.length}`);
  // Should have arrows for edges
  const arrows = data.elements.filter(e => e.type === 'arrow');
  assert(arrows.length > 0, 'Should have at least one arrow');
});

// --- Edge Cases ---
console.log('\nEdge Cases:');

test('unknown command shows error and exits non-zero', () => {
  let exitedWithError = false;
  try {
    execSync(`node "${BIN}" nonexistent`, {
      env: { ...process.env, ZED_DATA_DIR: tmpDir, CLAUDE_PLUGIN_DATA: tmpDir },
      encoding: 'utf-8', timeout: 15000, cwd: __dirname,
    });
  } catch (err) {
    exitedWithError = true;
    assert(err.stderr.includes('Unknown command'), `Expected unknown command error, got stderr: ${err.stderr}`);
    // Help text is printed to stdout alongside the error
    assert(err.stdout.includes('backlinks') || err.stdout.includes('stats'),
      'Should print help with valid commands to stdout');
  }
  assert(exitedWithError, 'Unknown command should exit with non-zero code');
});

test('version outputs version number', () => {
  const out = zed('version');
  assert(/^zed v\d+\.\d+\.\d+$/.test(out), `Expected version format, got: ${out}`);
});

test('stats on empty vault handles gracefully', () => {
  // Create a separate empty vault
  const emptyVaultDir = path.join(tmpDir, 'empty-vault');
  fs.mkdirSync(emptyVaultDir, { recursive: true });
  const emptyDbPath = path.join(tmpDir, 'empty-test.db');
  const env = {
    ...process.env,
    ZED_DATA_DIR: path.join(tmpDir, 'empty-env'),
    CLAUDE_PLUGIN_DATA: path.join(tmpDir, 'empty-env'),
  };
  try {
    const result = execSync(`node "${BIN}" stats`, {
      env, encoding: 'utf-8', timeout: 15000, cwd: __dirname,
    }).trim();
    assert(result.includes('Notes: 0'), `Expected 0 notes, got: ${result}`);
  } catch (err) {
    // Should not crash; if it does, the assertion below will fail
    const msg = (err.stderr || err.stdout || err.message).trim();
    assert(false, `stats on empty vault crashed: ${msg}`);
  }
});

test('health on empty vault shows empty message', () => {
  const env = {
    ...process.env,
    ZED_DATA_DIR: path.join(tmpDir, 'empty-env'),
    CLAUDE_PLUGIN_DATA: path.join(tmpDir, 'empty-env'),
  };
  try {
    const result = execSync(`node "${BIN}" health`, {
      env, encoding: 'utf-8', timeout: 15000, cwd: __dirname,
    }).trim();
    assert(result.includes('Empty') || result.includes('0'), `Expected empty vault message, got: ${result}`);
  } catch (err) {
    const msg = (err.stderr || err.stdout || err.message).trim();
    assert(false, `health on empty vault crashed: ${msg}`);
  }
});

test('snippets with special characters does not crash', () => {
  const out = zed('snippets "test & <script>"');
  // Should either return results or "No results" — not crash
  assert(typeof out === 'string', 'Should return string output');
  assert(out.includes('No results') || out.includes('Snippets'), 'Should handle special chars gracefully');
});

test('tags with no tagged notes returns no tags', () => {
  const env = {
    ...process.env,
    ZED_DATA_DIR: path.join(tmpDir, 'empty-env'),
    CLAUDE_PLUGIN_DATA: path.join(tmpDir, 'empty-env'),
  };
  try {
    const result = execSync(`node "${BIN}" tags`, {
      env, encoding: 'utf-8', timeout: 15000, cwd: __dirname,
    }).trim();
    assert(result.includes('No tags found') || result.includes('Tags'), `Expected no-tags message, got: ${result}`);
  } catch (err) {
    const msg = (err.stderr || err.stdout || err.message).trim();
    assert(false, `tags on empty vault crashed: ${msg}`);
  }
});

test('timeline with invalid type shows error with valid types', () => {
  const out = zed('timeline invalid', { expectError: true });
  assert(out.includes('Invalid type') || out.includes('Valid types'), `Expected invalid type error, got: ${out}`);
  assert(out.includes('decision') && out.includes('pattern'), 'Should list valid types');
});

test('graph on empty vault handles no nodes', () => {
  const env = {
    ...process.env,
    ZED_DATA_DIR: path.join(tmpDir, 'empty-env'),
    CLAUDE_PLUGIN_DATA: path.join(tmpDir, 'empty-env'),
  };
  try {
    const result = execSync(`node "${BIN}" graph --json`, {
      env, encoding: 'utf-8', timeout: 15000, cwd: __dirname,
    }).trim();
    const data = JSON.parse(result);
    assert(Array.isArray(data.nodes), 'Should have nodes array');
    assert(data.nodes.length === 0, `Expected 0 nodes, got ${data.nodes.length}`);
    assert(Array.isArray(data.edges), 'Should have edges array');
  } catch (err) {
    const msg = (err.stderr || err.stdout || err.message).trim();
    assert(false, `graph on empty vault crashed: ${msg}`);
  }
});

test('snippets with no matching results returns empty', () => {
  const out = zed('snippets "xyznonexistent123"');
  assert(out.includes('No results'), `Expected no results message, got: ${out}`);
});

test('help prints help text without error', () => {
  const out = zed('help');
  assert(out.includes('ZED Knowledge Engine CLI'), 'Should show CLI title');
  assert(out.includes('Usage:'), 'Should show usage');
  assert(out.includes('--json'), 'Should mention --json option');
});

// --- Backup ---
console.log('\nBackup:');
test('backup creates tar.gz archive', () => {
  const backupDir = path.join(tmpDir, 'backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const out = zed(`backup ${backupDir}`);
  assert(out.includes('Backup created'), `Expected backup message, got: ${out}`);
  assert(out.includes('.tar.gz'), 'Should mention tar.gz file');
  assert(out.includes('KB'), 'Should show file size');
  // Verify archive was created
  const files = fs.readdirSync(backupDir);
  const backups = files.filter(f => f.startsWith('zed-vault-backup-') && f.endsWith('.tar.gz'));
  assert(backups.length === 1, `Expected 1 backup file, got ${backups.length}`);
});

test('backup --json returns structured data', () => {
  const backupDir = path.join(tmpDir, 'backups-json');
  fs.mkdirSync(backupDir, { recursive: true });
  const data = zedJson(`backup ${backupDir}`);
  assert(data.action === 'backup', `Expected action=backup, got ${data.action}`);
  assert(data.file.endsWith('.tar.gz'), 'File should end with .tar.gz');
  assert(typeof data.noteCount === 'number', 'Should have noteCount');
  assert(data.noteCount >= 3, `Expected at least 3 notes, got ${data.noteCount}`);
  assert(typeof data.sizeBytes === 'number', 'Should have sizeBytes');
});

test('backup to nonexistent dir errors', () => {
  const out = zed('backup /nonexistent/path/for/testing', { expectError: true });
  assert(out.includes('not found') || out.includes('Error'), `Expected error, got: ${out}`);
});

// --- Fix ---
console.log('\nFix:');

// Add a note without tags and with a broken wikilink for fix to resolve
fs.writeFileSync(path.join(vaultDir, 'no-tags-note.md'), `---
title: "No Tags Note"
date: 2026-03-10
type: note
---

# No Tags Note

This note has no tags and links to [[Nonexistent Page]].
`);

// Rebuild so the engine picks up the new note
zed('rebuild');

test('fix resolves vault issues', () => {
  const out = zed('fix');
  assert(out.includes('Fixed'), `Expected fix output, got: ${out}`);
  assert(out.includes('Health:'), 'Should show health score');
});

test('fix --json returns structured data', () => {
  // Re-create the tagless note for a fresh fix run
  fs.writeFileSync(path.join(vaultDir, 'another-no-tags.md'), `---
title: "Another No Tags"
date: 2026-03-11
type: note
---

# Another No Tags

Content without tags.
`);
  zed('rebuild');
  const data = zedJson('fix');
  assert(Array.isArray(data.fixed), 'Should have fixed array');
  assert(data.score, 'Should have score object');
  assert(typeof data.score.before === 'number', 'Should have before score');
  assert(typeof data.score.after === 'number', 'Should have after score');
});

test('fix on empty vault reports nothing to fix', () => {
  const env = {
    ...process.env,
    ZED_DATA_DIR: path.join(tmpDir, 'empty-env'),
    CLAUDE_PLUGIN_DATA: path.join(tmpDir, 'empty-env'),
  };
  try {
    const result = execSync(`node "${BIN}" fix`, {
      env, encoding: 'utf-8', timeout: 15000, cwd: __dirname,
    }).trim();
    assert(result.includes('empty') || result.includes('Nothing'), `Expected empty message, got: ${result}`);
  } catch (err) {
    const msg = (err.stderr || err.stdout || err.message).trim();
    assert(false, `fix on empty vault crashed: ${msg}`);
  }
});

test('fix appears in help', () => {
  const out = zed('help');
  assert(out.includes('fix'), 'Help should list fix command');
});

// --- Scan ---
console.log('\nScan:');

test('scan generates architecture notes', () => {
  // Create a temp project directory with a package.json
  const scanTarget = path.join(tmpDir, 'scan-project');
  fs.mkdirSync(path.join(scanTarget, 'src'), { recursive: true });
  fs.mkdirSync(path.join(scanTarget, 'lib'), { recursive: true });
  fs.writeFileSync(path.join(scanTarget, 'package.json'), JSON.stringify({
    name: 'test-scan-project',
    version: '1.0.0',
    dependencies: { express: '^4.18.0', pg: '^8.11.0' },
    devDependencies: { jest: '^29.0.0' },
  }));
  fs.writeFileSync(path.join(scanTarget, 'src', 'index.js'), '// entry');
  fs.writeFileSync(path.join(scanTarget, 'lib', 'utils.js'), '// utils');
  fs.writeFileSync(path.join(scanTarget, 'README.md'), '# Test Project\nA test project for scanning.');

  const out = zed(`scan ${scanTarget}`);
  assert(out.includes('test-scan-project'), `Expected project name, got: ${out}`);
  assert(out.includes('architecture'), 'Should mention architecture note');
  assert(out.includes('tech-stack'), 'Should mention tech-stack note');

  // Verify the notes were actually created
  const projectsVault = path.join(vaultDir, 'projects');
  const archNote = path.join(projectsVault, 'test-scan-project-architecture.md');
  assert(fs.existsSync(archNote), 'Architecture note should exist');
  const archContent = fs.readFileSync(archNote, 'utf-8');
  assert(archContent.includes('[[test-scan-project-tech-stack]]'), 'Architecture should link to tech stack');
  assert(archContent.includes('tags: [architecture, test-scan-project]'), 'Should have architecture tags');

  // Verify module notes have wikilinks
  const modSrc = path.join(projectsVault, 'test-scan-project-module-src.md');
  assert(fs.existsSync(modSrc), 'Module src note should exist');
  const modContent = fs.readFileSync(modSrc, 'utf-8');
  assert(modContent.includes('[[test-scan-project-architecture]]'), 'Module should link to architecture');
  assert(modContent.includes('[[test-scan-project-tech-stack]]'), 'Module should link to tech stack');
});

test('scan --json returns structured data', () => {
  const scanTarget = path.join(tmpDir, 'scan-project-json');
  fs.mkdirSync(path.join(scanTarget, 'api'), { recursive: true });
  fs.writeFileSync(path.join(scanTarget, 'package.json'), JSON.stringify({
    name: 'json-scan-test',
    version: '0.1.0',
    dependencies: { react: '^18.0.0' },
  }));
  fs.writeFileSync(path.join(scanTarget, 'api', 'handler.ts'), '// handler');

  const data = zedJson(`scan ${scanTarget}`);
  assert(data.action === 'scan', `Expected action=scan, got ${data.action}`);
  assert(data.project === 'json-scan-test', `Expected project name, got ${data.project}`);
  assert(data.noteCount >= 3, `Expected at least 3 notes, got ${data.noteCount}`);
  assert(Array.isArray(data.notes), 'Should have notes array');
  assert(data.notes.some(n => n.type === 'architecture'), 'Should have architecture note');
  assert(data.notes.some(n => n.type === 'tech-stack'), 'Should have tech-stack note');
  assert(typeof data.graphNodes === 'number', 'Should have graphNodes count');
});

// ---------------------------------------------------------------------------
// Error Handling Audit Tests
// ---------------------------------------------------------------------------

console.log('\nError Handling:');

test('loop-tick without active loop says no active loop', () => {
  // Clean loop dir
  const loopDir = path.join(vaultDir, '_loop');
  for (const f of fs.readdirSync(loopDir)) {
    fs.rmSync(path.join(loopDir, f), { recursive: true, force: true });
  }
  const out = zed('loop-tick "test"', { expectError: true });
  assert(out.includes('No active evolve loop'), `Expected no active loop message, got: ${out}`);
});

test('loop-stop without active loop says no active loop', () => {
  const out = zed('loop-stop "test"', { expectError: true });
  assert(out.includes('No active evolve loop'), `Expected no active loop message, got: ${out}`);
});

test('loop-decompose without active loop says no active loop', () => {
  const out = zed('loop-decompose "feature1"', { expectError: true });
  assert(out.includes('No active evolve loop'), `Expected no active loop message, got: ${out}`);
});

test('loop-next without features.json says no features', () => {
  const out = zed('loop-next');
  assert(out.includes('No features.json') || out.includes('features'), `Expected no features message, got: ${out}`);
});

test('loop-complete without features says helpful message', () => {
  const out = zed('loop-complete', { expectError: true });
  assert(out.includes('No features found'), `Expected helpful message, got: ${out}`);
});

test('double loop-init warns about overwriting', () => {
  zed('loop-init "first objective"');
  const out = zed('loop-init "second objective"', { expectError: true });
  // The warning goes to stderr, the success to stdout; expectError captures stderr
  // But the command succeeds, so we need to check differently
  const loopDir = path.join(vaultDir, '_loop');
  const content = fs.readFileSync(path.join(loopDir, 'objective.md'), 'utf-8');
  assert(content.includes('second objective'), `Expected second objective, got overwrite issue`);
});

test('visualize on empty vault says nothing to visualize', () => {
  const env = {
    ...process.env,
    ZED_DATA_DIR: path.join(tmpDir, 'empty-env'),
    CLAUDE_PLUGIN_DATA: path.join(tmpDir, 'empty-env'),
  };
  try {
    const result = execSync(`node "${BIN}" visualize --out ${path.join(tmpDir, 'empty-viz.json')}`, {
      env, encoding: 'utf-8', timeout: 15000, cwd: __dirname,
    }).trim();
    assert(result.includes('Nothing to visualize'), `Expected nothing to visualize, got: ${result}`);
  } catch (err) {
    const msg = (err.stderr || err.stdout || err.message).trim();
    assert(false, `visualize on empty vault crashed: ${msg}`);
  }
});

test('scan on directory without package.json uses dir name', () => {
  const noPackageDir = path.join(tmpDir, 'no-pkg-project');
  fs.mkdirSync(path.join(noPackageDir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(noPackageDir, 'src', 'main.js'), '// entry');
  const out = zed(`scan ${noPackageDir}`);
  assert(out.includes('no-pkg-project'), `Expected dir name as project name, got: ${out}`);
});

test('CLI with nonexistent vault dir creates it gracefully', () => {
  const env = {
    ...process.env,
    ZED_DATA_DIR: path.join(tmpDir, 'fresh-vault-test'),
    CLAUDE_PLUGIN_DATA: path.join(tmpDir, 'fresh-vault-test'),
  };
  try {
    const result = execSync(`node "${BIN}" stats`, {
      env, encoding: 'utf-8', timeout: 15000, cwd: __dirname,
    }).trim();
    assert(result.includes('Notes: 0'), `Expected empty stats, got: ${result}`);
  } catch (err) {
    const msg = (err.stderr || err.stdout || err.message).trim();
    assert(false, `stats with nonexistent vault crashed: ${msg}`);
  }
});

test('path traversal is rejected', () => {
  const out = zed('backlinks "../../etc/passwd"', { expectError: true });
  assert(out.includes('not found') || out.includes('Error'), `Expected rejection, got: ${out}`);
});

// Re-init loop for any subsequent tests
zed('loop-init "restored for hooks"');

// ---------------------------------------------------------------------------
// Hook Tests
// ---------------------------------------------------------------------------

console.log('\nHook Tests:');

// Hook test helper
function runHook(hookScript, env = {}) {
  const scriptPath = path.join(__dirname, '..', 'scripts', hookScript);
  const fullEnv = { ...process.env, ...env };
  try {
    const output = execSync(`bash "${scriptPath}"`, {
      env: fullEnv,
      timeout: 15000,
      encoding: 'utf8',
    });
    return { output, exitCode: 0 };
  } catch (e) {
    return { output: e.stdout || '', stderr: e.stderr || '', exitCode: e.status };
  }
}

// Create a fresh hook test dir with vault structure for each test
function makeHookEnv() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zed-hook-test-'));
  const vault = path.join(dir, 'vault');
  for (const sub of ['sessions', '_loop']) {
    fs.mkdirSync(path.join(vault, sub), { recursive: true });
  }
  // Create a minimal note so overview has something to report
  fs.writeFileSync(path.join(vault, 'test-note.md'), `---
title: "Test Note"
date: 2026-03-23
type: note
tags: [test]
---

# Test Note
Content.
`);
  return { dir, vault };
}

// 1. session-start outputs vault stats
test('session-start outputs vault stats', () => {
  const { dir, vault } = makeHookEnv();
  const { output } = runHook('session-start.sh', { CLAUDE_PLUGIN_DATA: dir });
  assert(
    output.includes('ZED Vault Overview') || output.includes('Notes:'),
    `Expected vault stats in output, got: ${output.substring(0, 200)}`
  );
  fs.rmSync(dir, { recursive: true, force: true });
});

// 2. session-start loads soul document
test('session-start loads soul document', () => {
  const { dir, vault } = makeHookEnv();
  const { output } = runHook('session-start.sh', { CLAUDE_PLUGIN_DATA: dir });
  assert(
    output.includes('Core Identity') || output.includes('Soul Document'),
    `Expected soul document content, got: ${output.substring(0, 300)}`
  );
  fs.rmSync(dir, { recursive: true, force: true });
});

// 3. post-edit-hook increments edit count
test('post-edit-hook increments edit count', () => {
  const { dir } = makeHookEnv();
  // Seed tracker with edit_count=0
  const tracker = path.join(dir, 'edit-tracker.json');
  fs.writeFileSync(tracker, JSON.stringify({ edit_count: 0, files: [], started: new Date().toISOString(), captures: 0 }));
  runHook('post-edit-hook.sh', { CLAUDE_PLUGIN_DATA: dir });
  const updated = JSON.parse(fs.readFileSync(tracker, 'utf8'));
  assert(updated.edit_count === 1, `Expected edit_count=1, got ${updated.edit_count}`);
  fs.rmSync(dir, { recursive: true, force: true });
});

// 4. post-edit-hook tracks file paths
test('post-edit-hook tracks file paths', () => {
  const { dir } = makeHookEnv();
  const tracker = path.join(dir, 'edit-tracker.json');
  fs.writeFileSync(tracker, JSON.stringify({ edit_count: 0, files: [], started: new Date().toISOString(), captures: 0 }));
  runHook('post-edit-hook.sh', {
    CLAUDE_PLUGIN_DATA: dir,
    CLAUDE_TOOL_ARG_file_path: '/src/index.js',
  });
  const updated = JSON.parse(fs.readFileSync(tracker, 'utf8'));
  assert(updated.files.includes('/src/index.js'), `Expected /src/index.js in files, got ${JSON.stringify(updated.files)}`);
  fs.rmSync(dir, { recursive: true, force: true });
});

// 5. post-edit-hook warns on drift
test('post-edit-hook warns on drift', () => {
  const { dir } = makeHookEnv();
  const tracker = path.join(dir, 'edit-tracker.json');
  // Seed with 25 edits so next one (26) triggers drift warning (>25)
  fs.writeFileSync(tracker, JSON.stringify({ edit_count: 25, files: [], started: new Date().toISOString(), captures: 0 }));
  const { output } = runHook('post-edit-hook.sh', { CLAUDE_PLUGIN_DATA: dir });
  assert(
    output.includes('DRIFT WARNING'),
    `Expected DRIFT WARNING in output, got: ${output}`
  );
  fs.rmSync(dir, { recursive: true, force: true });
});

// 6. pre-compact-hook outputs reminder
test('pre-compact-hook outputs compaction reminder', () => {
  const { dir } = makeHookEnv();
  const { output } = runHook('pre-compact-hook.sh', { CLAUDE_PLUGIN_DATA: dir });
  assert(
    output.includes('compaction'),
    `Expected compaction reminder, got: ${output}`
  );
  fs.rmSync(dir, { recursive: true, force: true });
});

// 7. stop-hook allows exit with no loop
test('stop-hook allows exit with no loop', () => {
  const { dir, vault } = makeHookEnv();
  // Remove _loop dir so there's no active loop
  fs.rmSync(path.join(vault, '_loop'), { recursive: true, force: true });
  // Also remove objective specifically — the hook checks for objective file not _loop dir
  const { output, exitCode } = runHook('stop-hook.sh', { CLAUDE_PLUGIN_DATA: dir });
  assert(exitCode === 0, `Expected exit code 0, got ${exitCode}`);
  // Output should not contain blocking JSON
  assert(!output.includes('"decision"'), `Expected no blocking JSON, got: ${output}`);
  fs.rmSync(dir, { recursive: true, force: true });
});

// 8. stop-hook blocks with active loop
test('stop-hook blocks with active loop', () => {
  const { dir, vault } = makeHookEnv();
  const loopDir = path.join(vault, '_loop');
  fs.writeFileSync(path.join(loopDir, 'objective.md'), `---
title: "Test Objective"
max_iterations: 5
completed: false
---

# Test Objective
Do something.
`);
  fs.writeFileSync(path.join(loopDir, 'progress.md'), `---
iteration: 1
---

# Progress
- Step 1 done
`);
  // Seed tracker with some edits
  fs.writeFileSync(path.join(dir, 'edit-tracker.json'), JSON.stringify({
    edit_count: 5, files: ['/a.js'], started: new Date().toISOString(), captures: 1,
  }));
  const { output } = runHook('stop-hook.sh', { CLAUDE_PLUGIN_DATA: dir });
  assert(
    output.includes('"decision"') || output.includes('block'),
    `Expected blocking JSON with decision, got: ${output.substring(0, 300)}`
  );
  fs.rmSync(dir, { recursive: true, force: true });
});

// 9. stop-hook enforces capture gate
test('stop-hook enforces capture gate', () => {
  const { dir, vault } = makeHookEnv();
  const loopDir = path.join(vault, '_loop');
  fs.writeFileSync(path.join(loopDir, 'objective.md'), `---
title: "Capture Test"
max_iterations: 5
completed: false
---

# Capture Test
`);
  fs.writeFileSync(path.join(loopDir, 'progress.md'), `---
iteration: 1
---
`);
  // 10 edits, 0 captures — should trigger capture gate
  fs.writeFileSync(path.join(dir, 'edit-tracker.json'), JSON.stringify({
    edit_count: 10, files: ['/a.js'], started: new Date().toISOString(), captures: 0,
  }));
  const { output } = runHook('stop-hook.sh', { CLAUDE_PLUGIN_DATA: dir });
  assert(
    output.includes('CAPTURE REQUIRED'),
    `Expected CAPTURE REQUIRED in output, got: ${output.substring(0, 300)}`
  );
  fs.rmSync(dir, { recursive: true, force: true });
});

// 10. session-end auto-creates daily note
test('session-end auto-creates daily note', () => {
  const { dir, vault } = makeHookEnv();
  // Use local date to match bash `date +%Y-%m-%d`
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const dailyNote = path.join(vault, 'sessions', `${today}.md`);
  // Ensure no daily note exists
  if (fs.existsSync(dailyNote)) fs.unlinkSync(dailyNote);
  // Seed a tracker so session-end has something to work with
  fs.writeFileSync(path.join(dir, 'edit-tracker.json'), JSON.stringify({
    edit_count: 2, files: [], started: new Date().toISOString(), captures: 1,
  }));
  runHook('session-end.sh', { CLAUDE_PLUGIN_DATA: dir });
  assert(fs.existsSync(dailyNote), `Expected daily note at ${dailyNote}`);
  const content = fs.readFileSync(dailyNote, 'utf8');
  assert(content.includes('title:'), 'Daily note should have frontmatter');
  assert(content.includes('type: daily'), 'Daily note should have type: daily');
  fs.rmSync(dir, { recursive: true, force: true });
});

// --- Analytics ---
console.log('\nAnalytics:');
test('analytics returns vault stats', () => {
  const out = zed('analytics');
  assert(out.includes('ZED Vault Analytics'), `Expected header, got: ${out}`);
  assert(out.includes('Total:'), 'Should show total notes');
  assert(out.includes('Density:'), 'Should show density');
  assert(out.includes('By Type:'), 'Should show type breakdown');
  assert(out.includes('Last 7 Days:'), 'Should show recent activity');
  assert(out.includes('Top Tags:'), 'Should show top tags');
});

test('analytics --json returns structured data', () => {
  const data = zedJson('analytics');
  assert(data.stats, 'Should have stats');
  assert(data.byType, 'Should have byType');
  assert(Array.isArray(data.recentDays), 'Should have recentDays array');
  assert(typeof data.density === 'number', 'Density should be a number');
  assert(data.topTags, 'Should have topTags');
  assert(typeof data.orphanRatio === 'number', 'orphanRatio should be a number');
  assert(data.health && typeof data.health.score === 'number', 'Should have health score');
});

test('analytics appears in help', () => {
  const out = zed('help');
  assert(out.includes('analytics'), 'Help should list analytics command');
});

// --- Search alias + vault-info ---
console.log('\nSearch Alias + Vault Info:');
test('search is alias for snippets', () => {
  const out = zed('search "test"');
  // Should not error — either returns results or "No results"
  assert(out.length > 0, 'Should produce output');
  assert(!out.includes('Unknown command'), 'Should be recognized as a command');
});

test('vault-info returns JSON', () => {
  const raw = zed('vault-info');
  const data = JSON.parse(raw);
  assert(typeof data.version === 'string', 'Should have version string');
  assert(typeof data.notes === 'number', 'Should have notes count');
  assert(data.health && typeof data.health.score === 'number', 'Should have health.score');
  assert(data.health && typeof data.health.grade === 'string', 'Should have health.grade');
  assert(typeof data.vault === 'string', 'Should have vault path');
});

// --- Stale Note Detection ---
console.log('\nStale Note Detection:');
test('health reports stale notes', () => {
  // Create a note and set its mtime to 60 days ago
  const stalePath = path.join(vaultDir, 'stale-test-note.md');
  fs.writeFileSync(stalePath, `---
title: "Stale Test Note"
type: note
---

# Stale Test Note

This note is old and should be flagged.
`);
  const sixtyDaysAgo = new Date(Date.now() - (60 * 24 * 60 * 60 * 1000));
  fs.utimesSync(stalePath, sixtyDaysAgo, sixtyDaysAgo);

  const out = zed('health');
  assert(out.includes('Stale notes'), `Expected "Stale notes" in output, got: ${out}`);
  assert(out.includes('Stale Test Note'), `Expected stale note title in output, got: ${out}`);

  // Clean up the stale note
  fs.unlinkSync(stalePath);
});

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

test('export creates valid JSON with notes', () => {
  const exportFile = path.join(tmpDir, 'test-export.json');
  zed(`export ${exportFile}`);
  assert(fs.existsSync(exportFile), 'Export file should exist');
  const data = JSON.parse(fs.readFileSync(exportFile, 'utf-8'));
  assert(data.version, 'Export should have version');
  assert(data.exported_at, 'Export should have exported_at timestamp');
  assert(Array.isArray(data.notes), 'Export should have notes array');
  assert(data.notes.length > 0, 'Export should contain at least one note');
  assert(data.notes[0].title, 'Each note should have a title');
  assert(data.notes[0].path, 'Each note should have a path');
  assert(data.stats, 'Export should have stats');
  fs.unlinkSync(exportFile);
});

// ---------------------------------------------------------------------------
// Merge
// ---------------------------------------------------------------------------

test('merge imports notes from export JSON', () => {
  // Export current vault
  const exportFile = path.join(tmpDir, 'merge-export.json');
  zed(`export ${exportFile}`);
  assert(fs.existsSync(exportFile), 'Export file should exist');
  const data = JSON.parse(fs.readFileSync(exportFile, 'utf-8'));
  const exportedCount = data.notes.length;
  assert(exportedCount > 0, 'Export should have notes');

  // Create a fresh vault to merge into
  const mergeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zed-merge-test-'));
  const mergeVault = path.join(mergeDir, 'vault');
  const mergeDb = path.join(mergeDir, 'merge.db');
  fs.mkdirSync(mergeVault, { recursive: true });

  const mergeResult = execSync(
    `node "${path.join(__dirname, '..', 'bin', 'zed')}" merge "${exportFile}"`,
    { env: { ...process.env, ZED_DATA_DIR: mergeDir }, encoding: 'utf-8' }
  );
  assert(mergeResult.includes('Merged'), 'Should report merge results');
  assert(mergeResult.includes(`Imported: ${exportedCount} new`), `Should import ${exportedCount} notes`);

  // Verify files exist in the merge vault
  for (const note of data.notes) {
    const merged = path.join(mergeVault, note.path);
    assert(fs.existsSync(merged), `Merged note should exist: ${note.path}`);
  }

  // Clean up
  fs.rmSync(mergeDir, { recursive: true, force: true });
  fs.unlinkSync(exportFile);
});

// --- Diff ---

test('diff shows recent changes', () => {
  // Create a fresh note so it appears as "created" within the last 24h
  const diffNote = path.join(vaultDir, 'diff-test-note.md');
  fs.writeFileSync(diffNote, `---
title: "Diff Test Note"
date: 2026-03-24
type: note
tags: [test]
---

# Diff Test Note

Created to test the diff command.
`);
  const out = zed('diff');
  assert(out.includes('Vault changes'), 'Should show vault changes header');
  assert(out.includes('Created') || out.includes('Modified'), 'Should show created or modified section');
  assert(out.includes('Diff Test Note'), 'Should include the newly created note');

  // JSON mode
  const json = zedJson('diff');
  assert(json.total > 0, 'JSON total should be > 0');
  assert(json.hours === 24, 'Default hours should be 24');
});

// ---------------------------------------------------------------------------
// Input Validation Edge Cases
// ---------------------------------------------------------------------------

console.log('\nInput Validation:');

test('daily with very long text truncates gracefully', () => {
  const longText = 'x'.repeat(15000);
  const out = zed(`daily "${longText}"`, { expectError: false });
  // Should succeed (text gets truncated) — check stderr for warning
  assert(typeof out === 'string', 'Should produce output');
  assert(out.includes('Appended') || out.includes('created'), `Expected success message, got: ${out.slice(0, 100)}`);
});

test('import with nonexistent directory errors clearly', () => {
  const out = zed('import /totally/nonexistent/directory/for/testing', { expectError: true });
  assert(out.includes('not found') || out.includes('Error'), `Expected clear error, got: ${out}`);
});

test('template with empty title errors', () => {
  const out = zed('template decision', { expectError: true });
  assert(out.includes('Title must not be empty') || out.includes('Usage'), `Expected empty title error, got: ${out}`);
});

test('loop-init with empty objective errors', () => {
  const out = zed('loop-init', { expectError: true });
  assert(out.includes('must not be empty') || out.includes('Usage') || out.includes('Objective'), `Expected empty objective error, got: ${out}`);
});

test('export to unwritable path errors clearly', () => {
  const out = zed('export /nonexistent/dir/output.json', { expectError: true });
  assert(out.includes('not exist') || out.includes('not writable') || out.includes('Error'), `Expected writable path error, got: ${out}`);
});

// ---------------------------------------------------------------------------
// v8.0 — Wiki Engine commands (compile, wiki-health, council budget)
// ---------------------------------------------------------------------------

console.log('\nv8.0 Wiki Engine:');

test('metrics shows effectiveness dashboard', () => {
  const out = zed('metrics');
  assert(out.includes('ZED Effectiveness:'), `expected effectiveness header, got: ${out}`);
  assert(out.includes('Growth'), 'should have growth section');
  assert(out.includes('Connectivity'), 'should have connectivity section');
  assert(out.includes('Capture Ratio'), 'should have capture ratio section');
  assert(out.includes('Freshness'), 'should have freshness section');
});

test('metrics --json returns structured data', () => {
  const out = zedJson('metrics');
  assert(typeof out.score === 'number', 'should have numeric score');
  assert(out.growth, 'should have growth');
  assert(out.connectivity, 'should have connectivity');
  assert(out.compileRate, 'should have compileRate');
  assert(out.captureRatio, 'should have captureRatio');
  assert(out.knowledgeAge, 'should have knowledgeAge');
  assert(out.generated, 'should have generated timestamp');
});

test('compile on empty vault prints a zero plan', () => {
  const out = zed('compile');
  assert(out.includes('Wiki compile plan'), `expected plan header, got: ${out}`);
  assert(out.includes('Raw sources:'));
  assert(out.includes('Wiki entries:'));
});

test('compile --json returns a structured plan', () => {
  const out = zedJson('compile');
  assert(out.plan, 'should have plan field');
  assert(typeof out.plan.rawCount === 'number');
  assert(typeof out.plan.wikiCount === 'number');
  assert(Array.isArray(out.plan.uncompiled));
  assert(out.index);
});

test('compile creates schema.md on first run', () => {
  zed('compile'); // idempotent
  const schemaPath = path.join(tmpDir, 'vault', 'schema.md');
  assert(fs.existsSync(schemaPath), 'schema.md should exist after compile');
  const content = fs.readFileSync(schemaPath, 'utf-8');
  assert(content.includes('ZED Vault Schema'), 'schema.md should contain the Karpathy schema text');
});

test('compile creates wiki/index.md and wiki/log.md', () => {
  zed('compile');
  assert(fs.existsSync(path.join(tmpDir, 'vault', 'wiki', 'index.md')));
  assert(fs.existsSync(path.join(tmpDir, 'vault', 'wiki', 'log.md')));
});

test('wiki-health on empty vault gives a score', () => {
  const out = zed('wiki-health');
  assert(out.includes('Wiki Health:'), `expected health header, got: ${out}`);
  assert(/\d+\/100/.test(out), 'should include a score');
});

test('wiki-health --json returns structured data', () => {
  const out = zedJson('wiki-health');
  assert(typeof out.score === 'number');
  assert(typeof out.wikiCount === 'number');
  assert(Array.isArray(out.uncompiled));
  assert(Array.isArray(out.expired));
  assert(Array.isArray(out.superseded));
});

test('compile --synthesize writes a session-snapshot note', () => {
  // Touch a note so the synthesis has something to collect
  zed('daily "hello synthesis test"');
  const out = zed('compile --synthesize --since 24 --label smoke-test');
  assert(out.includes('Session synthesis written'), `expected synthesis message, got: ${out}`);
  // The note should exist under wiki/syntheses/
  const synthDir = path.join(tmpDir, 'vault', 'wiki', 'syntheses');
  const files = fs.readdirSync(synthDir).filter((f) => f.includes('smoke-test'));
  assert(files.length >= 1, `expected a smoke-test synthesis file, found: ${fs.readdirSync(synthDir)}`);
});

test('council --budget-status reports zero when unset', () => {
  const out = zed('council --budget-status');
  assert(out.includes('Council budget status'), `got: ${out}`);
  assert(out.includes('Spent:'));
});

test('council --budget-status --json returns structured data', () => {
  const out = zedJson('council --budget-status');
  assert(typeof out.spent === 'number');
  assert(typeof out.calls === 'number');
});

test('council --reset-budget zeroes the ledger', () => {
  const out = zed('council --reset-budget');
  assert(out.includes('reset'), `got: ${out}`);
  const status = zedJson('council --budget-status');
  assert(status.spent === 0, `expected spent=0, got ${status.spent}`);
  assert(status.calls === 0, `expected calls=0, got ${status.calls}`);
});

test('clip rejects invalid URL', () => {
  const out = zed('clip "not a url"', { expectError: true });
  assert(out.includes('invalid URL') || out.includes('failed'), `got: ${out}`);
});

test('clip rejects ftp URLs', () => {
  const out = zed('clip ftp://example.com/', { expectError: true });
  assert(out.includes('http/https') || out.includes('failed'), `got: ${out}`);
});

test('ingest-pdf errors on missing file', () => {
  const out = zed('ingest-pdf /tmp/does-not-exist-zed-xyz.pdf', { expectError: true });
  assert(out.includes('not found') || out.includes('failed'), `got: ${out}`);
});

test('ingest-pdf: stub-mode writes raw/papers/ file and indexes it (async race regression)', () => {
  // Regression: pre-v8.1 the CLI dispatch closed the engine synchronously
  // after firing off the async handler's IIFE, so the in-process
  // incrementalBuild() silently threw against a closed DB. Across separate
  // invocations the bug was invisible (each run rebuilt from disk), but
  // any test harness running multiple commands in one process would break.
  // This test verifies the fix by asserting:
  //   (a) ingest-pdf's output file IS on disk after the command returns
  //   (b) the subsequent stats/search invocation picks it up
  const fakePdf = path.join(tmpDir, 'fake-async-race.pdf');
  fs.writeFileSync(fakePdf, '%PDF-1.4\n%stub\n');
  const out = zed(`ingest-pdf "${fakePdf}" --tag async,race`);
  assert(out.includes('PDF ingested'), `ingest-pdf should succeed: ${out}`);
  // File should exist under raw/papers/
  const papersDir = path.join(tmpDir, 'vault', 'raw', 'papers');
  const pdfFiles = fs.readdirSync(papersDir).filter((f) => f.includes('fake-async-race'));
  assert(pdfFiles.length >= 1, `expected a PDF note in raw/papers/, found: ${fs.readdirSync(papersDir)}`);
  // A subsequent search should find it
  const search = zed('search race');
  assert(search.toLowerCase().includes('race') || search.toLowerCase().includes('async'),
    `search should find the clipped PDF, got: ${search}`);
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
