/**
 * test-e2e.cjs — End-to-end integration test for the full ZED lifecycle
 *
 * Simulates 18 steps of a complete ZED session in an isolated temp vault:
 *   session start -> search (empty) -> scan -> search (populated) ->
 *   template decision -> snippets -> health -> analytics ->
 *   loop-init -> loop-decompose -> loop-next -> loop-complete ->
 *   loop-tick -> loop-stop -> backup -> fix -> session end -> stop hook
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
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    failed++;
    failures.push({ name, error: err.message });
    console.log(`  [FAIL] ${name}: ${err.message}`);
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

// ---------------------------------------------------------------------------
// Setup: isolated temp environment
// ---------------------------------------------------------------------------

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zed-e2e-test-'));
const vaultDir = path.join(tmpDir, 'vault');
const PLUGIN_ROOT = path.resolve(__dirname, '..');
const BIN = path.join(PLUGIN_ROOT, 'bin', 'zed');
const SCRIPTS = path.join(PLUGIN_ROOT, 'scripts');

// Create minimal vault structure (bin/zed auto-creates dirs, but hooks may need them)
for (const sub of ['decisions', 'patterns', 'sessions', 'architecture', '_loop']) {
  fs.mkdirSync(path.join(vaultDir, sub), { recursive: true });
}

// Create edit tracker (session-start.sh resets it, but we need it for hooks)
fs.writeFileSync(
  path.join(tmpDir, 'edit-tracker.json'),
  JSON.stringify({ edit_count: 0, files: [], started: new Date().toISOString(), captures: 0 })
);

// ---------------------------------------------------------------------------
// Runners
// ---------------------------------------------------------------------------

const baseEnv = {
  ...process.env,
  ZED_DATA_DIR: tmpDir,
  CLAUDE_PLUGIN_DATA: tmpDir,
  CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
};

function zed(cmd, opts = {}) {
  try {
    const result = execSync(`node ${BIN} ${cmd}`, {
      env: baseEnv,
      encoding: 'utf-8',
      timeout: 30000,
      cwd: PLUGIN_ROOT,
    });
    return result.trim();
  } catch (err) {
    if (opts.expectError) return (err.stderr || err.stdout || err.message).trim();
    throw new Error(`CLI failed: zed ${cmd}\n${err.stderr || err.stdout || err.message}`);
  }
}

function runScript(scriptName, extraEnv = {}) {
  const script = path.join(SCRIPTS, scriptName);
  try {
    const result = execSync(`bash "${script}"`, {
      env: { ...baseEnv, ...extraEnv },
      encoding: 'utf-8',
      timeout: 30000,
      cwd: PLUGIN_ROOT,
    });
    return result.trim();
  } catch (err) {
    throw new Error(`Script failed: ${scriptName}\n${err.stderr || err.stdout || err.message}`);
  }
}

// ---------------------------------------------------------------------------
// E2E Lifecycle Tests (18 steps)
// ---------------------------------------------------------------------------

console.log('\nZED End-to-End Lifecycle Test');
console.log('='.repeat(50));
console.log(`Temp vault: ${tmpDir}\n`);

// ---- Step 1: Session Start ----
console.log('Phase 1: Session Start');
test('1. session-start.sh runs and outputs vault info', () => {
  const out = runScript('session-start.sh');
  // Should contain the ZED session marker or vault overview
  assert(
    out.includes('ZED Session Start') || out.includes('ZED Vault Overview') || out.includes('New vault detected'),
    `Expected session start output, got: ${out.substring(0, 200)}`
  );
});

// ---- Step 2: Search empty vault ----
console.log('\nPhase 2: Search Empty Vault');
test('2. snippets on empty vault returns no results', () => {
  const out = zed('snippets "test"');
  assert(
    out.includes('No results') || out.includes('0 results') || out.includes('No matching'),
    `Expected no results, got: ${out.substring(0, 200)}`
  );
});

// ---- Step 3: Scan a project ----
console.log('\nPhase 3: Scan Project');
test('3. scan ZED source dir creates architecture notes', () => {
  // Create a test project to scan (avoid scanning the full ZED repo which is large)
  const scanTarget = path.join(tmpDir, 'test-project');
  fs.mkdirSync(path.join(scanTarget, 'src'), { recursive: true });
  fs.mkdirSync(path.join(scanTarget, 'lib'), { recursive: true });
  fs.writeFileSync(path.join(scanTarget, 'package.json'), JSON.stringify({
    name: 'e2e-test-project',
    version: '1.0.0',
    description: 'End-to-end test project for architecture scanning',
    dependencies: { express: '^4.18.0', lodash: '^4.17.21' },
    devDependencies: { jest: '^29.0.0' },
  }));
  fs.writeFileSync(path.join(scanTarget, 'src', 'index.js'), '// main entry\nconst express = require("express");\n');
  fs.writeFileSync(path.join(scanTarget, 'lib', 'utils.js'), '// utility functions\nmodule.exports = {};\n');
  fs.writeFileSync(path.join(scanTarget, 'README.md'), '# E2E Test Project\nArchitecture test project.\n');

  const out = zed(`scan ${scanTarget}`);
  assert(out.includes('e2e-test-project'), `Expected project name in output, got: ${out.substring(0, 200)}`);
  assert(out.includes('Graph rebuilt') || out.includes('notes'), `Expected graph info, got: ${out.substring(0, 200)}`);

  // Verify at least one note was created
  const projectsDir = path.join(vaultDir, 'projects');
  assert(fs.existsSync(projectsDir), 'projects dir should exist after scan');
  const notes = fs.readdirSync(projectsDir).filter(f => f.endsWith('.md'));
  assert(notes.length > 0, `Expected notes created, got ${notes.length}`);
});

// ---- Step 4: Search after scan ----
console.log('\nPhase 4: Search After Scan');
test('4. snippets after scan finds results', () => {
  const out = zed('snippets "architecture"');
  // After scanning, there should be an architecture note
  assert(
    out.includes('architecture') || out.includes('Architecture') || out.includes('e2e-test-project'),
    `Expected search results for "architecture", got: ${out.substring(0, 200)}`
  );
  assert(
    !out.includes('No results') && !out.includes('0 results'),
    `Should not be empty results, got: ${out.substring(0, 200)}`
  );
});

// ---- Step 5: Write a decision ----
console.log('\nPhase 5: Write Decision');
test('5. template decision creates decision file', () => {
  const out = zed('template decision "Test Decision"');
  assert(
    out.includes('Created') || out.includes('decision') || out.includes('Test Decision') || out.includes('Template'),
    `Expected creation confirmation, got: ${out.substring(0, 200)}`
  );

  // Verify the file was created
  const decisionsDir = path.join(vaultDir, 'decisions');
  const files = fs.readdirSync(decisionsDir).filter(f => f.endsWith('.md'));
  assert(files.length > 0, 'Decision file should exist');
  // Read the decision to verify content
  const decisionContent = fs.readFileSync(path.join(decisionsDir, files[0]), 'utf-8');
  assert(
    decisionContent.includes('Test Decision') || decisionContent.includes('test-decision'),
    `Decision should contain title, got: ${decisionContent.substring(0, 200)}`
  );
});

// ---- Step 6: Read the decision ----
console.log('\nPhase 6: Read Decision via Snippets');
test('6. snippets finds the decision', () => {
  // Rebuild to pick up the new decision note
  zed('rebuild');
  const out = zed('snippets "Test Decision"');
  assert(
    out.includes('Test Decision') || out.includes('test-decision') || out.includes('decision'),
    `Expected decision in snippets, got: ${out.substring(0, 200)}`
  );
});

// ---- Step 7: Check health ----
console.log('\nPhase 7: Health Check');
test('7. health shows grade', () => {
  const out = zed('health');
  assert(/Vault Health: [A-FN]/.test(out) || out.includes('Health') || out.includes('Grade'),
    `Expected health grade, got: ${out.substring(0, 200)}`
  );
});

// ---- Step 8: Check analytics ----
console.log('\nPhase 8: Analytics');
test('8. analytics outputs tracking data', () => {
  const out = zed('analytics');
  assert(
    out.includes('Analytics') || out.includes('Knowledge') || out.includes('Growth') ||
    out.includes('notes') || out.includes('Total'),
    `Expected analytics output, got: ${out.substring(0, 200)}`
  );
});

// ---- Step 9: Start evolve loop ----
console.log('\nPhase 9: Evolve Loop - Init');
test('9. loop-init creates loop state files', () => {
  const out = zed('loop-init "test objective" --max 3');
  assert(
    out.includes('Evolve loop initialized') || out.includes('test objective'),
    `Expected init confirmation, got: ${out.substring(0, 200)}`
  );

  const loopDir = path.join(vaultDir, '_loop');
  assert(fs.existsSync(path.join(loopDir, 'objective.md')), 'objective.md should exist');
  assert(fs.existsSync(path.join(loopDir, 'progress.md')), 'progress.md should exist');
});

// ---- Step 10: Decompose ----
console.log('\nPhase 10: Evolve Loop - Decompose');
test('10. loop-decompose creates features.json', () => {
  const out = zed('loop-decompose "task1, task2, task3"');
  assert(
    out.includes('Decomposed into 3 features') || out.includes('3 features'),
    `Expected 3 features, got: ${out.substring(0, 200)}`
  );

  const featuresPath = path.join(vaultDir, '_loop', 'features.json');
  assert(fs.existsSync(featuresPath), 'features.json should exist');
  const features = JSON.parse(fs.readFileSync(featuresPath, 'utf8'));
  assert(features.length === 3, `Expected 3 features, got ${features.length}`);
  assert(features[0].status === 'pending', `Expected pending, got ${features[0].status}`);
});

// ---- Step 11: Get next feature ----
console.log('\nPhase 11: Evolve Loop - Next');
test('11. loop-next returns first pending feature', () => {
  const out = zed('loop-next --json');
  const data = JSON.parse(out);
  assert(data.next !== null, 'Should return a feature');
  assert(data.next.id === 1, `Expected feature #1, got #${data.next.id}`);
  assert(data.next.status === 'in_progress', `Expected in_progress, got ${data.next.status}`);
});

// ---- Step 12: Complete feature ----
console.log('\nPhase 12: Evolve Loop - Complete');
test('12. loop-complete marks feature as done', () => {
  const out = zed('loop-complete --json');
  const data = JSON.parse(out);
  assert(data.completed.id === 1, `Expected completed feature #1, got #${data.completed.id}`);
  assert(data.completed.status === 'done', `Expected done, got ${data.completed.status}`);
  assert(data.remaining === 2, `Expected 2 remaining, got ${data.remaining}`);
});

// ---- Step 13: Tick iteration ----
console.log('\nPhase 13: Evolve Loop - Tick');
test('13. loop-tick advances iteration', () => {
  const out = zed('loop-tick "did some work"');
  assert(
    out.includes('Iteration') || out.includes('iteration'),
    `Expected iteration info, got: ${out.substring(0, 200)}`
  );
});

// ---- Step 14: Stop loop ----
console.log('\nPhase 14: Evolve Loop - Stop');
test('14. loop-stop completes the loop', () => {
  const out = zed('loop-stop "test done"');
  assert(
    out.includes('Evolve loop stopped') || out.includes('stopped'),
    `Expected stop confirmation, got: ${out.substring(0, 200)}`
  );

  const objectiveContent = fs.readFileSync(path.join(vaultDir, '_loop', 'objective.md'), 'utf-8');
  assert(objectiveContent.includes('completed: true'), 'Should mark completed');
});

// ---- Step 15: Backup vault ----
console.log('\nPhase 15: Backup');
test('15. backup creates tar.gz archive', () => {
  const backupDir = path.join(tmpDir, 'backup-output');
  fs.mkdirSync(backupDir, { recursive: true });
  const out = zed(`backup ${backupDir}`);
  assert(out.includes('Backup created') || out.includes('.tar.gz'),
    `Expected backup confirmation, got: ${out.substring(0, 200)}`
  );

  const files = fs.readdirSync(backupDir);
  const backups = files.filter(f => f.endsWith('.tar.gz'));
  assert(backups.length === 1, `Expected 1 backup archive, got ${backups.length}`);
});

// ---- Step 16: Fix issues ----
console.log('\nPhase 16: Fix');
test('16. fix runs without error', () => {
  const out = zed('fix');
  // fix should succeed (may fix issues or report nothing to fix)
  assert(
    out.includes('Fixed') || out.includes('Nothing') || out.includes('empty') || out.includes('Health'),
    `Expected fix output, got: ${out.substring(0, 200)}`
  );
});

// ---- Step 17: Session End ----
console.log('\nPhase 17: Session End');
test('17. session-end.sh creates daily note with summary', () => {
  // Reset edit tracker with some activity to trigger summary
  fs.writeFileSync(
    path.join(tmpDir, 'edit-tracker.json'),
    JSON.stringify({ edit_count: 5, files: ['a.js', 'b.js'], started: new Date().toISOString(), captures: 2 })
  );

  const out = runScript('session-end.sh');
  assert(
    out.includes('Session Summary') || out.includes('Edits') || out.includes('Capture'),
    `Expected session summary, got: ${out.substring(0, 200)}`
  );

  // Verify daily note was created (use local date, matching how session-end.sh calls `date +%Y-%m-%d`)
  const today = execSync('date +%Y-%m-%d', { encoding: 'utf-8' }).trim();
  const dailyNote = path.join(vaultDir, 'sessions', `${today}.md`);
  assert(fs.existsSync(dailyNote), `Daily note should exist at ${dailyNote}`);
  const dailyContent = fs.readFileSync(dailyNote, 'utf-8');
  assert(dailyContent.includes('Session'), 'Daily note should contain session info');
});

// ---- Step 18: Stop Hook (no active loop) ----
console.log('\nPhase 18: Stop Hook');
test('18. stop-hook.sh allows exit when no active loop', () => {
  // The loop was already stopped in step 14, so stop-hook should allow exit
  // Reset edit tracker so no gates fire
  fs.writeFileSync(
    path.join(tmpDir, 'edit-tracker.json'),
    JSON.stringify({ edit_count: 0, files: [], started: new Date().toISOString(), captures: 0 })
  );

  // stop-hook should exit cleanly (exit code 0) and not output a block decision
  let out;
  try {
    out = execSync(`bash "${path.join(SCRIPTS, 'stop-hook.sh')}"`, {
      env: baseEnv,
      encoding: 'utf-8',
      timeout: 30000,
      cwd: PLUGIN_ROOT,
    }).trim();
  } catch (err) {
    throw new Error(`stop-hook.sh failed: ${err.stderr || err.message}`);
  }

  // Should NOT contain a block decision
  assert(
    !out.includes('"decision": "block"'),
    `Stop hook should allow exit, but got block: ${out.substring(0, 200)}`
  );
});

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

try {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log(`\nCleaned up temp dir: ${tmpDir}`);
} catch {
  console.log(`\nWarning: Could not clean up ${tmpDir}`);
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log('\n' + '='.repeat(50));
console.log(`E2E Results: ${passed} passed, ${failed} failed (of ${passed + failed} total)`);

if (failures.length > 0) {
  console.log('\nFailures:');
  for (const f of failures) {
    console.log(`  - ${f.name}: ${f.error}`);
  }
}

console.log('');
process.exit(failed > 0 ? 1 : 0);
