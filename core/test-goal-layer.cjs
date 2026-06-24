/**
 * test-goal-layer.cjs — ZED v8.3 Goal System test suite
 *
 * Covers: North Star CRUD, Focus CRUD, resolution, clarity classification,
 * lock modes, goal-check, closure synthesis generation, CLAUDE.md round-trip.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const os = require('os');

const G = require('./goal-layer.cjs');

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
  }
}

/**
 * Run fn() with a temporary data dir + cwd. Returns the dir paths so
 * tests can inspect files written.
 */
function withTmpEnv(fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zed-goal-'));
  const dataDir = path.join(root, 'data');
  const repoCwd = path.join(root, 'cwd');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(repoCwd, { recursive: true });
  fs.mkdirSync(path.join(dataDir, 'vault', '_loop'), { recursive: true });
  fs.mkdirSync(path.join(dataDir, 'vault', 'wiki', 'syntheses'), { recursive: true });
  fs.mkdirSync(path.join(dataDir, 'vault', 'decisions'), { recursive: true });
  fs.mkdirSync(path.join(dataDir, 'vault', 'goals', 'completed'), { recursive: true });
  fs.mkdirSync(path.join(dataDir, 'vault', 'goals', 'archived'), { recursive: true });

  const opts = { dataDir, repoCwd, vaultDir: path.join(dataDir, 'vault') };
  try {
    fn(opts);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
console.log('\n── goal-layer: helpers ──');

test('slugify: lowercases and kebab-cases', () => {
  assert.strictEqual(G.slugify('Hello World 2026!'), 'hello-world-2026');
  assert.strictEqual(G.slugify('  Multiple   Spaces  '), 'multiple-spaces');
  assert.strictEqual(G.slugify(''), '');
  assert.strictEqual(G.slugify('  ---  '), '');
});

test('nextGoalId: produces deterministic format', () => {
  const id = G.nextGoalId('Build the thing');
  assert.match(id, /^G-\d{4}-\d{2}-\d{2}-build-the-thing$/);
});

test('nextGoalId: handles empty title with fallback', () => {
  const id = G.nextGoalId('');
  assert.match(id, /^G-\d{4}-\d{2}-\d{2}-untitled$/);
});

// ---------------------------------------------------------------------------
console.log('\n── goal-layer: markdown section parsing ──');

test('findSection: returns body of named section', () => {
  const text = '# Title\n\n## Foo\n\nFoo body\n\n## Bar\n\nBar body\n';
  const found = G.findSection(text, 'Foo');
  assert.ok(found);
  assert.match(found.body, /Foo body/);
});

test('findSection: returns null when section missing', () => {
  assert.strictEqual(G.findSection('# Title\n\nNothing.\n', 'Foo'), null);
});

test('upsertSection: inserts when missing', () => {
  const before = '# Title\n\nIntro.\n';
  const after = G.upsertSection(before, 'New Section', 'Body here.');
  assert.match(after, /## New Section/);
  assert.match(after, /Body here\./);
});

test('upsertSection: replaces when present', () => {
  const before = '# Title\n\n## Foo\n\nOld body\n\n## Bar\n\nKeep me\n';
  const after = G.upsertSection(before, 'Foo', 'New body');
  assert.match(after, /New body/);
  assert.doesNotMatch(after, /Old body/);
  assert.match(after, /Keep me/);
});

test('removeSection: drops only the named section', () => {
  const before = '# Title\n\n## Foo\n\nFoo body\n\n## Bar\n\nBar body\n';
  const after = G.removeSection(before, 'Foo');
  assert.doesNotMatch(after, /Foo body/);
  assert.match(after, /Bar body/);
});

// ---------------------------------------------------------------------------
console.log('\n── goal-layer: North Star body parse/render round-trip ──');

test('renderNorthStarBody → parseNorthStarBody: round-trip preserves all fields', () => {
  const goal = {
    title: 'Build the thing',
    successCriteria: ['ship it', 'measure it'],
    antiGoals: ['scope creep', 'bikeshedding'],
    horizon: 'sprint',
    setAt: '2026-05-10',
    id: 'G-2026-05-10-build-the-thing',
  };
  const body = G.renderNorthStarBody(goal);
  const parsed = G.parseNorthStarBody(body);
  assert.strictEqual(parsed.title, goal.title);
  assert.deepStrictEqual(parsed.successCriteria, goal.successCriteria);
  assert.deepStrictEqual(parsed.antiGoals, goal.antiGoals);
  assert.strictEqual(parsed.horizon, goal.horizon);
  assert.strictEqual(parsed.setAt, goal.setAt);
  assert.strictEqual(parsed.id, goal.id);
});

test('parseNorthStarBody: tolerates missing optional fields', () => {
  const body = `**Goal**: Just a title\n\n**Set**: 2026-05-14\n`;
  const parsed = G.parseNorthStarBody(body);
  assert.strictEqual(parsed.title, 'Just a title');
  assert.deepStrictEqual(parsed.successCriteria, []);
  assert.deepStrictEqual(parsed.antiGoals, []);
});

test('parseNorthStarBody: returns null on empty body', () => {
  assert.strictEqual(G.parseNorthStarBody(''), null);
  assert.strictEqual(G.parseNorthStarBody('   \n  '), null);
});

// ---------------------------------------------------------------------------
console.log('\n── goal-layer: North Star CRUD ──');

test('writeNorthStar: refuses without success criteria', () => {
  withTmpEnv((opts) => {
    assert.throws(
      () => G.writeNorthStar({ title: 'X', successCriteria: [] }, opts),
      /success criterion/i
    );
  });
});

test('writeNorthStar: refuses without title', () => {
  withTmpEnv((opts) => {
    assert.throws(
      () => G.writeNorthStar({ title: '', successCriteria: ['a'] }, opts),
      /title/i
    );
  });
});

test('writeNorthStar: creates CLAUDE.md when missing', () => {
  withTmpEnv((opts) => {
    G.writeNorthStar({ title: 'Test', successCriteria: ['ship it'] }, opts);
    const claudeMd = path.join(opts.repoCwd, 'CLAUDE.md');
    assert.ok(fs.existsSync(claudeMd));
    const content = fs.readFileSync(claudeMd, 'utf-8');
    assert.match(content, /## North Star/);
    assert.match(content, /Test/);
  });
});

test('writeNorthStar: mirrors to vault/goals/NORTH_STAR.md', () => {
  withTmpEnv((opts) => {
    G.writeNorthStar({ title: 'Test', successCriteria: ['a'] }, opts);
    const mirror = path.join(opts.vaultDir, 'goals', 'NORTH_STAR.md');
    assert.ok(fs.existsSync(mirror));
    const content = fs.readFileSync(mirror, 'utf-8');
    assert.match(content, /type: project-goal/);
    assert.match(content, /Test/);
  });
});

test('readNorthStar: returns null when no CLAUDE.md', () => {
  withTmpEnv((opts) => {
    assert.strictEqual(G.readNorthStar(opts), null);
  });
});

test('readNorthStar: parses written goal correctly', () => {
  withTmpEnv((opts) => {
    G.writeNorthStar({
      title: 'Read-back test',
      successCriteria: ['c1', 'c2'],
      antiGoals: ['a1'],
      horizon: 'quarter',
    }, opts);
    const read = G.readNorthStar(opts);
    assert.strictEqual(read.title, 'Read-back test');
    assert.deepStrictEqual(read.successCriteria, ['c1', 'c2']);
    assert.deepStrictEqual(read.antiGoals, ['a1']);
    assert.strictEqual(read.horizon, 'quarter');
  });
});

test('writeNorthStar: upserts (replacing) existing North Star section', () => {
  withTmpEnv((opts) => {
    G.writeNorthStar({ title: 'First', successCriteria: ['a'] }, opts);
    G.writeNorthStar({ title: 'Second', successCriteria: ['b'] }, opts);
    const read = G.readNorthStar(opts);
    assert.strictEqual(read.title, 'Second');
  });
});

test('archiveNorthStar: moves to archived/ and removes from CLAUDE.md', () => {
  withTmpEnv((opts) => {
    G.writeNorthStar({ title: 'Will be archived', successCriteria: ['a'] }, opts);
    G.archiveNorthStar('test cleanup', opts);
    assert.strictEqual(G.readNorthStar(opts), null);
    const archivedFiles = fs.readdirSync(path.join(opts.vaultDir, 'goals', 'archived'));
    assert.strictEqual(archivedFiles.length, 1);
    assert.match(archivedFiles[0], /^G-/);
  });
});

test('completeNorthStar: moves to completed/, removes from CLAUDE.md, emits synthesis', () => {
  withTmpEnv((opts) => {
    G.writeNorthStar({ title: 'Will be completed', successCriteria: ['a'] }, opts);
    const result = G.completeNorthStar('done', opts);
    assert.ok(result);
    assert.strictEqual(result.goal.title, 'Will be completed');
    assert.ok(result.synthesisPath);
    assert.ok(fs.existsSync(result.synthesisPath));
    assert.strictEqual(G.readNorthStar(opts), null);
    const completedFiles = fs.readdirSync(path.join(opts.vaultDir, 'goals', 'completed'));
    assert.strictEqual(completedFiles.length, 1);
  });
});

test('completeNorthStar: --no-synthesis equivalent skips synthesis emission', () => {
  withTmpEnv((opts) => {
    G.writeNorthStar({ title: 'Skip-synth', successCriteria: ['a'] }, opts);
    const result = G.completeNorthStar('done', { ...opts, skipSynthesis: true });
    assert.ok(result);
    assert.strictEqual(result.synthesisPath, null);
  });
});

test('completeNorthStar: returns null when no North Star to complete', () => {
  withTmpEnv((opts) => {
    assert.strictEqual(G.completeNorthStar('whatever', opts), null);
  });
});

// ---------------------------------------------------------------------------
console.log('\n── goal-layer: Focus CRUD ──');

test('writeFocus: refuses empty title', () => {
  withTmpEnv((opts) => {
    assert.throws(() => G.writeFocus({ title: '' }, opts), /title/i);
  });
});

test('writeFocus: persists to active-goal.json', () => {
  withTmpEnv((opts) => {
    const goal = G.writeFocus({ title: 'session focus' }, opts);
    assert.ok(goal.id);
    const read = G.readFocus(opts);
    assert.strictEqual(read.title, 'session focus');
  });
});

test('clearFocus: removes active-goal.json', () => {
  withTmpEnv((opts) => {
    G.writeFocus({ title: 'temp' }, opts);
    G.clearFocus(opts);
    assert.strictEqual(G.readFocus(opts), null);
  });
});

// ---------------------------------------------------------------------------
console.log('\n── goal-layer: resolution + clarity ──');

test('resolveEffectiveGoal: focus overrides north star', () => {
  withTmpEnv((opts) => {
    G.writeNorthStar({ title: 'NS', successCriteria: ['a'] }, opts);
    G.writeFocus({ title: 'Focus' }, opts);
    const { effective, source } = G.resolveEffectiveGoal(opts);
    assert.strictEqual(effective.title, 'Focus');
    assert.strictEqual(source, 'focus');
  });
});

test('resolveEffectiveGoal: falls back to north star when no focus', () => {
  withTmpEnv((opts) => {
    G.writeNorthStar({ title: 'NS', successCriteria: ['a'] }, opts);
    const { effective, source } = G.resolveEffectiveGoal(opts);
    assert.strictEqual(effective.title, 'NS');
    assert.strictEqual(source, 'north-star');
  });
});

test('resolveEffectiveGoal: returns none when nothing set', () => {
  withTmpEnv((opts) => {
    const { effective, source } = G.resolveEffectiveGoal(opts);
    assert.strictEqual(effective, null);
    assert.strictEqual(source, 'none');
  });
});

test('classifyGoalClarity: missing when no goal at all', () => {
  withTmpEnv((opts) => {
    const c = G.classifyGoalClarity(opts);
    assert.strictEqual(c.clarity, 'missing');
  });
});

test('classifyGoalClarity: vague when focus has no criteria', () => {
  withTmpEnv((opts) => {
    G.writeFocus({ title: 'naked focus' }, opts);
    const c = G.classifyGoalClarity(opts);
    assert.strictEqual(c.clarity, 'vague');
  });
});

test('classifyGoalClarity: clear when north star has criteria and is fresh', () => {
  withTmpEnv((opts) => {
    G.writeNorthStar({ title: 'clear', successCriteria: ['c'] }, opts);
    const c = G.classifyGoalClarity(opts);
    assert.strictEqual(c.clarity, 'clear');
  });
});

test('classifyGoalClarity: stale when focus older than 7 days', () => {
  withTmpEnv((opts) => {
    G.writeFocus({ title: 'old', successCriteria: ['c'] }, opts);
    // Backdate the focus by 10 days
    const focusPath = G.activeGoalPath(opts);
    const focus = JSON.parse(fs.readFileSync(focusPath, 'utf-8'));
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString();
    focus.setAt = tenDaysAgo;
    fs.writeFileSync(focusPath, JSON.stringify(focus), 'utf-8');
    const c = G.classifyGoalClarity(opts);
    assert.strictEqual(c.clarity, 'stale');
  });
});

// ---------------------------------------------------------------------------
console.log('\n── goal-layer: lock mode + goalCheck ──');

test('readLockMode: defaults to advise when no file', () => {
  withTmpEnv((opts) => {
    assert.strictEqual(G.readLockMode(opts), 'advise');
  });
});

test('writeLockMode: persists and refuses invalid mode', () => {
  withTmpEnv((opts) => {
    G.writeLockMode('block-writes', opts);
    assert.strictEqual(G.readLockMode(opts), 'block-writes');
    assert.throws(() => G.writeLockMode('nonsense', opts), /Invalid lock mode/);
  });
});

test('clearLockMode: removes file and returns advise', () => {
  withTmpEnv((opts) => {
    G.writeLockMode('warn', opts);
    G.clearLockMode(opts);
    assert.strictEqual(G.readLockMode(opts), 'advise');
  });
});

test('goalCheck: no goal + advise = surface', () => {
  withTmpEnv((opts) => {
    const r = G.goalCheck(opts);
    assert.strictEqual(r.recommendedAction, 'surface');
    assert.strictEqual(r.clarity, 'missing');
  });
});

test('goalCheck: no goal + block-writes = block', () => {
  withTmpEnv((opts) => {
    G.writeLockMode('block-writes', opts);
    const r = G.goalCheck(opts);
    assert.strictEqual(r.recommendedAction, 'block');
  });
});

test('goalCheck: clear goal + warn = surface (not warn — clear goals are fine)', () => {
  withTmpEnv((opts) => {
    G.writeNorthStar({ title: 'c', successCriteria: ['a'] }, opts);
    G.writeLockMode('warn', opts);
    const r = G.goalCheck(opts);
    assert.strictEqual(r.recommendedAction, 'surface');
  });
});

test('goalCheck: vague goal + warn = warn', () => {
  withTmpEnv((opts) => {
    G.writeFocus({ title: 'vague' }, opts);
    G.writeLockMode('warn', opts);
    const r = G.goalCheck(opts);
    assert.strictEqual(r.recommendedAction, 'warn');
  });
});

test('goalCheck: vague goal + block-writes = block', () => {
  withTmpEnv((opts) => {
    G.writeFocus({ title: 'vague' }, opts);
    G.writeLockMode('block-writes', opts);
    const r = G.goalCheck(opts);
    assert.strictEqual(r.recommendedAction, 'block');
  });
});

test('goalCheck: active evolve loop always allows', () => {
  withTmpEnv((opts) => {
    G.writeLockMode('block-all', opts);
    const loopObj = path.join(opts.vaultDir, '_loop', 'objective.md');
    fs.writeFileSync(loopObj, '---\ntitle: "x"\ncompleted: false\n---\n', 'utf-8');
    const r = G.goalCheck(opts);
    assert.strictEqual(r.recommendedAction, 'allow');
    assert.strictEqual(r.inEvolveLoop, true);
  });
});

test('goalCheck: completed evolve loop does NOT defer', () => {
  withTmpEnv((opts) => {
    const loopObj = path.join(opts.vaultDir, '_loop', 'objective.md');
    fs.writeFileSync(loopObj, '---\ntitle: "x"\ncompleted: true\n---\n', 'utf-8');
    const r = G.goalCheck(opts);
    assert.strictEqual(r.inEvolveLoop, false);
  });
});

// ---------------------------------------------------------------------------
console.log('\n── goal-layer: events ──');

test('appendGoalEvent + readGoalEvents: round-trip', () => {
  withTmpEnv((opts) => {
    G.appendGoalEvent({ kind: 'test.fire', id: 'X', title: 'T' }, opts);
    const events = G.readGoalEvents(opts);
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].kind, 'test.fire');
    assert.strictEqual(events[0].id, 'X');
    assert.strictEqual(events[0].title, 'T');
  });
});

test('writeNorthStar logs north-star.set event', () => {
  withTmpEnv((opts) => {
    G.writeNorthStar({ title: 'evented', successCriteria: ['a'] }, opts);
    const events = G.readGoalEvents(opts);
    assert.ok(events.some((e) => e.kind === 'north-star.set'));
  });
});

test('completeNorthStar logs north-star.completed event', () => {
  withTmpEnv((opts) => {
    G.writeNorthStar({ title: 'evented', successCriteria: ['a'] }, opts);
    G.completeNorthStar('done', opts);
    const events = G.readGoalEvents(opts);
    assert.ok(events.some((e) => e.kind === 'north-star.completed'));
  });
});

// ---------------------------------------------------------------------------
console.log('\n── goal-layer: closure synthesis ──');

test('generateClosureSynthesis: produces expected sections', () => {
  withTmpEnv((opts) => {
    const goal = {
      id: 'G-2026-05-15-synth-test',
      title: 'Synth test',
      setAt: '2026-05-13',
      successCriteria: ['criterion 1'],
      horizon: 'sprint',
    };
    const md = G.generateClosureSynthesis(goal, { ...opts, closureNote: 'done done' });
    assert.match(md, /# Closure: Synth test/);
    assert.match(md, /\*\*Goal\*\*: Synth test/);
    assert.match(md, /\*\*Duration\*\*: \d+ days?/);
    assert.match(md, /### Success Criteria/);
    assert.match(md, /done done/);
    assert.match(md, /## What's Next/);
  });
});

test('writeClosureSynthesis: writes to vault/wiki/syntheses/', () => {
  withTmpEnv((opts) => {
    const goal = {
      id: 'G-2026-05-15-write-test',
      title: 'Write test',
      setAt: '2026-05-13',
      successCriteria: ['c'],
    };
    const written = G.writeClosureSynthesis(goal, opts);
    assert.ok(fs.existsSync(written));
    const content = fs.readFileSync(written, 'utf-8');
    assert.match(content, /type: wiki-synthesis/);
    assert.match(content, /goal_id: G-2026-05-15-write-test/);
  });
});

test('listVaultNotesInWindow: respects created date in frontmatter', () => {
  withTmpEnv((opts) => {
    const wikiDir = path.join(opts.vaultDir, 'wiki');
    fs.writeFileSync(
      path.join(wikiDir, 'in-window.md'),
      '---\ntitle: "in"\ntype: wiki-concept\ncreated: 2026-05-14\n---\n# in\n',
      'utf-8'
    );
    fs.writeFileSync(
      path.join(wikiDir, 'out-of-window.md'),
      '---\ntitle: "out"\ntype: wiki-concept\ncreated: 2025-01-01\n---\n# out\n',
      'utf-8'
    );
    const notes = G.listVaultNotesInWindow('2026-05-13T00:00:00Z', '2026-05-16T00:00:00Z', opts);
    const titles = notes.map((n) => n.title);
    assert.ok(titles.includes('in'));
    assert.ok(!titles.includes('out'));
  });
});

// ---------------------------------------------------------------------------
console.log('\n── goal-layer: renderStack ──');

test('renderStack: empty when no goal', () => {
  withTmpEnv((opts) => {
    assert.strictEqual(G.renderStack(opts), '');
  });
});

test('renderStack: includes North Star title and criteria when set', () => {
  withTmpEnv((opts) => {
    G.writeNorthStar({ title: 'rendered', successCriteria: ['c1', 'c2'] }, opts);
    const out = G.renderStack(opts);
    assert.match(out, /North Star: rendered/);
    assert.match(out, /c1; c2/);
  });
});

test('renderStack: marks status when not clear', () => {
  withTmpEnv((opts) => {
    G.writeFocus({ title: 'vague' }, opts);
    const out = G.renderStack(opts);
    assert.match(out, /Status: vague/);
  });
});

// ---------------------------------------------------------------------------
console.log('\n══════════════════════════════════════════════════');
console.log(`goal-layer tests: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log('══════════════════════════════════════════════════');

if (failed > 0) process.exit(1);
