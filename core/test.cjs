/**
 * test.cjs — Comprehensive test suite for Nelson Knowledge Engine v6
 */

'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const fileLayer = require('./file-layer.cjs');
const GraphLayer = require('./graph-layer.cjs');
const SearchLayer = require('./search-layer.cjs');
const KnowledgeEngine = require('./engine.cjs');

const TEST_DIR = path.join(__dirname, '.test-vault');
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

// ---------------------------------------------------------------------------
// Setup: create test vault
// ---------------------------------------------------------------------------

function setupVault() {
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
  fs.mkdirSync(TEST_DIR, { recursive: true });
  fs.mkdirSync(path.join(TEST_DIR, 'subfolder'), { recursive: true });

  fs.writeFileSync(path.join(TEST_DIR, 'hub.md'),
    '---\ntitle: Hub Note\ntags: [core, important]\ntype: index\npublished: true\ncount: 42\n---\n# Hub Note\nCentral hub. See [[Alpha]] and [[Beta]] and [[Charlie]].');

  fs.writeFileSync(path.join(TEST_DIR, 'alpha.md'),
    '---\ntitle: Alpha\ntags: [research]\n---\n# Alpha\nKnowledge graphs and link analysis.\nLinks to [[Hub Note]] and [[Beta]].');

  fs.writeFileSync(path.join(TEST_DIR, 'beta.md'),
    '# Beta\nSearch algorithms and ranking.\nLinks to [[Hub Note|the hub]] and [[Alpha]].');

  fs.writeFileSync(path.join(TEST_DIR, 'charlie.md'),
    '# Charlie\nLinked only from hub. See [[Delta#section]].');

  fs.writeFileSync(path.join(TEST_DIR, 'subfolder/delta.md'),
    '# Delta\nA note in a subfolder. Linked from Charlie.');

  fs.writeFileSync(path.join(TEST_DIR, 'orphan.md'),
    '# Orphan\nNo links at all. Completely isolated.');

  fs.writeFileSync(path.join(TEST_DIR, 'no-frontmatter.md'),
    '# No Frontmatter\nThis note has no YAML frontmatter block.');

  fs.writeFileSync(path.join(TEST_DIR, 'empty.md'), '');
}

