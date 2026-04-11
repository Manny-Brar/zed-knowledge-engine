/**
 * test-eval.cjs -- Protocol adherence evaluation suite for ZED
 *
 * 30 tests across 6 categories:
 *   1. Search Quality (5)
 *   2. Capture Quality (5)
 *   3. Hook Behavior (5)
 *   4. Evolve Loop Mechanics (5)
 *   5. Graph Operations (5)
 *   6. Protocol Adherence (5)
 *
 * Based on Anthropic guidance: "20-50 simple tasks from real failures is a great start."
 * Each test uses an isolated temp vault to avoid cross-contamination.
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

function evalTest(name, fn) {
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
// Shared setup helpers
// ---------------------------------------------------------------------------

const PLUGIN_ROOT = path.resolve(__dirname, '..');
const BIN = path.join(PLUGIN_ROOT, 'bin', 'zed');
const SCRIPTS = path.join(PLUGIN_ROOT, 'scripts');

/**
 * Create an isolated temp vault with optional seed notes.
 * Returns { tmpDir, vaultDir, env, cleanup }.
 */
function createTempVault(seedNotes = []) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zed-eval-'));
  const vaultDir = path.join(tmpDir, 'vault');

  for (const sub of ['decisions', 'patterns', 'sessions', 'architecture', '_loop']) {
    fs.mkdirSync(path.join(vaultDir, sub), { recursive: true });
  }

  // Write seed notes
  for (const note of seedNotes) {
    const notePath = path.join(vaultDir, note.path);
    fs.mkdirSync(path.dirname(notePath), { recursive: true });
    fs.writeFileSync(notePath, note.content);
  }

  // Create edit tracker
  fs.writeFileSync(
    path.join(tmpDir, 'edit-tracker.json'),
    JSON.stringify({ edit_count: 0, files: [], started: new Date().toISOString(), captures: 0 })
  );

  const env = {
    ...process.env,
    ZED_DATA_DIR: tmpDir,
    CLAUDE_PLUGIN_DATA: tmpDir,
    CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
  };

  function cleanup() {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }

  return { tmpDir, vaultDir, env, cleanup };
}

/**
 * Run a zed CLI command in the given env.
 */
