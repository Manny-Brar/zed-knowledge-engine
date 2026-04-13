/**
 * test-autolink.cjs — ZED v8.1 auto-wikilink injection test suite
 */

'use strict';

const assert = require('assert');
const autolink = require('./autolink.cjs');

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

const TITLES = [
  { title: 'Auth Strategy', path: '/vault/decisions/auth.md' },
  { title: 'API Design', path: '/vault/decisions/api.md' },
  { title: 'Token Pattern', path: '/vault/patterns/token.md' },
  { title: 'ZED Knowledge Engine', path: '/vault/architecture/zed.md' },
  { title: 'Auth', path: '/vault/notes/auth-note.md' }, // Short — should be skipped (< 4 chars)
  { title: 'Hub', path: '/vault/notes/hub.md' },         // Also short
];

// ---------------------------------------------------------------------------
console.log('\n── autolink: basic injection ──');

test('injects wikilink for a mentioned title', () => {
  const { content, injected } = autolink.injectWikilinks(
    '---\ntitle: "Test"\n---\n\nWe chose the Auth Strategy for this project.',
    TITLES
  );
  assert.ok(content.includes('[[Auth Strategy]]'), `expected [[Auth Strategy]], got: ${content}`);
  assert.ok(injected.includes('Auth Strategy'));
});

test('injects multiple titles', () => {
  const { content, injected } = autolink.injectWikilinks(
    '---\ntitle: "Test"\n---\n\nSee Auth Strategy and API Design for context.',
    TITLES
  );
  assert.ok(content.includes('[[Auth Strategy]]'));
  assert.ok(content.includes('[[API Design]]'));
  assert.strictEqual(injected.length, 2);
});

test('case-insensitive matching', () => {
  const { content } = autolink.injectWikilinks(
    '---\ntitle: "T"\n---\n\nThe auth strategy was documented.',
    TITLES
  );
  assert.ok(content.includes('[[auth strategy]]') || content.includes('[[Auth Strategy]]') || /\[\[auth strategy\]\]/i.test(content));
});

// ---------------------------------------------------------------------------
console.log('\n── autolink: skip rules ──');

test('skips titles <= 3 chars', () => {
  const { content, injected } = autolink.injectWikilinks(
    '---\ntitle: "T"\n---\n\nAuth is important. Hub notes help.',
    TITLES
  );
  // "Auth" is 4 chars and IS in the title list, so it should match.
  // But "Hub" is 3 chars and should be skipped.
  assert.ok(!content.includes('[[Hub]]'), 'Hub (3 chars) should be skipped');
});

test('skips already-linked titles', () => {
  const { content, injected } = autolink.injectWikilinks(
    '---\ntitle: "T"\n---\n\nSee [[Auth Strategy]] for details. Auth Strategy is good.',
    TITLES
  );
  // Should NOT double-link: the second "Auth Strategy" stays plain
  const linkCount = (content.match(/\[\[Auth Strategy\]\]/g) || []).length;
  assert.strictEqual(linkCount, 1, 'should not double-link');
  assert.ok(!injected.includes('Auth Strategy'), 'already linked → not in injected list');
});