function teardownVault() {
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// file-layer tests
// ---------------------------------------------------------------------------

console.log('\n── file-layer.cjs ──');

test('parseFrontmatter: extracts key-value pairs', () => {
  const { frontmatter, body } = fileLayer.parseFrontmatter('---\ntitle: Test\ntags: [a, b]\n---\nBody here');
  assert.strictEqual(frontmatter.title, 'Test');
  assert.deepStrictEqual(frontmatter.tags, ['a', 'b']);
  assert.strictEqual(body, 'Body here');
});

test('parseFrontmatter: handles booleans and numbers', () => {
  const { frontmatter } = fileLayer.parseFrontmatter('---\npublished: true\ncount: 42\nratio: 3.14\n---\n');
  assert.strictEqual(frontmatter.published, true);
  assert.strictEqual(frontmatter.count, 42);
  assert.strictEqual(frontmatter.ratio, 3.14);
});

test('parseFrontmatter: handles no frontmatter', () => {
  const { frontmatter, body } = fileLayer.parseFrontmatter('# Just a heading\nNo frontmatter.');
  assert.deepStrictEqual(frontmatter, {});
  assert.ok(body.startsWith('# Just'));
});

test('parseFrontmatter: handles null/undefined input', () => {
  assert.deepStrictEqual(fileLayer.parseFrontmatter(null).frontmatter, {});
  assert.deepStrictEqual(fileLayer.parseFrontmatter(undefined).frontmatter, {});
  assert.deepStrictEqual(fileLayer.parseFrontmatter('').frontmatter, {});
});

test('parseFrontmatter: handles list items', () => {
  const { frontmatter } = fileLayer.parseFrontmatter('---\ntags:\n  - alpha\n  - beta\n---\n');
  assert.deepStrictEqual(frontmatter.tags, ['alpha', 'beta']);
});

test('parseWikilinks: extracts simple links', () => {
  const links = fileLayer.parseWikilinks('See [[Note A]] and [[Note B]].');
  assert.strictEqual(links.length, 2);
  assert.strictEqual(links[0].target, 'Note A');
  assert.strictEqual(links[0].alias, null);
});

test('parseWikilinks: handles aliases', () => {
  const links = fileLayer.parseWikilinks('See [[Target|display text]].');
  assert.strictEqual(links[0].target, 'Target');
  assert.strictEqual(links[0].alias, 'display text');
});

test('parseWikilinks: handles heading and block refs', () => {
  const links = fileLayer.parseWikilinks('[[Note#heading]] and [[Note^blockid]]');
  assert.strictEqual(links[0].target, 'Note#heading');
  assert.strictEqual(links[1].target, 'Note^blockid');
});

test('parseWikilinks: handles empty/null input', () => {
  assert.deepStrictEqual(fileLayer.parseWikilinks(null), []);
  assert.deepStrictEqual(fileLayer.parseWikilinks(''), []);
  assert.deepStrictEqual(fileLayer.parseWikilinks('no links here'), []);
});

test('listNotes: finds all .md files recursively including subfolders', () => {
  setupVault();
  const notes = fileLayer.listNotes(TEST_DIR);
  // hub, alpha, beta, charlie, subfolder/delta, orphan, no-frontmatter, empty = 8
  assert.strictEqual(notes.length, 8);
  assert.ok(notes.some(n => n.includes('subfolder')));
  teardownVault();
});

test('readNote: parses title from frontmatter', () => {
  setupVault();
  const note = fileLayer.readNote(path.join(TEST_DIR, 'hub.md'));
  assert.strictEqual(note.title, 'Hub Note');
  assert.ok(note.wordCount > 0);
  assert.strictEqual(note.wikilinks.length, 3);
  teardownVault();
});

test('readNote: falls back to H1 for title', () => {
  setupVault();
  const note = fileLayer.readNote(path.join(TEST_DIR, 'beta.md'));
  assert.strictEqual(note.title, 'Beta');
  teardownVault();
});

test('readNote: falls back to filename for title', () => {
  setupVault();
  const note = fileLayer.readNote(path.join(TEST_DIR, 'empty.md'));
  assert.strictEqual(note.title, 'empty');
  teardownVault();
});

test('writeNote: rejects empty content', () => {
  assert.throws(() => fileLayer.writeNote('/tmp/test-empty.md', ''), /content must not be empty/);
  assert.throws(() => fileLayer.writeNote('/tmp/test-empty.md', '   '), /content must not be empty/);
  assert.throws(() => fileLayer.writeNote('/tmp/test-empty.md', null), /content must not be empty/);
  assert.throws(() => fileLayer.writeNote('/tmp/test-empty.md', undefined), /content must not be empty/);
});

test('writeNote is atomic — no partial writes', () => {
  setupVault();
  const p = path.join(TEST_DIR, 'atomic-test.md');
  fileLayer.writeNote(p, '# Atomic\nThis write should be atomic.');
  assert.ok(fs.existsSync(p), 'File should exist after atomic write');
  const content = fs.readFileSync(p, 'utf-8');
  assert.strictEqual(content, '# Atomic\nThis write should be atomic.');
  // Verify no .tmp files remain
  const dir = fs.readdirSync(TEST_DIR);
  const tmpFiles = dir.filter(f => f.includes('.tmp.'));
  assert.strictEqual(tmpFiles.length, 0, 'No .tmp files should remain after successful write');
  teardownVault();
});

test('writeNote: creates file and parent dirs', () => {
  setupVault();
  const p = path.join(TEST_DIR, 'new-dir', 'new-note.md');
  fileLayer.writeNote(p, '# New\nHello');
  assert.ok(fs.existsSync(p));
  const note = fileLayer.readNote(p);
  assert.strictEqual(note.title, 'New');
  teardownVault();
});

// ---------------------------------------------------------------------------
// graph-layer tests
// ---------------------------------------------------------------------------

console.log('\n── graph-layer.cjs ──');

test('buildGraph: creates nodes and edges', () => {
  setupVault();
  const graph = new GraphLayer(':memory:');
  const result = graph.buildGraph(TEST_DIR);
  assert.strictEqual(result.nodeCount, 8);
  assert.ok(result.edgeCount > 0);
  graph.close();
  teardownVault();
});

test('getBacklinks: returns linking sources', () => {
  setupVault();
  const graph = new GraphLayer(':memory:');
  graph.buildGraph(TEST_DIR);
  const backlinks = graph.getBacklinks(path.join(TEST_DIR, 'hub.md'));
  assert.ok(backlinks.length >= 2); // alpha and beta link to hub
  graph.close();
  teardownVault();
});

test('getOutlinks: returns link targets', () => {
  setupVault();
  const graph = new GraphLayer(':memory:');
  graph.buildGraph(TEST_DIR);
  const outlinks = graph.getOutlinks(path.join(TEST_DIR, 'hub.md'));
  assert.strictEqual(outlinks.length, 3); // alpha, beta, charlie
  graph.close();
  teardownVault();
});

test('findHubs: returns notes sorted by backlink count', () => {
  setupVault();
  const graph = new GraphLayer(':memory:');
  graph.buildGraph(TEST_DIR);
  const hubs = graph.findHubs(3);
  assert.ok(hubs.length > 0);
  assert.ok(hubs[0].backlink_count >= hubs[1].backlink_count);
  graph.close();
  teardownVault();
});

test('shortestPath: finds BFS path', () => {
  setupVault();
  const graph = new GraphLayer(':memory:');
  graph.buildGraph(TEST_DIR);
  const sp = graph.shortestPath(
    path.join(TEST_DIR, 'alpha.md'),
    path.join(TEST_DIR, 'charlie.md')
  );
  assert.ok(sp !== null);
  assert.ok(sp.length >= 2);
  assert.strictEqual(sp[0].title, 'Alpha');
  graph.close();
  teardownVault();
});

test('shortestPath: returns null for unreachable', () => {
  setupVault();
  const graph = new GraphLayer(':memory:');
  graph.buildGraph(TEST_DIR);
  const sp = graph.shortestPath(
    path.join(TEST_DIR, 'alpha.md'),
    path.join(TEST_DIR, 'orphan.md')
  );
  assert.strictEqual(sp, null);
  graph.close();
  teardownVault();
});

test('shortestPath: returns single node for self', () => {
  setupVault();
  const graph = new GraphLayer(':memory:');
  graph.buildGraph(TEST_DIR);
  const sp = graph.shortestPath(
    path.join(TEST_DIR, 'alpha.md'),
    path.join(TEST_DIR, 'alpha.md')
  );
  assert.ok(sp !== null);
  assert.strictEqual(sp.length, 1);
  graph.close();
  teardownVault();
});

test('getRelated: returns nearby nodes', () => {
  setupVault();
  const graph = new GraphLayer(':memory:');
  graph.buildGraph(TEST_DIR);
  const related = graph.getRelated(path.join(TEST_DIR, 'alpha.md'), 2);
  assert.ok(related.length > 0);
  assert.ok(related.every(r => r.distance <= 2));
  graph.close();
  teardownVault();
});

test('getOrphans: finds isolated notes', () => {
  setupVault();
  const graph = new GraphLayer(':memory:');
  graph.buildGraph(TEST_DIR);
  const orphans = graph.getOrphans();
  const orphanTitles = orphans.map(o => o.title);
  assert.ok(orphanTitles.includes('Orphan'));
  graph.close();
  teardownVault();
});

test('getClusters: detects connected components', () => {
  setupVault();
  const graph = new GraphLayer(':memory:');
  graph.buildGraph(TEST_DIR);
  const clusters = graph.getClusters();
  assert.ok(clusters.length >= 2); // at least main cluster + orphans
  assert.ok(clusters[0].length > clusters[clusters.length - 1].length);
  graph.close();
  teardownVault();
});

test('context_summary is generated during build', () => {
  setupVault();
  const graph = new GraphLayer(':memory:');
  graph.buildGraph(TEST_DIR);
  const hubNode = graph.getNodeByPath(path.join(TEST_DIR, 'hub.md'));
  assert.ok(hubNode.context_summary, 'hub should have a context_summary');
  assert.ok(hubNode.context_summary.length > 0, 'context_summary should not be empty');
  // hub.md has type: index, tags: [core, important] — verify they appear
  assert.ok(hubNode.context_summary.includes('index'), 'context_summary should include type');
  assert.ok(hubNode.context_summary.includes('core'), 'context_summary should include tags');
  // Check a note without frontmatter still gets a summary from body
  const noFmNode = graph.getNodeByPath(path.join(TEST_DIR, 'no-frontmatter.md'));
  assert.ok(noFmNode.context_summary.length > 0, 'note without frontmatter should still get a body-based summary');
  graph.close();
  teardownVault();
});

test('schema version table is created', () => {
  setupVault();
  const graph = new GraphLayer(':memory:');
  graph.buildGraph(TEST_DIR);
  const row = graph.db.prepare('SELECT version FROM schema_version ORDER BY version DESC LIMIT 1').get();
  assert.ok(row, 'schema_version table should exist with a row');
  assert.strictEqual(row.version, 2, 'schema version should be 2');
  graph.close();
  teardownVault();
});

test('getBacklinkCount: returns count for node', () => {
  setupVault();
  const graph = new GraphLayer(':memory:');
  graph.buildGraph(TEST_DIR);
  const node = graph.getNodeByPath(path.join(TEST_DIR, 'hub.md'));
  const count = graph.getBacklinkCount(node.id);
  assert.ok(count >= 2);
  graph.close();
  teardownVault();
});

// ---------------------------------------------------------------------------
// search-layer tests
// ---------------------------------------------------------------------------

console.log('\n── search-layer.cjs ──');

test('search: finds notes by content', () => {
  setupVault();
  const graph = new GraphLayer(':memory:');
  graph.buildGraph(TEST_DIR);
  const search = new SearchLayer(graph.db, graph);
  search.indexVault(TEST_DIR);
  const results = search.search('knowledge');
  assert.ok(results.length > 0);
  graph.close();
  teardownVault();
});

test('search: applies graph boost', () => {
  setupVault();
  const graph = new GraphLayer(':memory:');
  graph.buildGraph(TEST_DIR);
  const search = new SearchLayer(graph.db, graph);
  search.indexVault(TEST_DIR);
  const results = search.search('hub');
  assert.ok(results.length > 0);
  assert.ok(results[0].backlinkCount !== undefined);
  assert.ok(results[0].boostedScore !== undefined);
  graph.close();
  teardownVault();
});

test('search: handles empty query', () => {
  setupVault();
  const graph = new GraphLayer(':memory:');
  graph.buildGraph(TEST_DIR);
  const search = new SearchLayer(graph.db, graph);
  search.indexVault(TEST_DIR);
  assert.deepStrictEqual(search.search(''), []);
  assert.deepStrictEqual(search.search(null), []);
  graph.close();
  teardownVault();
});

test('searchByTag: finds tagged notes', () => {
  setupVault();
  const graph = new GraphLayer(':memory:');
  graph.buildGraph(TEST_DIR);
  const search = new SearchLayer(graph.db, graph);
  search.indexVault(TEST_DIR);
  const results = search.searchByTag('research');
  assert.ok(results.length > 0);
  graph.close();
  teardownVault();
});

test('tieredSearch: returns L0, L1, L2', () => {
  setupVault();
  const graph = new GraphLayer(':memory:');
  graph.buildGraph(TEST_DIR);
  const search = new SearchLayer(graph.db, graph);
  search.indexVault(TEST_DIR);
  const tiered = search.tieredSearch('algorithms');
  assert.ok(tiered.L0);
  assert.ok(tiered.L1);
  assert.ok(tiered.L2);
  assert.ok(tiered.L0.length > 0);
  assert.ok(tiered.L1[0].summary !== undefined);
  assert.ok(tiered.L2[0].content !== undefined);
  assert.ok(tiered.L2[0].path !== undefined);
  graph.close();
  teardownVault();
});

// ---------------------------------------------------------------------------
// engine tests
// ---------------------------------------------------------------------------

console.log('\n── engine.cjs ──');

test('KnowledgeEngine: requires vaultPath', () => {
  assert.throws(() => new KnowledgeEngine({}), /vaultPath/);
  assert.throws(() => new KnowledgeEngine(), /vaultPath|Cannot read/);
});

test('KnowledgeEngine: build + getStats', () => {
  setupVault();
  const engine = new KnowledgeEngine({ vaultPath: TEST_DIR });
  const result = engine.build();
  assert.strictEqual(result.nodeCount, 8);
  const stats = engine.getStats();
  assert.strictEqual(stats.nodeCount, 8);
  assert.ok(stats.edgeCount > 0);
  assert.ok(stats.orphanCount > 0);
  assert.ok(stats.clusterCount >= 2);
  engine.close();
  teardownVault();
});

test('KnowledgeEngine: searchNotes delegates correctly', () => {
  setupVault();
  const engine = new KnowledgeEngine({ vaultPath: TEST_DIR });
  engine.build();
  const results = engine.searchNotes('knowledge');
  assert.ok(results.length > 0);
  engine.close();
  teardownVault();
});

test('KnowledgeEngine: rebuild clears and rebuilds', () => {
  setupVault();
  const engine = new KnowledgeEngine({ vaultPath: TEST_DIR });
  engine.build();
  const stats1 = engine.getStats();
  engine.rebuild();
  const stats2 = engine.getStats();
  assert.strictEqual(stats1.nodeCount, stats2.nodeCount);
  engine.close();
  teardownVault();
});

test('KnowledgeEngine: readNote with vault-relative path', () => {
  setupVault();
  const engine = new KnowledgeEngine({ vaultPath: TEST_DIR });
  engine.build();
  const note = engine.readNote(path.join(TEST_DIR, 'hub.md'));
  assert.strictEqual(note.title, 'Hub Note');
  engine.close();
  teardownVault();
});

test('KnowledgeEngine: incrementalBuild returns stats on first call', () => {
  setupVault();
  const engine = new KnowledgeEngine({ vaultPath: TEST_DIR });
  engine.build();
  const result = engine.incrementalBuild();
  assert.ok(result.nodeCount >= 8, 'Should have nodes');
  assert.ok(typeof result.edgeCount === 'number');
  assert.ok(['none', 'incremental', 'full'].includes(result.mode), 'mode should be valid');
  assert.ok(typeof result.changedFiles === 'number');
  engine.close();
  teardownVault();
});

test('KnowledgeEngine: incrementalBuild returns mode=none when nothing changed', () => {
  setupVault();
  const engine = new KnowledgeEngine({ vaultPath: TEST_DIR });
  engine.build();
  // First incremental after build — files already indexed, nothing changed
  const result = engine.incrementalBuild();
  assert.strictEqual(result.mode, 'none', 'Should detect no changes');
  assert.strictEqual(result.changedFiles, 0);
  engine.close();
  teardownVault();
});

test('KnowledgeEngine: incrementalBuild detects new file', () => {
  setupVault();
  const engine = new KnowledgeEngine({ vaultPath: TEST_DIR });
  engine.build();
  // Add a new file after initial build
  fs.writeFileSync(path.join(TEST_DIR, 'new-note.md'), '# New Note\nFresh content.');
  const result = engine.incrementalBuild();
  assert.ok(result.mode !== 'none', 'Should detect the new file');
  assert.ok(result.changedFiles >= 1);
  engine.close();
  teardownVault();
});

test('KnowledgeEngine: searchWithSnippets returns snippets', () => {
  setupVault();
  const engine = new KnowledgeEngine({ vaultPath: TEST_DIR });
  engine.build();
  const results = engine.searchWithSnippets('knowledge');
  assert.ok(results.length > 0, 'Should find results');
  assert.ok(Array.isArray(results[0].snippets), 'Should have snippets array');
  assert.ok(results[0].snippets.length > 0, 'Should have at least one snippet');
  assert.ok(typeof results[0].score === 'number', 'Should have score');
  assert.ok(results[0].node, 'Should have node object');
  engine.close();
  teardownVault();
});

test('KnowledgeEngine: searchWithSnippets handles empty query', () => {
  setupVault();
  const engine = new KnowledgeEngine({ vaultPath: TEST_DIR });
  engine.build();
  const results = engine.searchWithSnippets('');
  assert.deepStrictEqual(results, []);
  engine.close();
  teardownVault();
});

test('KnowledgeEngine: getAllTags returns Map with correct counts', () => {
  setupVault();
  const engine = new KnowledgeEngine({ vaultPath: TEST_DIR });
  engine.build();
  const tags = engine.getAllTags();
  assert.ok(tags instanceof Map, 'Should return a Map');
  assert.ok(tags.size > 0, 'Should have tags');
  // hub.md has tags: [core, important], alpha.md has tags: [research]
  assert.strictEqual(tags.get('core'), 1, 'core tag should appear once');
  assert.strictEqual(tags.get('important'), 1, 'important tag should appear once');
  assert.strictEqual(tags.get('research'), 1, 'research tag should appear once');
  engine.close();
  teardownVault();
});

test('KnowledgeEngine: getAllTags returns empty Map for untagged vault', () => {
  const noTagDir = path.join(__dirname, '.test-vault-notags');
  fs.rmSync(noTagDir, { recursive: true, force: true });
  fs.mkdirSync(noTagDir, { recursive: true });
  fs.writeFileSync(path.join(noTagDir, 'plain.md'), '# Plain\nNo tags here.');
  const engine = new KnowledgeEngine({ vaultPath: noTagDir });
  engine.build();
  const tags = engine.getAllTags();
  assert.ok(tags instanceof Map);
  assert.strictEqual(tags.size, 0);
  engine.close();
  fs.rmSync(noTagDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Security: Path traversal tests
// ---------------------------------------------------------------------------

console.log('\n── security: path traversal ──');

test('readNote: rejects path traversal via ../..', () => {
  setupVault();
  const engine = new KnowledgeEngine({ vaultPath: TEST_DIR });
  engine.build();
  assert.throws(() => engine.readNote(path.join(TEST_DIR, '../../etc/passwd')), /escapes vault/);
  engine.close();
  teardownVault();
});

test('readNote: rejects path traversal via relative ../', () => {
  setupVault();
  const engine = new KnowledgeEngine({ vaultPath: TEST_DIR });
  engine.build();
  assert.throws(() => engine.readNote('../../../.bashrc'), /escapes vault/);
  engine.close();
  teardownVault();
});

test('writeNote: rejects path traversal via ../..', () => {
  setupVault();
  const engine = new KnowledgeEngine({ vaultPath: TEST_DIR });
  engine.build();
  assert.throws(
    () => engine.writeNote(path.join(TEST_DIR, '../../../tmp/evil.md'), '# Evil'),
    /escapes vault/
  );
  engine.close();
  teardownVault();
});

test('writeNote: rejects path traversal via relative ../', () => {
  setupVault();
  const engine = new KnowledgeEngine({ vaultPath: TEST_DIR });
  engine.build();
  assert.throws(
    () => engine.writeNote('../../../tmp/evil.md', '# Evil'),
    /escapes vault/
  );
  engine.close();
  teardownVault();
});

test('readNote: allows valid vault paths', () => {
  setupVault();
  const engine = new KnowledgeEngine({ vaultPath: TEST_DIR });
  engine.build();
  const note = engine.readNote(path.join(TEST_DIR, 'hub.md'));
  assert.strictEqual(note.title, 'Hub Note');
  engine.close();
  teardownVault();
});

test('writeNote: allows valid vault paths', () => {
  setupVault();
  const engine = new KnowledgeEngine({ vaultPath: TEST_DIR });
  engine.build();
  engine.writeNote(path.join(TEST_DIR, 'safe-note.md'), '# Safe\nContent');
  assert.ok(fs.existsSync(path.join(TEST_DIR, 'safe-note.md')));
  engine.close();
  teardownVault();
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n${'═'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${'═'.repeat(50)}`);

process.exit(failed > 0 ? 1 : 0);
