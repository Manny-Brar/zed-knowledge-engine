/**
 * test-metrics.cjs — ZED v8.1 effectiveness metrics test suite
 *
 * Tests all metric computations against a synthetic vault with known
 * characteristics. No network, no LLM — pure deterministic assertions.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const metrics = require('./metrics.cjs');
const fileLayer = require('./file-layer.cjs');
const KnowledgeEngine = require('./engine.cjs');

const TEST_VAULT = path.join(__dirname, '.test-vault-metrics');
const TEST_DB = path.join(__dirname, '.test-metrics.db');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.log(`  ✗ ${name}`);
    console.log(`    ${err.message}`);
    if (process.env.ZED_TEST_STACK) console.log(err.stack);
  }
}

function setupVault() {
  fs.rmSync(TEST_VAULT, { recursive: true, force: true });
  try { fs.unlinkSync(TEST_DB); } catch {}
  const dirs = [
    'decisions', 'patterns', 'sessions', 'architecture',
    'raw/clips', 'raw/papers', 'raw/repos', 'raw/transcripts',
    'wiki/concepts', 'wiki/entities', 'wiki/syntheses',
    '_loop', '_templates',
  ];
  for (const d of dirs) fs.mkdirSync(path.join(TEST_VAULT, d), { recursive: true });
}

function teardownVault() {
  fs.rmSync(TEST_VAULT, { recursive: true, force: true });
  try { fs.unlinkSync(TEST_DB); } catch {}
  try { fs.unlinkSync(TEST_DB + '-wal'); } catch {}
  try { fs.unlinkSync(TEST_DB + '-shm'); } catch {}
}

function writeNote(relPath, fm, body) {
  const full = path.join(TEST_VAULT, relPath);
  const fmLines = ['---'];
  for (const [k, v] of Object.entries(fm)) {
    if (Array.isArray(v)) fmLines.push(`${k}: [${v.map((x) => `"${x}"`).join(', ')}]`);
    else fmLines.push(`${k}: "${v}"`);
  }
  fmLines.push('---', '', body || '');
  fileLayer.writeNote(full, fmLines.join('\n'));
}

function buildEngine() {
  const engine = new KnowledgeEngine({ vaultPath: TEST_VAULT, dbPath: TEST_DB });
  engine.build();
  return engine;
}

// ---------------------------------------------------------------------------
// Growth
// ---------------------------------------------------------------------------

console.log('\n── metrics: computeGrowth ──');

test('computeGrowth: empty vault returns zeroes', () => {
  setupVault();
  try {
    const g = metrics.computeGrowth({ vaultPath: TEST_VAULT });
    assert.strictEqual(g.total, 0);
    assert.strictEqual(g.inWindow, 0);
    assert.strictEqual(g.perWeek, 0);
    assert.strictEqual(g.trajectory, 'empty');
  } finally {
    teardownVault();
  }
});

test('computeGrowth: counts recent notes and types', () => {
  setupVault();
  try {
    writeNote('decisions/d1.md', { title: 'D1', type: 'decision', tags: ['test'] }, 'decision body');
    writeNote('decisions/d2.md', { title: 'D2', type: 'decision', tags: ['test'] }, 'decision body');
    writeNote('patterns/p1.md', { title: 'P1', type: 'pattern', tags: ['test'] }, 'pattern body');
    writeNote('raw/clips/c1.md', { title: 'C1', type: 'clip', tags: ['test'] }, 'clip body');
    writeNote('sessions/daily.md', { title: 'Daily', type: 'daily', tags: ['session'] }, 'daily body');

    const g = metrics.computeGrowth({ vaultPath: TEST_VAULT, windowDays: 30 });
    assert.strictEqual(g.total, 5);
    assert.strictEqual(g.inWindow, 5); // all just created
    assert.strictEqual(g.byType.decision, 2);
    assert.strictEqual(g.byType.pattern, 1);
    assert.strictEqual(g.byType.clip, 1);
    assert.strictEqual(g.byType.daily, 1);
    assert.ok(['growing', 'stable'].includes(g.trajectory));
  } finally {
    teardownVault();
  }
});

test('computeGrowth: stale notes are excluded from window count', () => {
  setupVault();
  try {
    const p = writeNote('decisions/old.md', { title: 'Old', type: 'decision' }, 'body') || true;
    // Force old mtime
    const oldPath = path.join(TEST_VAULT, 'decisions/old.md');
    const past = Math.floor(Date.now() / 1000) - 60 * 24 * 3600;
    fs.utimesSync(oldPath, past, past);

    writeNote('decisions/new.md', { title: 'New', type: 'decision' }, 'body');

    const g = metrics.computeGrowth({ vaultPath: TEST_VAULT, windowDays: 30 });
    assert.strictEqual(g.total, 2);
    assert.strictEqual(g.inWindow, 1);
  } finally {
    teardownVault();
  }
});

// ---------------------------------------------------------------------------
// Connectivity
// ---------------------------------------------------------------------------

console.log('\n── metrics: computeConnectivity ──');

test('computeConnectivity: empty vault returns isolated', () => {
  setupVault();
  try {
    const engine = buildEngine();
    const c = metrics.computeConnectivity({ engine });
    assert.strictEqual(c.verdict, 'isolated');
    assert.strictEqual(c.edgesPerNode, 0);
    engine.close();
  } finally {
    teardownVault();
  }
});

test('computeConnectivity: linked notes produce healthy metrics', () => {
  setupVault();
  try {
    writeNote('decisions/a.md',
      { title: 'Auth Strategy', type: 'decision', tags: ['auth'] },
      'We chose JWT. See [[API Design]] and [[Token Pattern]].');
    writeNote('decisions/b.md',
      { title: 'API Design', type: 'decision', tags: ['api'] },
      'REST over GraphQL. See [[Auth Strategy]].');
    writeNote('patterns/p.md',
      { title: 'Token Pattern', type: 'pattern', tags: ['auth'] },
      'Use short-lived tokens. See [[Auth Strategy]] and [[API Design]].');
    writeNote('architecture/arch.md',
      { title: 'Architecture', type: 'architecture', tags: ['system'] },
      'Overview. Links to [[Auth Strategy]].');
    // One orphan
    writeNote('decisions/orphan.md',
      { title: 'Orphan', type: 'decision', tags: ['test'] },
      'No links anywhere.');

    const engine = buildEngine();
    const c = metrics.computeConnectivity({ engine });
    assert.ok(c.edgesPerNode > 0, 'should have edges');
    assert.ok(c.orphanCount >= 1, 'should have at least 1 orphan');
    assert.ok(c.hubCount >= 1, 'Auth Strategy should be a hub (3+ backlinks)');
    assert.ok(['well-connected', 'moderately-connected', 'fragmented'].includes(c.verdict));
    engine.close();
  } finally {
    teardownVault();
  }
});

// ---------------------------------------------------------------------------
// Compile rate
// ---------------------------------------------------------------------------

console.log('\n── metrics: computeCompileRate ──');

test('computeCompileRate: no raw returns no-raw', () => {
  setupVault();
  try {
    const cr = metrics.computeCompileRate({ vaultPath: TEST_VAULT });
    assert.strictEqual(cr.verdict, 'no-raw');
    assert.strictEqual(cr.rawCount, 0);
  } finally {
    teardownVault();
  }
});

test('computeCompileRate: mixed compiled/uncompiled raw', () => {
  setupVault();
  try {
    writeNote('raw/clips/a.md', { title: 'A', type: 'clip' }, 'clip body');
    writeNote('raw/clips/b.md', { title: 'B', type: 'clip' }, 'clip body');
    writeNote('raw/papers/c.md', { title: 'C', type: 'paper' }, 'paper body');
    // Only 'a' has a corresponding wiki entry
    writeNote('wiki/concepts/a-concept.md', {
      title: 'A Concept',
      type: 'wiki-concept',
      source_paths: ['raw/clips/a.md'],
      summary: 'Summary',
    }, 'wiki body');

    const cr = metrics.computeCompileRate({ vaultPath: TEST_VAULT });
    assert.strictEqual(cr.rawCount, 3);
    assert.strictEqual(cr.compiledRawCount, 1);
    assert.strictEqual(cr.uncompiledCount, 2);
    assert.strictEqual(cr.rate, 33);
    assert.strictEqual(cr.verdict, 'backlog');
    assert.strictEqual(cr.uncompiledByCategory.clips, 1);
    assert.strictEqual(cr.uncompiledByCategory.papers, 1);
  } finally {
    teardownVault();
  }
});

test('computeCompileRate: fully compiled vault', () => {
  setupVault();
  try {
    writeNote('raw/clips/a.md', { title: 'A', type: 'clip' }, 'clip body');
    writeNote('wiki/concepts/ac.md', {
      title: 'AC',
      type: 'wiki-concept',
      source_paths: ['raw/clips/a.md'],
      summary: 's',
    }, 'wiki body');

    const cr = metrics.computeCompileRate({ vaultPath: TEST_VAULT });
    assert.strictEqual(cr.compiledRawCount, 1);
    assert.strictEqual(cr.uncompiledCount, 0);
    assert.strictEqual(cr.verdict, 'fully-compiled');
  } finally {
    teardownVault();
  }
});

// ---------------------------------------------------------------------------
// Capture ratio
// ---------------------------------------------------------------------------

console.log('\n── metrics: computeCaptureRatio ──');

test('computeCaptureRatio: no sessions returns no-sessions', () => {
  setupVault();
  try {
    const cr = metrics.computeCaptureRatio({ vaultPath: TEST_VAULT });
    assert.strictEqual(cr.verdict, 'no-sessions');
  } finally {
    teardownVault();
  }
});

test('computeCaptureRatio: healthy ratio', () => {
  setupVault();
  try {
    // 3 sessions, 5 captures
    writeNote('sessions/d1.md', { title: 'S1', type: 'daily', tags: ['session'] }, 'body');
    writeNote('sessions/d2.md', { title: 'S2', type: 'daily', tags: ['session'] }, 'body');
    writeNote('sessions/d3.md', { title: 'S3', type: 'daily', tags: ['session'] }, 'body');
    writeNote('decisions/x1.md', { title: 'X1', type: 'decision', tags: ['test'] }, 'body');
    writeNote('decisions/x2.md', { title: 'X2', type: 'decision', tags: ['test'] }, 'body');
    writeNote('patterns/p1.md', { title: 'P1', type: 'pattern', tags: ['test'] }, 'body');
    writeNote('wiki/concepts/w1.md', { title: 'W1', type: 'wiki-concept', tags: ['test'] }, 'body');
    writeNote('wiki/concepts/w2.md', { title: 'W2', type: 'wiki-concept', tags: ['test'] }, 'body');

    const cr = metrics.computeCaptureRatio({ vaultPath: TEST_VAULT });
    assert.strictEqual(cr.sessions, 3);
    assert.strictEqual(cr.decisions, 2);
    assert.strictEqual(cr.patterns, 1);
    assert.strictEqual(cr.wikiEntries, 2);
    assert.strictEqual(cr.captures, 5);
    assert.ok(cr.ratio >= 1.5, `ratio should be >= 1.5, got ${cr.ratio}`);
    assert.strictEqual(cr.verdict, 'healthy');
  } finally {
    teardownVault();
  }
});

test('computeCaptureRatio: excellent ratio (>=2)', () => {
  setupVault();
  try {
    writeNote('sessions/s1.md', { title: 'S1', type: 'daily' }, 'body');
    writeNote('decisions/d1.md', { title: 'D1', type: 'decision' }, 'body');
    writeNote('decisions/d2.md', { title: 'D2', type: 'decision' }, 'body');
    writeNote('patterns/p1.md', { title: 'P1', type: 'pattern' }, 'body');

    const cr = metrics.computeCaptureRatio({ vaultPath: TEST_VAULT });
    assert.strictEqual(cr.ratio, 3);
    assert.strictEqual(cr.verdict, 'excellent');
  } finally {
    teardownVault();
  }
});

// ---------------------------------------------------------------------------
// Knowledge age
// ---------------------------------------------------------------------------

console.log('\n── metrics: computeKnowledgeAge ──');

test('computeKnowledgeAge: all fresh notes → fresh verdict', () => {
  setupVault();
  try {
    writeNote('decisions/a.md', { title: 'A', type: 'decision' }, 'body');
    writeNote('decisions/b.md', { title: 'B', type: 'decision' }, 'body');

    const ka = metrics.computeKnowledgeAge({ vaultPath: TEST_VAULT, windowDays: 30 });
    assert.strictEqual(ka.fresh, 2);
    assert.strictEqual(ka.stale, 0);
    assert.strictEqual(ka.freshRatio, 100);
    assert.strictEqual(ka.verdict, 'fresh');
  } finally {
    teardownVault();
  }
});

test('computeKnowledgeAge: old notes drag freshness down', () => {
  setupVault();
  try {
    // 3 old notes, 1 fresh
    for (let i = 0; i < 3; i++) {
      writeNote(`decisions/old${i}.md`, { title: `Old${i}`, type: 'decision' }, 'body');
      const p = path.join(TEST_VAULT, `decisions/old${i}.md`);
      const past = Math.floor(Date.now() / 1000) - 90 * 24 * 3600;
      fs.utimesSync(p, past, past);
    }
    writeNote('decisions/new.md', { title: 'New', type: 'decision' }, 'body');

    const ka = metrics.computeKnowledgeAge({ vaultPath: TEST_VAULT, windowDays: 30 });
    assert.strictEqual(ka.fresh, 1);
    assert.strictEqual(ka.stale, 3);
    assert.strictEqual(ka.freshRatio, 25);
    assert.strictEqual(ka.verdict, 'stale');
    assert.ok(ka.oldestNotes.length > 0);
  } finally {
    teardownVault();
  }
});

// ---------------------------------------------------------------------------
// Full dashboard (computeMetrics)
// ---------------------------------------------------------------------------

console.log('\n── metrics: computeMetrics (full dashboard) ──');

test('computeMetrics: empty vault returns structured result with score', () => {
  setupVault();
  try {
    const engine = buildEngine();
    const m = metrics.computeMetrics({ vaultPath: TEST_VAULT, engine });
    assert.ok(typeof m.score === 'number');
    assert.ok(['A', 'B', 'C', 'D', 'F'].includes(m.grade));
    assert.ok(m.growth);
    assert.ok(m.connectivity);
    assert.ok(m.compileRate);
    assert.ok(m.captureRatio);
    assert.ok(m.knowledgeAge);
    assert.ok(m.evolveEfficiency);
    assert.ok(m.generated);
    engine.close();
  } finally {
    teardownVault();
  }
});

test('computeMetrics: healthy vault scores high', () => {
  setupVault();
  try {
    // Build a vault that should score well: linked notes, captures, fresh
    writeNote('sessions/s1.md', { title: 'S1', type: 'daily', tags: ['session'] }, 'body');
    writeNote('sessions/s2.md', { title: 'S2', type: 'daily', tags: ['session'] }, 'body');
    writeNote('decisions/d1.md', { title: 'Auth Decision', type: 'decision', tags: ['auth'] },
      'body with [[API Pattern]] link');
    writeNote('decisions/d2.md', { title: 'DB Decision', type: 'decision', tags: ['db'] },
      'body with [[Auth Decision]] link');
    writeNote('patterns/p1.md', { title: 'API Pattern', type: 'pattern', tags: ['api'] },
      'body with [[Auth Decision]] and [[DB Decision]] links');

    const engine = buildEngine();
    const m = metrics.computeMetrics({ vaultPath: TEST_VAULT, engine });
    assert.ok(m.score >= 50, `expected score >= 50, got ${m.score}`);
    assert.ok(m.captureRatio.ratio >= 1, 'capture ratio should be >= 1');
    assert.strictEqual(m.knowledgeAge.verdict, 'fresh');
    assert.ok(m.connectivity.edgesPerNode > 0);
    engine.close();
  } finally {
    teardownVault();
  }
});

test('computeMetrics: requires vaultPath and engine', () => {
  assert.throws(() => metrics.computeMetrics({}), /vaultPath/);
  assert.throws(() => metrics.computeMetrics({ vaultPath: '/tmp' }), /engine/);
});

// ---------------------------------------------------------------------------
// Evolve efficiency
// ---------------------------------------------------------------------------

console.log('\n── metrics: computeEvolveEfficiency ──');

test('computeEvolveEfficiency: no loop → no-loops verdict', () => {
  setupVault();
  try {
    const e = metrics.computeEvolveEfficiency({ vaultPath: TEST_VAULT });
    assert.strictEqual(e.verdict, 'no-loops');
    assert.strictEqual(e.activeLoop, false);
  } finally {
    teardownVault();
  }
});

test('computeEvolveEfficiency: active loop detected', () => {
  setupVault();
  try {
    writeNote('_loop/objective.md', { title: 'Test Objective', type: 'evolve-objective' }, 'objective body');
    writeNote('_loop/progress.md', { title: 'Progress', type: 'evolve-progress' },
      '- iteration 1\n- iteration 2\n- iteration 3');

    const e = metrics.computeEvolveEfficiency({ vaultPath: TEST_VAULT });
    assert.strictEqual(e.activeLoop, true);
    assert.strictEqual(e.objectiveTitle, 'Test Objective');
    assert.strictEqual(e.completedIterations, 3);
    assert.strictEqual(e.verdict, 'in-progress');
  } finally {
    teardownVault();
  }
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n${'═'.repeat(50)}`);
console.log(`metrics tests: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${'═'.repeat(50)}`);
process.exit(failed > 0 ? 1 : 0);