test('never modifies frontmatter', () => {
  const { content } = autolink.injectWikilinks(
    '---\ntitle: "Auth Strategy Overview"\ntags: [auth, strategy]\n---\n\nBody text.',
    TITLES
  );
  // Frontmatter should be untouched
  assert.ok(content.startsWith('---\ntitle: "Auth Strategy Overview"'));
  assert.ok(!content.match(/---[\s\S]*?\[\[/)); // no wikilinks inside frontmatter
});

test('skips inside fenced code blocks', () => {
  const { content, injected } = autolink.injectWikilinks(
    '---\ntitle: "T"\n---\n\n```\nAuth Strategy is in code\n```\n\nBut Auth Strategy here should link.',
    TITLES
  );
  // Count: the one in code should be plain, the one outside should be linked
  const inCode = content.match(/```[\s\S]*?```/)[0];
  assert.ok(!inCode.includes('[['), 'no wikilinks inside code block');
  assert.ok(injected.includes('Auth Strategy'), 'should link the one outside code');
});

test('skips inside inline code', () => {
  const { content } = autolink.injectWikilinks(
    '---\ntitle: "T"\n---\n\nUse `Auth Strategy` as a reference. Auth Strategy applies here.',
    TITLES
  );
  assert.ok(content.includes('`Auth Strategy`'), 'inline code preserved');
});

test('skips inside URLs', () => {
  const { content, injected } = autolink.injectWikilinks(
    '---\ntitle: "T"\n---\n\nSee https://example.com/Auth-Strategy for more. Auth Strategy is key.',
    TITLES
  );
  // The URL should be untouched; only the plain text should be linked
  assert.ok(content.includes('https://example.com/Auth-Strategy'));
  assert.ok(injected.length <= 1); // may or may not match depending on word boundary
});

test('skips inside markdown links', () => {
  const { content } = autolink.injectWikilinks(
    '---\ntitle: "T"\n---\n\n[Auth Strategy](https://example.com) is documented.',
    TITLES
  );
  assert.ok(content.includes('[Auth Strategy](https://example.com)'), 'markdown link preserved');
});

// ---------------------------------------------------------------------------
console.log('\n── autolink: longest-first ordering ──');

test('longest-first prevents partial matches', () => {
  const titles = [
    { title: 'Auth Strategy', path: '/a' },
    { title: 'Auth', path: '/b' },       // Would match "Auth" in "Auth Strategy" without longest-first
  ];
  // Note: "Auth" is 4 chars so it passes the min length check
  const { content } = autolink.injectWikilinks(
    '---\ntitle: "T"\n---\n\nThe Auth Strategy applies. Auth alone is also relevant.',
    titles
  );
  // "Auth Strategy" should be linked as one unit, not "[[Auth]] Strategy"
  assert.ok(content.includes('[[Auth Strategy]]'), 'should link full "Auth Strategy"');
  assert.ok(!content.includes('[[Auth]] Strategy'), 'should NOT split into [[Auth]] Strategy');
});

// ---------------------------------------------------------------------------
console.log('\n── autolink: whole-word boundary ──');

test('does not match inside longer words', () => {
  const titles = [{ title: 'test', path: '/a' }];
  const { content, injected } = autolink.injectWikilinks(
    '---\ntitle: "T"\n---\n\nThis is a testing scenario with attestation.',
    titles
  );
  // "test" should NOT match inside "testing" or "attestation"
  assert.strictEqual(injected.length, 0, 'should not match inside longer words');
});

test('matches standalone word with punctuation', () => {
  const titles = [{ title: 'Token Pattern', path: '/a' }];
  const { content, injected } = autolink.injectWikilinks(
    '---\ntitle: "T"\n---\n\nThe Token Pattern, as described, works well.',
    titles
  );
  assert.ok(injected.includes('Token Pattern'), 'should match before comma');
});

// ---------------------------------------------------------------------------
console.log('\n── autolink: regex-safe titles ──');

test('handles titles with regex special chars', () => {
  const titles = [{ title: 'C++ Design Patterns', path: '/a' }];
  const { content, injected } = autolink.injectWikilinks(
    '---\ntitle: "T"\n---\n\nSee C++ Design Patterns for reference.',
    titles
  );
  assert.ok(content.includes('[[C++ Design Patterns]]'));
});

test('handles titles with parentheses', () => {
  const titles = [{ title: 'React (Library)', path: '/a' }];
  const { content } = autolink.injectWikilinks(
    '---\ntitle: "T"\n---\n\nWe use React (Library) for the frontend.',
    titles
  );
  assert.ok(content.includes('[[React (Library)]]'));
});

// ---------------------------------------------------------------------------
console.log('\n── autolink: ZED_AUTOLINK=0 ──');

test('disabled via ZED_AUTOLINK=0', () => {
  const saved = process.env.ZED_AUTOLINK;
  process.env.ZED_AUTOLINK = '0';
  try {
    const { content, injected } = autolink.injectWikilinks(
      '---\ntitle: "T"\n---\n\nAuth Strategy should not be linked.',
      TITLES
    );
    assert.strictEqual(injected.length, 0);
    assert.ok(!content.includes('[[Auth Strategy]]'));
  } finally {
    if (saved !== undefined) process.env.ZED_AUTOLINK = saved;
    else delete process.env.ZED_AUTOLINK;
  }
});

// ---------------------------------------------------------------------------
console.log('\n── autolink: selfPath exclusion ──');

test('excludes the note being written from matching', () => {
  const { injected } = autolink.injectWikilinks(
    '---\ntitle: "Auth Strategy"\n---\n\nAuth Strategy is this note.',
    TITLES,
    { selfPath: '/vault/decisions/auth.md' }
  );
  assert.ok(!injected.includes('Auth Strategy'), 'should not self-link');
});

// ---------------------------------------------------------------------------
console.log(`\n${'═'.repeat(50)}`);
console.log(`autolink tests: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${'═'.repeat(50)}`);
process.exit(failed > 0 ? 1 : 0);