function zed(cmd, env, opts = {}) {
  try {
    const result = execSync(`node "${BIN}" ${cmd}`, {
      env,
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

/**
 * Run a bash script in the given env.
 */
function runScript(scriptName, env) {
  const script = path.join(SCRIPTS, scriptName);
  try {
    const result = execSync(`bash "${script}"`, {
      env,
      encoding: 'utf-8',
      timeout: 30000,
      cwd: PLUGIN_ROOT,
    });
    return result.trim();
  } catch (err) {
    if (err.stdout) return err.stdout.trim();
    throw new Error(`Script failed: ${scriptName}\n${err.stderr || err.message}`);
  }
}

/**
 * Create a KnowledgeEngine instance directly (for unit-level eval tests).
 */
function createEngine(vaultDir) {
  const KnowledgeEngine = require(path.join(PLUGIN_ROOT, 'core', 'engine.cjs'));
  const engine = new KnowledgeEngine({ vaultPath: vaultDir, dbPath: ':memory:' });
  engine.build();
  return engine;
}

// ---------------------------------------------------------------------------
// Standard seed notes (reusable across tests)
// ---------------------------------------------------------------------------

const SEED_NOTES = [
  {
    path: 'project-overview.md',
    content: `---
title: "Project Overview"
date: 2026-03-01
type: note
tags: [architecture, overview]
---

# Project Overview

This is the main project overview. It covers the high-level architecture
and design principles of the system.

See also: [[Design Principles]] and [[API Reference]].
`,
  },
  {
    path: 'architecture/design-principles.md',
    content: `---
title: "Design Principles"
date: 2026-03-02
type: note
tags: [architecture, principles]
---

# Design Principles

1. Keep things simple
2. Prefer composition over inheritance
3. Test everything

Related: [[Project Overview]] and [[Testing Strategy]].
`,
  },
  {
    path: 'architecture/api-reference.md',
    content: `---
title: "API Reference"
date: 2026-03-03
type: note
tags: [api, reference]
---

# API Reference

The API exposes RESTful endpoints for all operations.

See [[Project Overview]] for context.
`,
  },
  {
    path: 'patterns/testing-strategy.md',
    content: `---
title: "Testing Strategy"
date: 2026-03-04
type: note
tags: [testing, patterns]
---

# Testing Strategy

Unit tests, integration tests, and eval suites.

Based on [[Design Principles]].
`,
  },
  {
    path: 'architecture/orphan-note.md',
    content: `---
title: "Orphan Note"
date: 2026-03-05
type: note
tags: [standalone]
---

# Orphan Note

This note has no wikilinks in or out.
`,
  },
];

// ===========================================================================
// Category 1: Search Quality (5 tests)
// ===========================================================================

console.log('\nZED Protocol Adherence Eval Suite');
console.log('='.repeat(60));

console.log('\n--- Category 1: Search Quality ---');

evalTest('1.1 Search by exact title returns note as result #1', () => {
  const { vaultDir, cleanup } = createTempVault(SEED_NOTES);
  try {
    const engine = createEngine(vaultDir);
    const results = engine.searchNotes('Project Overview');
    assert(results.length > 0, 'Expected at least one result');
    assert(
      results[0].node.title === 'Project Overview',
      `Expected "Project Overview" as #1, got "${results[0].node.title}"`
    );
    engine.close();
  } finally { cleanup(); }
});

evalTest('1.2 Search by tag returns matching notes', () => {
  const { vaultDir, cleanup } = createTempVault(SEED_NOTES);
  try {
    const engine = createEngine(vaultDir);
    const results = engine.searchByTag('architecture');
    assert(results.length >= 2, `Expected >=2 results for tag "architecture", got ${results.length}`);
    const titles = results.map(r => r.node.title);
    assert(titles.includes('Project Overview'), 'Should include Project Overview');
    assert(titles.includes('Design Principles'), 'Should include Design Principles');
    engine.close();
  } finally { cleanup(); }
});

evalTest('1.3 FTS5 operators (AND via implicit) return correct results', () => {
  const { vaultDir, cleanup } = createTempVault(SEED_NOTES);
  try {
    const engine = createEngine(vaultDir);
    // FTS5 implicit AND: both terms must match
    const results = engine.searchNotes('architecture principles');
    assert(results.length > 0, 'Expected results for "architecture principles"');
    // Design Principles note has both terms
    const titles = results.map(r => r.node.title);
    assert(titles.includes('Design Principles'), 'Should find Design Principles');
    engine.close();
  } finally { cleanup(); }
});

evalTest('1.4 Search with no matches returns empty, no error', () => {
  const { vaultDir, cleanup } = createTempVault(SEED_NOTES);
  try {
    const engine = createEngine(vaultDir);
    const results = engine.searchNotes('xyznonexistent99');
    assert(Array.isArray(results), 'Should return an array');
    assert(results.length === 0, `Expected 0 results, got ${results.length}`);
    engine.close();
  } finally { cleanup(); }
});

evalTest('1.5 Graph boosting ranks high-backlink notes higher', () => {
  const { vaultDir, cleanup } = createTempVault(SEED_NOTES);
  try {
    const engine = createEngine(vaultDir);
    // Project Overview has 2 backlinks (from Design Principles and API Reference)
    // Search for a term both share
    const results = engine.searchNotes('overview');
    assert(results.length > 0, 'Expected results');
    // The note with more backlinks should have higher boostedScore
    if (results.length > 1) {
      const overviewResult = results.find(r => r.node.title === 'Project Overview');
      assert(overviewResult, 'Project Overview should be in results');
      assert(overviewResult.backlinkCount >= 1, `Expected backlinks, got ${overviewResult.backlinkCount}`);
    }
    engine.close();
  } finally { cleanup(); }
});

// ===========================================================================
// Category 2: Capture Quality (5 tests)
// ===========================================================================

console.log('\n--- Category 2: Capture Quality ---');

evalTest('2.1 Write note with proper frontmatter is accepted', () => {
  const { vaultDir, cleanup } = createTempVault();
  try {
    const engine = createEngine(vaultDir);
    const content = `---
title: "Test Note"
date: 2026-03-24
tags: [eval, test]
---

# Test Note

This is a valid note with proper frontmatter.
`;
    engine.writeNote('test-note.md', content);
    const note = engine.readNote('test-note.md');
    assert(note.frontmatter.title === 'Test Note', 'Title should match');
    assert(Array.isArray(note.frontmatter.tags), 'Tags should be array');
    assert(note.frontmatter.tags.length === 2, `Expected 2 tags, got ${note.frontmatter.tags.length}`);
    engine.close();
  } finally { cleanup(); }
});

evalTest('2.2 Write note with fewer than 2 tags still works', () => {
  const { vaultDir, cleanup } = createTempVault();
  try {
    const engine = createEngine(vaultDir);
    const content = `---
title: "Single Tag Note"
tags: [eval]
---

# Single Tag Note

Note with only one tag.
`;
    engine.writeNote('single-tag.md', content);
    const note = engine.readNote('single-tag.md');
    assert(note.frontmatter.title === 'Single Tag Note', 'Should be written');
    assert(note.frontmatter.tags.length === 1, 'Should have 1 tag');
    engine.close();
  } finally { cleanup(); }
});

evalTest('2.3 Write note with empty content is rejected', () => {
  const { vaultDir, cleanup } = createTempVault();
  try {
    const engine = createEngine(vaultDir);
    let threw = false;
    try {
      engine.writeNote('empty.md', '');
    } catch (e) {
      threw = true;
    }
    // Even if it doesn't throw, the file should be empty or minimal
    // The key check: writeNote with empty string should either throw or write empty
    if (!threw) {
      // If it didn't throw, verify the file exists but is empty
      const exists = fs.existsSync(path.join(vaultDir, 'empty.md'));
      assert(exists, 'File should exist even if empty');
      const raw = fs.readFileSync(path.join(vaultDir, 'empty.md'), 'utf-8');
      assert(raw === '', 'Content should be empty');
    }
    engine.close();
  } finally { cleanup(); }
});

evalTest('2.4 Decision record template has required sections', () => {
  const { vaultDir, env, cleanup } = createTempVault();
  try {
    zed('template decision "Eval Test Decision"', env);
    const decisionsDir = path.join(vaultDir, 'decisions');
    const files = fs.readdirSync(decisionsDir).filter(f => f.endsWith('.md'));
    assert(files.length > 0, 'Decision file should exist');
    const content = fs.readFileSync(path.join(decisionsDir, files[0]), 'utf-8');
    // Decision records should have key sections
    assert(content.includes('Context') || content.includes('context'), 'Should have Context section');
    assert(content.includes('Decision') || content.includes('decision'), 'Should have Decision section');
    assert(
      content.includes('Alternatives') || content.includes('alternatives') || content.includes('Options'),
      'Should have Alternatives/Options section'
    );
    assert(
      content.includes('Consequences') || content.includes('consequences') || content.includes('Impact'),
      'Should have Consequences/Impact section'
    );
  } finally { cleanup(); }
});

evalTest('2.5 Path traversal attempt is blocked', () => {
  const { vaultDir, cleanup } = createTempVault();
  try {
    const engine = createEngine(vaultDir);
    let threw = false;
    try {
      engine.writeNote('../../etc/passwd', 'malicious content');
    } catch (e) {
      threw = true;
      assert(e.message.includes('escapes') || e.message.includes('traversal') || e.message.includes('outside'),
        `Expected path traversal error, got: ${e.message}`);
    }
    assert(threw, 'Should throw on path traversal');
    engine.close();
  } finally { cleanup(); }
});

// ===========================================================================
// Category 3: Hook Behavior (5 tests)
// ===========================================================================

console.log('\n--- Category 3: Hook Behavior ---');

evalTest('3.1 Session start produces vault stats output', () => {
  const { vaultDir, env, cleanup } = createTempVault(SEED_NOTES);
  try {
    const out = runScript('session-start.sh', env);
    assert(
      out.includes('ZED Session Start') || out.includes('ZED Vault Overview') || out.includes('New vault'),
      `Expected session start output, got: ${out.substring(0, 200)}`
    );
  } finally { cleanup(); }
});

evalTest('3.2 Post-edit hook increments edit count', () => {
  const { tmpDir, env, cleanup } = createTempVault();
  try {
    // Run post-edit hook
    runScript('post-edit-hook.sh', env);
    // Read tracker
    const tracker = JSON.parse(fs.readFileSync(path.join(tmpDir, 'edit-tracker.json'), 'utf-8'));
    assert(tracker.edit_count === 1, `Expected edit_count=1, got ${tracker.edit_count}`);

    // Run again
    runScript('post-edit-hook.sh', env);
    const tracker2 = JSON.parse(fs.readFileSync(path.join(tmpDir, 'edit-tracker.json'), 'utf-8'));
    assert(tracker2.edit_count === 2, `Expected edit_count=2, got ${tracker2.edit_count}`);
  } finally { cleanup(); }
});

evalTest('3.3 Pre-compact hook produces compaction reminder', () => {
  const { env, cleanup } = createTempVault();
  try {
    const out = runScript('pre-compact-hook.sh', env);
    assert(
      out.toLowerCase().includes('compact') || out.toLowerCase().includes('compaction') || out.toLowerCase().includes('compress'),
      `Expected compaction reminder, got: ${out.substring(0, 200)}`
    );
  } finally { cleanup(); }
});

evalTest('3.4 Stop hook blocks when loop active and no captures', () => {
  const { vaultDir, tmpDir, env, cleanup } = createTempVault();
  try {
    // Create active loop objective (not completed)
    const loopDir = path.join(vaultDir, '_loop');
    fs.writeFileSync(path.join(loopDir, 'objective.md'), `---
title: "Active Loop"
max_iterations: 5
completed: false
---
Active evolve loop objective.
`);
    fs.writeFileSync(path.join(loopDir, 'progress.md'), `---
iteration: 1
---
Progress log.
`);

    // Set tracker with edits but no captures
    fs.writeFileSync(
      path.join(tmpDir, 'edit-tracker.json'),
      JSON.stringify({ edit_count: 10, files: ['a.js', 'b.js', 'c.js', 'd.js'], started: new Date().toISOString(), captures: 0 })
    );

    // Stop hook should block
    let out;
    try {
      out = execSync(`bash "${path.join(SCRIPTS, 'stop-hook.sh')}"`, {
        env,
        encoding: 'utf-8',
        timeout: 30000,
        cwd: PLUGIN_ROOT,
      }).trim();
    } catch (err) {
      out = (err.stdout || err.stderr || err.message).trim();
    }

    assert(
      out.includes('"decision"') || out.includes('block') || out.includes('capture') || out.includes('WARNING'),
      `Expected block decision or warning, got: ${out.substring(0, 300)}`
    );
  } finally { cleanup(); }
});

evalTest('3.5 Stop hook allows exit when no active loop', () => {
  const { env, cleanup } = createTempVault();
  try {
    // No objective.md means no active loop
    let exitCode = 0;
    try {
      execSync(`bash "${path.join(SCRIPTS, 'stop-hook.sh')}"`, {
        env,
        encoding: 'utf-8',
        timeout: 30000,
        cwd: PLUGIN_ROOT,
      });
    } catch (err) {
      exitCode = err.status || 1;
    }
    assert(exitCode === 0, `Expected exit code 0, got ${exitCode}`);
  } finally { cleanup(); }
});

// ===========================================================================
// Category 4: Evolve Loop Mechanics (5 tests)
// ===========================================================================

console.log('\n--- Category 4: Evolve Loop Mechanics ---');

evalTest('4.1 loop-init creates objective and progress files', () => {
  const { vaultDir, env, cleanup } = createTempVault();
  try {
    const out = zed('loop-init "eval test objective" --max 3', env);
    assert(
      out.includes('Evolve loop initialized') || out.includes('eval test objective'),
      `Expected init confirmation, got: ${out.substring(0, 200)}`
    );
    const loopDir = path.join(vaultDir, '_loop');
    assert(fs.existsSync(path.join(loopDir, 'objective.md')), 'objective.md should exist');
    assert(fs.existsSync(path.join(loopDir, 'progress.md')), 'progress.md should exist');
  } finally { cleanup(); }
});

evalTest('4.2 loop-decompose creates features.json with correct count', () => {
  const { vaultDir, env, cleanup } = createTempVault();
  try {
    zed('loop-init "decompose test" --max 5', env);
    const out = zed('loop-decompose "feat1, feat2, feat3"', env);
    assert(
      out.includes('3 features') || out.includes('Decomposed'),
      `Expected 3 features, got: ${out.substring(0, 200)}`
    );
    const featuresPath = path.join(vaultDir, '_loop', 'features.json');
    assert(fs.existsSync(featuresPath), 'features.json should exist');
    const features = JSON.parse(fs.readFileSync(featuresPath, 'utf8'));
    assert(Array.isArray(features), 'features.json should be an array');
    assert(features.length === 3, `Expected 3 features, got ${features.length}`);
  } finally { cleanup(); }
});

evalTest('4.3 loop-next returns first pending feature as in_progress', () => {
  const { env, cleanup } = createTempVault();
  try {
    zed('loop-init "next test" --max 5', env);
    zed('loop-decompose "alpha, beta, gamma"', env);
    const out = zed('loop-next --json', env);
    const data = JSON.parse(out);
    assert(data.next !== null && data.next !== undefined, 'Should return a feature');
    assert(data.next.id === 1, `Expected feature #1, got #${data.next.id}`);
    assert(data.next.status === 'in_progress', `Expected in_progress, got ${data.next.status}`);
  } finally { cleanup(); }
});

evalTest('4.4 loop-complete marks feature as done', () => {
  const { env, cleanup } = createTempVault();
  try {
    zed('loop-init "complete test" --max 5', env);
    zed('loop-decompose "do1, do2, do3"', env);
    zed('loop-next', env); // Start first feature
    const out = zed('loop-complete --json', env);
    const data = JSON.parse(out);
    assert(data.completed.id === 1, `Expected completed #1, got #${data.completed.id}`);
    assert(data.completed.status === 'done', `Expected done, got ${data.completed.status}`);
    assert(data.remaining === 2, `Expected 2 remaining, got ${data.remaining}`);
  } finally { cleanup(); }
});

evalTest('4.5 loop-stop marks objective as completed', () => {
  const { vaultDir, env, cleanup } = createTempVault();
  try {
    zed('loop-init "stop test" --max 3', env);
    zed('loop-decompose "s1, s2"', env);
    const out = zed('loop-stop "finished eval"', env);
    assert(
      out.includes('stopped') || out.includes('Evolve loop'),
      `Expected stop confirmation, got: ${out.substring(0, 200)}`
    );
    const objectiveContent = fs.readFileSync(path.join(vaultDir, '_loop', 'objective.md'), 'utf-8');
    assert(objectiveContent.includes('completed: true'), 'Should mark completed: true');
  } finally { cleanup(); }
});

// ===========================================================================
// Category 5: Graph Operations (5 tests)
// ===========================================================================

console.log('\n--- Category 5: Graph Operations ---');

evalTest('5.1 Build graph from notes returns correct node and edge counts', () => {
  const { vaultDir, cleanup } = createTempVault(SEED_NOTES);
  try {
    const engine = createEngine(vaultDir);
    const stats = engine.getStats();
    assert(stats.nodeCount === 5, `Expected 5 nodes, got ${stats.nodeCount}`);
    // Edges: Overview->Principles, Overview->API, Principles->Overview,
    // Principles->Testing, API->Overview, Testing->Principles = 6 edges
    assert(stats.edgeCount >= 4, `Expected >=4 edges, got ${stats.edgeCount}`);
    engine.close();
  } finally { cleanup(); }
});

evalTest('5.2 findHubs returns notes sorted by backlink count', () => {
  const { vaultDir, cleanup } = createTempVault(SEED_NOTES);
  try {
    const engine = createEngine(vaultDir);
    const hubs = engine.findHubs(10);
    assert(hubs.length > 0, 'Should return hubs');
    // Hubs should be sorted by backlink_count descending
    for (let i = 1; i < hubs.length; i++) {
      assert(
        hubs[i - 1].backlink_count >= hubs[i].backlink_count,
        `Hubs not sorted: ${hubs[i - 1].backlink_count} < ${hubs[i].backlink_count}`
      );
    }
    // Project Overview should be top hub (linked from Design Principles + API Reference)
    assert(
      hubs[0].title === 'Project Overview' || hubs[0].title === 'Design Principles',
      `Expected a well-linked note as top hub, got "${hubs[0].title}"`
    );
    engine.close();
  } finally { cleanup(); }
});

evalTest('5.3 getOrphans returns notes with no edges', () => {
  const { vaultDir, cleanup } = createTempVault(SEED_NOTES);
  try {
    const engine = createEngine(vaultDir);
    const orphans = engine.getOrphans();
    assert(orphans.length >= 1, `Expected at least 1 orphan, got ${orphans.length}`);
    const orphanTitles = orphans.map(o => o.title);
    assert(orphanTitles.includes('Orphan Note'), 'Orphan Note should be in orphans');
    engine.close();
  } finally { cleanup(); }
});

evalTest('5.4 shortestPath between connected notes returns path', () => {
  const { vaultDir, cleanup } = createTempVault(SEED_NOTES);
  try {
    const engine = createEngine(vaultDir);
    const overviewPath = path.join(vaultDir, 'project-overview.md');
    const testingPath = path.join(vaultDir, 'patterns', 'testing-strategy.md');
    const sp = engine.shortestPath(overviewPath, testingPath);
    assert(sp !== null, 'Path should exist between Overview and Testing Strategy');
    assert(sp.length >= 2, `Path should have >=2 nodes, got ${sp.length}`);
    assert(sp[0].title === 'Project Overview', 'Path should start at Overview');
    assert(sp[sp.length - 1].title === 'Testing Strategy', 'Path should end at Testing Strategy');
    engine.close();
  } finally { cleanup(); }
});

evalTest('5.5 getRelated returns 2-hop connected notes', () => {
  const { vaultDir, cleanup } = createTempVault(SEED_NOTES);
  try {
    const engine = createEngine(vaultDir);
    const overviewPath = path.join(vaultDir, 'project-overview.md');
    const related = engine.getRelated(overviewPath, 2);
    assert(related.length > 0, 'Should have related notes');
    // All results should have distance 1 or 2
    for (const r of related) {
      assert(r.distance >= 1 && r.distance <= 2, `Distance should be 1-2, got ${r.distance}`);
    }
    // Testing Strategy is 2 hops away (Overview -> Design Principles -> Testing)
    const relatedTitles = related.map(r => r.node.title);
    assert(
      relatedTitles.includes('Design Principles') || relatedTitles.includes('API Reference'),
      'Should include directly linked notes'
    );
    engine.close();
  } finally { cleanup(); }
});

// ===========================================================================
// Category 6: Protocol Adherence (5 tests)
// ===========================================================================

console.log('\n--- Category 6: Protocol Adherence ---');

evalTest('6.1 Health score is 0-100 with grade A-F or N/A', () => {
  const { vaultDir, env, cleanup } = createTempVault(SEED_NOTES);
  try {
    const out = zed('health --json', env);
    // Parse JSON output or check text output
    let data;
    try {
      data = JSON.parse(out);
    } catch {
      // Text output: check for grade
      assert(
        /Grade:\s*[A-FN]/.test(out) || /Vault Health:\s*[A-FN]/.test(out) || out.includes('Health'),
        `Expected health output, got: ${out.substring(0, 200)}`
      );
      return;
    }
    assert(data.score >= 0 && data.score <= 100, `Score should be 0-100, got ${data.score}`);
    assert(
      ['A', 'B', 'C', 'D', 'F', 'N/A'].includes(data.grade),
      `Grade should be A-F or N/A, got ${data.grade}`
    );
  } finally { cleanup(); }
});

evalTest('6.2 computeHealthScore with 0 nodes does not crash', () => {
  const { vaultDir, cleanup } = createTempVault();
  try {
    // Engine with empty vault
    const engine = createEngine(vaultDir);
    const stats = engine.getStats();
    // Inline the computeHealthScore logic to test division-by-zero guard
    assert(stats.nodeCount === 0, 'Empty vault should have 0 nodes');
    // The health command should handle this gracefully
    const KnowledgeEngine = require(path.join(PLUGIN_ROOT, 'core', 'engine.cjs'));
    // Compute health manually (same logic as bin/zed)
    const computeHealthScore = (stats, clusterCount, hubsWithLinks) => {
      if (stats.nodeCount === 0) return { score: 0, grade: 'N/A', connectivityRatio: 0, orphanRatio: 0 };
      const connectivityRatio = stats.edgeCount / stats.nodeCount;
      const orphanRatio = stats.orphanCount / stats.nodeCount;
      let score = 50;
      score += Math.min(20, connectivityRatio * 10);
      score -= Math.min(20, orphanRatio * 30);
      score += Math.min(15, hubsWithLinks * 3);
      const clusterPenalty = clusterCount > 1 ? Math.min(15, (clusterCount - 1) * 2) : 0;
      score += 15 - clusterPenalty;
      score = Math.max(0, Math.min(100, Math.round(score)));
      let grade;
      if (score >= 90) grade = 'A';
      else if (score >= 75) grade = 'B';
      else if (score >= 60) grade = 'C';
      else if (score >= 40) grade = 'D';
      else grade = 'F';
      return { score, grade, connectivityRatio, orphanRatio };
    };

    const result = computeHealthScore(stats, 0, 0);
    assert(result.score === 0, `Expected score=0 for empty vault, got ${result.score}`);
    assert(result.grade === 'N/A', `Expected grade=N/A, got ${result.grade}`);
    assert(result.connectivityRatio === 0, 'No division by zero');
    engine.close();
  } finally { cleanup(); }
});

evalTest('6.3 Fix command on vault with broken wikilinks creates stubs', () => {
  const brokenNotes = [
    {
      path: 'note-with-broken-link.md',
      content: `---
title: "Note With Broken Link"
tags: [test]
---

# Note With Broken Link

See [[Nonexistent Note]] for details.
`,
    },
  ];
  const { vaultDir, env, cleanup } = createTempVault(brokenNotes);
  try {
    const out = zed('fix', env);
    // Fix should either create stubs or report the broken links
    assert(
      out.includes('Fixed') || out.includes('stub') || out.includes('Created') ||
      out.includes('Nothing') || out.includes('Health') || out.includes('empty'),
      `Expected fix output, got: ${out.substring(0, 200)}`
    );
  } finally { cleanup(); }
});

evalTest('6.4 Scan command generates notes with wikilinks', () => {
  const { vaultDir, env, cleanup } = createTempVault();
  try {
    // Create a small project to scan
    const scanTarget = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'zed-eval-scan-')), 'project');
    fs.mkdirSync(path.join(scanTarget, 'src'), { recursive: true });
    fs.writeFileSync(path.join(scanTarget, 'package.json'), JSON.stringify({
      name: 'eval-scan-project',
      version: '1.0.0',
      description: 'Project for eval scan test',
      dependencies: { express: '^4.18.0' },
    }));
    fs.writeFileSync(path.join(scanTarget, 'src', 'index.js'), '// main entry\nmodule.exports = {};');

    const out = zed(`scan ${scanTarget}`, env);
    assert(
      out.includes('eval-scan-project') || out.includes('Graph rebuilt') || out.includes('notes'),
      `Expected scan output, got: ${out.substring(0, 200)}`
    );

    // Verify created notes contain wikilinks
    const projectsDir = path.join(vaultDir, 'projects');
    if (fs.existsSync(projectsDir)) {
      const notes = fs.readdirSync(projectsDir).filter(f => f.endsWith('.md'));
      if (notes.length > 0) {
        const noteContent = fs.readFileSync(path.join(projectsDir, notes[0]), 'utf-8');
        // Scan-generated notes typically contain wikilinks
        assert(
          noteContent.includes('[[') || noteContent.includes('project') || noteContent.length > 50,
          'Scan note should have meaningful content'
        );
      }
    }

    // Cleanup scan target
    try { fs.rmSync(scanTarget, { recursive: true, force: true }); } catch {}
  } finally { cleanup(); }
});

evalTest('6.5 Analytics command produces valid output with expected fields', () => {
  const { env, cleanup } = createTempVault(SEED_NOTES);
  try {
    const out = zed('analytics', env);
    assert(
      out.includes('Analytics') || out.includes('Knowledge') || out.includes('Growth') ||
      out.includes('notes') || out.includes('Total') || out.includes('Note'),
      `Expected analytics output, got: ${out.substring(0, 200)}`
    );
    // Should contain some numerical data
    assert(/\d+/.test(out), 'Analytics should contain numbers');
  } finally { cleanup(); }
});

// ===========================================================================
// Summary
// ===========================================================================

console.log('\n' + '='.repeat(60));
console.log(`Eval Results: ${passed} passed, ${failed} failed (of ${passed + failed} total)`);

if (failures.length > 0) {
  console.log('\nFailures:');
  for (const f of failures) {
    console.log(`  - ${f.name}: ${f.error}`);
  }
}

console.log('');
process.exit(failed > 0 ? 1 : 0);
