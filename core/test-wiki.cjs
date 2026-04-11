/**
 * test-wiki.cjs — ZED v8.0 wiki-layer test suite
 *
 * Tests plan computation, index rebuild, log append, health checking,
 * session synthesis, and schema scaffolding. Uses an on-disk test vault.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const wiki = require('./wiki-layer.cjs');
const fileLayer = require('./file-layer.cjs');

const TEST_VAULT = path.join(__dirname, '.test-vault-wiki');

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
  const subs = [
    'raw/clips', 'raw/papers', 'raw/repos', 'raw/transcripts',
    'wiki/concepts', 'wiki/entities', 'wiki/syntheses',
  ];
  for (const s of subs) {
    fs.mkdirSync(path.join(TEST_VAULT, s), { recursive: true });
  }
}
function teardownVault() { fs.rmSync(TEST_VAULT, { recursive: true, force: true }); }

function writeRaw(relPath, fm, body) {
  const full = path.join(TEST_VAULT, relPath);
  const fmLines = ['---'];
  for (const [k, v] of Object.entries(fm)) {
    if (Array.isArray(v)) fmLines.push(`${k}: [${v.map((x) => `"${x}"`).join(', ')}]`);
    else fmLines.push(`${k}: "${v}"`);
  }
  fmLines.push('---', '', body || '');
  fileLayer.writeNote(full, fmLines.join('\n'));
  return full;
}

function writeWiki(relPath, fm, body) {
  return writeRaw(relPath, fm, body);
}

// ---------------------------------------------------------------------------
// listRawFiles / listWikiFiles
// ---------------------------------------------------------------------------

console.log('\n── wiki-layer: inventory ──');

test('listRawFiles: empty vault → []', () => {
  setupVault();
  try {
    assert.deepStrictEqual(wiki.listRawFiles(TEST_VAULT), []);
  } finally {
    teardownVault();
  }
});

test('listRawFiles: picks up nested raw/ files with categories', () => {
  setupVault();
  try {
    writeRaw('raw/clips/a.md', { title: 'A', type: 'clip', source: 'https://a/' }, 'body');
    writeRaw('raw/papers/b.md', { title: 'B', type: 'paper', source: 'https://b/' }, 'body');
    const files = wiki.listRawFiles(TEST_VAULT);
    assert.strictEqual(files.length, 2);
    const byCat = Object.fromEntries(files.map((f) => [f.category, f]));
    assert.ok(byCat.clips);
    assert.ok(byCat.papers);
    assert.strictEqual(byCat.clips.title, 'A');
    assert.strictEqual(byCat.papers.source, 'https://b/');
  } finally {
    teardownVault();
  }
});

test('listWikiFiles: reads frontmatter source_paths', () => {
  setupVault();
  try {
    writeWiki('wiki/concepts/harness.md',
      { title: 'Harness', type: 'wiki-concept', source_paths: ['raw/clips/a.md'], summary: 'Agent orchestration' },
      'Content with [[Mem0]].'
    );
    const files = wiki.listWikiFiles(TEST_VAULT);
    assert.strictEqual(files.length, 1);
    assert.strictEqual(files[0].title, 'Harness');
    assert.deepStrictEqual(files[0].sources, ['raw/clips/a.md']);
    assert.strictEqual(files[0].summary, 'Agent orchestration');
    assert.ok(files[0].wikilinks.length >= 1);
  } finally {
    teardownVault();
  }
});

// ---------------------------------------------------------------------------
// planCompile
// ---------------------------------------------------------------------------

console.log('\n── wiki-layer: planCompile ──');

test('planCompile: uncompiled raw files are detected', () => {
  setupVault();
  try {
    writeRaw('raw/clips/a.md', { title: 'A', type: 'clip' }, 'body');
    writeRaw('raw/clips/b.md', { title: 'B', type: 'clip' }, 'body');
    writeWiki('wiki/concepts/x.md',
      { title: 'X', type: 'wiki-concept', source_paths: ['raw/clips/a.md'], summary: 's' },
      'body'
    );
    const plan = wiki.planCompile({ vaultPath: TEST_VAULT });
    assert.strictEqual(plan.rawCount, 2);
    assert.strictEqual(plan.wikiCount, 1);
    assert.strictEqual(plan.uncompiled.length, 1);
    assert.strictEqual(plan.uncompiled[0].title, 'B');
  } finally {
    teardownVault();
  }
});

test('planCompile: byCategory aggregates correctly', () => {
  setupVault();
  try {
    writeRaw('raw/clips/a.md', { title: 'A', type: 'clip' }, 'body');
    writeRaw('raw/clips/b.md', { title: 'B', type: 'clip' }, 'body');
    writeRaw('raw/papers/c.md', { title: 'C', type: 'paper' }, 'body');
    const plan = wiki.planCompile({ vaultPath: TEST_VAULT });
    assert.strictEqual(plan.byCategory.clips, 2);
    assert.strictEqual(plan.byCategory.papers, 1);
  } finally {
    teardownVault();
  }
});

test('planCompile: wikiCount excludes index.md and log.md (consistent with healthCheck)', () => {
  setupVault();
  try {
    writeWiki('wiki/concepts/real.md',
      { title: 'Real', type: 'wiki-concept', source_paths: ['raw/clips/a.md'], summary: 's' },
      'body'
    );
    // Create scaffold files — they should NOT count toward wikiCount
    wiki.updateIndex({ vaultPath: TEST_VAULT });
    wiki.appendLog('test entry', { vaultPath: TEST_VAULT });
    const plan = wiki.planCompile({ vaultPath: TEST_VAULT });
    assert.strictEqual(plan.wikiCount, 1, 'planCompile should exclude index.md and log.md');
    // Verify it matches healthCheck
    const h = wiki.healthCheck({ vaultPath: TEST_VAULT });
    assert.strictEqual(h.wikiCount, plan.wikiCount, 'planCompile and healthCheck wikiCount must match');
  } finally {
    teardownVault();
  }
});

test('planCompile: orphan wiki (source_paths missing file) is flagged', () => {
  setupVault();
  try {
    writeWiki('wiki/concepts/x.md',
      { title: 'X', type: 'wiki-concept', source_paths: ['raw/clips/gone.md'], summary: 's' },
      'body'
    );
    const plan = wiki.planCompile({ vaultPath: TEST_VAULT });
    assert.strictEqual(plan.orphanWiki.length, 1);
    assert.strictEqual(plan.orphanWiki[0].missing_source, 'raw/clips/gone.md');
  } finally {
    teardownVault();
  }
});

test('planCompile: stale wiki (raw mtime > wiki mtime) is flagged', () => {
  setupVault();
  try {
    const rawPath = writeRaw('raw/clips/a.md', { title: 'A', type: 'clip' }, 'old');
    writeWiki('wiki/concepts/x.md',
      { title: 'X', type: 'wiki-concept', source_paths: ['raw/clips/a.md'], summary: 's' },
      'body'
    );
    // Touch the raw file to a future mtime
    const future = Date.now() / 1000 + 100;
    fs.utimesSync(rawPath, future, future);
    const plan = wiki.planCompile({ vaultPath: TEST_VAULT });
    assert.strictEqual(plan.stale.length, 1);
  } finally {
    teardownVault();
  }
});

test('planCompile: since filter excludes old raw files', () => {
  setupVault();
  try {
    const rawPath = writeRaw('raw/clips/old.md', { title: 'Old', type: 'clip' }, 'body');
    writeRaw('raw/clips/new.md', { title: 'New', type: 'clip' }, 'body');
    // Force old file's mtime to 48h ago
    const past = Math.floor(Date.now() / 1000) - 48 * 3600;
    fs.utimesSync(rawPath, past, past);
    const plan = wiki.planCompile({ vaultPath: TEST_VAULT, since: 24 });
    const titles = plan.uncompiled.map((f) => f.title);
    assert.ok(titles.includes('New'));
    assert.ok(!titles.includes('Old'));
  } finally {
    teardownVault();
  }
});

// ---------------------------------------------------------------------------
// updateIndex
// ---------------------------------------------------------------------------

console.log('\n── wiki-layer: updateIndex ──');

test('updateIndex: produces a valid index.md with groupings', () => {
  setupVault();
  try {
    writeWiki('wiki/concepts/alpha.md',
      { title: 'Alpha', type: 'wiki-concept', source_paths: ['raw/clips/a.md'], summary: 'alpha sum' },
      'body'
    );
    writeWiki('wiki/entities/beta.md',
      { title: 'Beta', type: 'wiki-entity', source_paths: ['raw/clips/b.md'], summary: 'beta sum' },
      'body'
    );
    const result = wiki.updateIndex({ vaultPath: TEST_VAULT });
    assert.strictEqual(result.entries, 2);
    const content = fs.readFileSync(result.path, 'utf-8');
    assert.ok(content.includes('# Wiki Index'));
    assert.ok(content.includes('## concepts'));
    assert.ok(content.includes('## entities'));
    assert.ok(content.includes('[[Alpha]] — alpha sum'));
    assert.ok(content.includes('[[Beta]] — beta sum'));
  } finally {
    teardownVault();
  }
});

test('updateIndex: empty wiki produces a placeholder', () => {
  setupVault();
  try {
    const result = wiki.updateIndex({ vaultPath: TEST_VAULT });
    assert.strictEqual(result.entries, 0);
    const content = fs.readFileSync(result.path, 'utf-8');
    assert.ok(content.includes('empty'));
  } finally {
    teardownVault();
  }
});

test('updateIndex: excludes index.md and log.md from its own listing', () => {
  setupVault();
  try {
    writeWiki('wiki/concepts/alpha.md',
      { title: 'Alpha', type: 'wiki-concept', source_paths: ['raw/clips/a.md'], summary: 'alpha' },
      'body'
    );
    wiki.updateIndex({ vaultPath: TEST_VAULT });
    wiki.updateIndex({ vaultPath: TEST_VAULT }); // second pass must not include index.md
    const content = fs.readFileSync(path.join(TEST_VAULT, 'wiki', 'index.md'), 'utf-8');
    assert.ok(!content.includes('[[Wiki Index]]'));
  } finally {
    teardownVault();
  }
});

// ---------------------------------------------------------------------------
// appendLog
// ---------------------------------------------------------------------------

console.log('\n── wiki-layer: appendLog ──');

test('appendLog: creates log.md on first call with header', () => {
  setupVault();
  try {
    const r = wiki.appendLog('first entry', { vaultPath: TEST_VAULT });
    const content = fs.readFileSync(r.path, 'utf-8');
    assert.ok(content.includes('# Wiki Change Log'));
    assert.ok(content.includes('first entry'));
  } finally {
    teardownVault();
  }
});

test('appendLog: atomic append preserves prior entries', () => {
  setupVault();
  try {
    wiki.appendLog('first entry', { vaultPath: TEST_VAULT });
    wiki.appendLog('second entry', { vaultPath: TEST_VAULT });
    wiki.appendLog('third entry', { vaultPath: TEST_VAULT });
    const content = fs.readFileSync(path.join(TEST_VAULT, 'wiki', 'log.md'), 'utf-8');
    assert.ok(content.includes('first entry'));
    assert.ok(content.includes('second entry'));
    assert.ok(content.includes('third entry'));
    // second must come before third
    assert.ok(content.indexOf('second') < content.indexOf('third'));
  } finally {
    teardownVault();
  }
});

// ---------------------------------------------------------------------------
// healthCheck
// ---------------------------------------------------------------------------

console.log('\n── wiki-layer: healthCheck ──');

test('healthCheck: clean vault scores high', () => {
  setupVault();
  try {
    writeRaw('raw/clips/a.md', { title: 'A', type: 'clip' }, 'body');
    writeWiki('wiki/concepts/x.md',
      { title: 'X', type: 'wiki-concept', source_paths: ['raw/clips/a.md'], summary: 's' },
      'body with [[X]] self-link'
    );
    const h = wiki.healthCheck({ vaultPath: TEST_VAULT });
    assert.ok(h.score >= 80, `expected >=80 got ${h.score}`);
    assert.ok(['A', 'B'].includes(h.grade));
  } finally {
    teardownVault();
  }
});

test('healthCheck: broken wikilinks are detected', () => {
  setupVault();
  try {
    writeRaw('raw/clips/a.md', { title: 'A', type: 'clip' }, 'body');
    writeWiki('wiki/concepts/x.md',
      { title: 'X', type: 'wiki-concept', source_paths: ['raw/clips/a.md'], summary: 's' },
      'body with [[DoesNotExist]] link'
    );
    const h = wiki.healthCheck({ vaultPath: TEST_VAULT });
    assert.ok(h.brokenLinks.length >= 1);
    assert.strictEqual(h.brokenLinks[0].target, 'DoesNotExist');
  } finally {
    teardownVault();
  }
});

test('healthCheck: uncompiled raw drags score down', () => {
  setupVault();
  try {
    for (let i = 0; i < 5; i++) {
      writeRaw(`raw/clips/file${i}.md`, { title: `File${i}`, type: 'clip' }, 'body');
    }
    const h = wiki.healthCheck({ vaultPath: TEST_VAULT });
    assert.strictEqual(h.uncompiled.length, 5);
    assert.ok(h.score < 100);
  } finally {
    teardownVault();
  }
});

test('healthCheck: wiki with no source_paths flagged as noProvenance', () => {
  setupVault();
  try {
    writeWiki('wiki/concepts/x.md',
      { title: 'X', type: 'wiki-concept', summary: 's' }, // no source_paths
      'body'
    );
    const h = wiki.healthCheck({ vaultPath: TEST_VAULT });
    assert.strictEqual(h.noProvenance.length, 1);
  } finally {
    teardownVault();
  }
});

test('healthCheck: wikiCount excludes index.md and log.md', () => {
  setupVault();
  try {
    writeWiki('wiki/concepts/alpha.md',
      { title: 'Alpha', type: 'wiki-concept', source_paths: ['raw/clips/a.md'], summary: 's' },
      'body');
    wiki.updateIndex({ vaultPath: TEST_VAULT });
    wiki.appendLog('test', { vaultPath: TEST_VAULT });
    const h = wiki.healthCheck({ vaultPath: TEST_VAULT });
    // 1 real entry — index.md and log.md should NOT count
    assert.strictEqual(h.wikiCount, 1);
  } finally {
    teardownVault();
  }
});

// ---- temporal metadata (v8.1) ----

test('listWikiFiles: surfaces temporal frontmatter fields', () => {
  setupVault();
  try {
    writeWiki('wiki/concepts/tempo.md',
      {
        title: 'Tempo',
        type: 'wiki-concept',
        source_paths: ['raw/clips/a.md'],
        summary: 's',
        created: '2026-01-15',
        updated: '2026-04-10',
        expires_at: '2027-01-01',
        superseded_by: 'Replacement',
      },
      'body'
    );
    const files = wiki.listWikiFiles(TEST_VAULT);
    const f = files.find((x) => x.title === 'Tempo');
    assert.ok(f);
    assert.strictEqual(f.created, '2026-01-15');
    assert.strictEqual(f.updated, '2026-04-10');
    assert.strictEqual(f.expiresAt, '2027-01-01');
    assert.strictEqual(f.supersededBy, 'Replacement');
  } finally {
    teardownVault();
  }
});

test('healthCheck: expired wiki entries are flagged', () => {
  setupVault();
  try {
    writeWiki('wiki/concepts/stale.md',
      {
        title: 'Stale',
        type: 'wiki-concept',
        source_paths: ['raw/clips/a.md'],
        summary: 's',
        expires_at: '2020-01-01',
      },
      'body'
    );
    writeWiki('wiki/concepts/fresh.md',
      {
        title: 'Fresh',
        type: 'wiki-concept',
        source_paths: ['raw/clips/b.md'],
        summary: 's',
        expires_at: '2099-01-01',
      },
      'body'
    );
    const h = wiki.healthCheck({ vaultPath: TEST_VAULT });
    assert.strictEqual(h.expired.length, 1);
    assert.strictEqual(h.expired[0].wiki.title, 'Stale');
  } finally {
    teardownVault();
  }
});

test('healthCheck: superseded_by with existing replacement is reported', () => {
  setupVault();
  try {
    writeWiki('wiki/concepts/old.md',
      {
        title: 'Old Name',
        type: 'wiki-concept',
        source_paths: ['raw/clips/a.md'],
        summary: 's',
        superseded_by: 'New Name',
      },
      'body'
    );
    writeWiki('wiki/concepts/new.md',
      {
        title: 'New Name',
        type: 'wiki-concept',
        source_paths: ['raw/clips/a.md'],
        summary: 's',
      },
      'body'
    );
    const h = wiki.healthCheck({ vaultPath: TEST_VAULT });
    assert.strictEqual(h.superseded.length, 1);
    assert.strictEqual(h.superseded[0].replacement_found, true);
  } finally {
    teardownVault();
  }
});

// ---------------------------------------------------------------------------
// writeSessionSynthesis
// ---------------------------------------------------------------------------

console.log('\n── wiki-layer: writeSessionSynthesis ──');

test('writeSessionSynthesis: produces a dated synthesis under wiki/syntheses/', () => {
  setupVault();
  try {
    writeRaw('decisions/d1.md', { title: 'Decision 1', type: 'decision' }, 'body');
    writeRaw('patterns/p1.md', { title: 'Pattern 1', type: 'pattern' }, 'body');
    writeRaw('raw/clips/c1.md', { title: 'Clip 1', type: 'clip' }, 'body');
    // NB: ensure decisions/ exists
    fs.mkdirSync(path.join(TEST_VAULT, 'decisions'), { recursive: true });
    fs.mkdirSync(path.join(TEST_VAULT, 'patterns'), { recursive: true });

    const result = wiki.writeSessionSynthesis({ vaultPath: TEST_VAULT, since: 24 });
    assert.ok(result.path.includes('wiki/syntheses/'));
    assert.ok(result.path.endsWith('.md'));
    assert.ok(result.noteCount >= 3);
    const content = fs.readFileSync(result.path, 'utf-8');
    assert.ok(content.includes('Session synthesis'));
    assert.ok(content.includes('Decision 1'));
    assert.ok(content.includes('Pattern 1'));
    assert.ok(content.includes('Clip 1'));
  } finally {
    teardownVault();
  }
});

test('writeSessionSynthesis: label customisation', () => {
  setupVault();
  try {
    writeRaw('raw/clips/a.md', { title: 'A', type: 'clip' }, 'body');
    const result = wiki.writeSessionSynthesis({ vaultPath: TEST_VAULT, since: 24, label: 'pre-compact' });
    assert.ok(path.basename(result.path).includes('pre-compact'));
  } finally {
    teardownVault();
  }
});

// ---------------------------------------------------------------------------
// ensureSchema
// ---------------------------------------------------------------------------

console.log('\n── wiki-layer: ensureSchema ──');

test('ensureSchema: copies bundled schema when vault has none', () => {
  setupVault();
  try {
    const r = wiki.ensureSchema(TEST_VAULT);
    if (r.missingBundled) {
      // bundled schema.md must exist in the repo
      assert.fail('bundled templates/schema.md is missing');
    }
    assert.strictEqual(r.created, true);
    assert.ok(fs.existsSync(path.join(TEST_VAULT, 'schema.md')));
  } finally {
    teardownVault();
  }
});

test('ensureSchema: does not overwrite existing schema', () => {
  setupVault();
  try {
    fs.writeFileSync(path.join(TEST_VAULT, 'schema.md'), '# Custom');
    const r = wiki.ensureSchema(TEST_VAULT);
    assert.strictEqual(r.created, false);
    const content = fs.readFileSync(path.join(TEST_VAULT, 'schema.md'), 'utf-8');
    assert.strictEqual(content, '# Custom');
  } finally {
    teardownVault();
  }
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n${'═'.repeat(50)}`);
console.log(`wiki tests: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${'═'.repeat(50)}`);
process.exit(failed > 0 ? 1 : 0);
