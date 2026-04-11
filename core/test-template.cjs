/**
 * test-template.cjs — ZED v8.0 template-engine test suite
 *
 * Covers the filter registry, tokenizer, variable resolver, template matcher,
 * and full-template rendering. No network; uses jsdom for document-backed
 * selector tests.
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const te = require('./template-engine.cjs');

let passed = 0;
let failed = 0;
const asyncQueue = [];

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

function testAsync(name, fn) {
  asyncQueue.push({ name, fn });
}

async function drainAsyncQueue() {
  for (const { name, fn } of asyncQueue) {
    try {
      await fn();
      passed++;
      console.log(`  ✓ ${name}`);
    } catch (err) {
      failed++;
      console.log(`  ✗ ${name}`);
      console.log(`    ${err.message}`);
      if (process.env.ZED_TEST_STACK) console.log(err.stack);
    }
  }
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

console.log('\n── template-engine: filters ──');

const F = te.FILTERS;

test('trim', () => assert.strictEqual(F.trim('  x  '), 'x'));
test('upper', () => assert.strictEqual(F.upper('abc'), 'ABC'));
test('lower', () => assert.strictEqual(F.lower('AbC'), 'abc'));
test('capitalize', () => assert.strictEqual(F.capitalize('hello'), 'Hello'));
test('title_case', () => assert.strictEqual(F.title_case('hello world'), 'Hello World'));
test('reverse (string)', () => assert.strictEqual(F.reverse('abc'), 'cba'));
test('reverse (array)', () => assert.deepStrictEqual(F.reverse([1, 2, 3]), [3, 2, 1]));
test('length (string)', () => assert.strictEqual(F.length('abc'), 3));
test('length (array)', () => assert.strictEqual(F.length([1, 2, 3]), 3));
test('strip_md', () => {
  const out = F.strip_md('# Title\n\n**bold** and [link](url) and `code`');
  assert.ok(!out.includes('#'));
  assert.ok(!out.includes('*'));
  assert.ok(!out.includes('`'));
});
test('slice (string)', () => assert.strictEqual(F.slice('abcdef', '1', '4'), 'bcd'));
test('slice (array)', () => assert.deepStrictEqual(F.slice([1, 2, 3, 4], '1'), [2, 3, 4]));
test('replace (literal)', () => assert.strictEqual(F.replace('foo bar foo', 'foo', 'BAZ'), 'BAZ bar BAZ'));
test('default (empty → fallback)', () => assert.strictEqual(F.default('', 'fallback'), 'fallback'));
test('default (value → passthrough)', () => assert.strictEqual(F.default('x', 'fallback'), 'x'));
test('split (comma)', () => assert.deepStrictEqual(F.split('a,b,c'), ['a', 'b', 'c']));
test('split (custom sep)', () => assert.deepStrictEqual(F.split('a|b|c', '|'), ['a', 'b', 'c']));
test('join (default sep)', () => assert.strictEqual(F.join(['a', 'b']), 'a, b'));
test('join (custom sep)', () => assert.strictEqual(F.join(['a', 'b'], ' / '), 'a / b'));
test('first', () => assert.strictEqual(F.first(['a', 'b', 'c']), 'a'));
test('last', () => assert.strictEqual(F.last(['a', 'b', 'c']), 'c'));
test('unique', () => assert.deepStrictEqual(F.unique(['a', 'b', 'a', 'c']), ['a', 'b', 'c']));
test('map (x => x.name)', () => {
  const out = F.map([{ name: 'a' }, { name: 'b' }], 'x => x.name');
  assert.deepStrictEqual(out, ['a', 'b']);
});
test('safe_name (strips path chars)', () => {
  assert.strictEqual(F.safe_name('foo/bar:baz'), 'foo-bar-baz');
});
test('safe_filename (slug)', () => {
  assert.strictEqual(F.safe_filename('Hello World!'), 'hello-world');
});
test('date (default YYYY-MM-DD)', () => {
  assert.strictEqual(F.date('2026-04-10T12:00:00Z'), '2026-04-10');
});
test('date (custom format)', () => {
  const out = F.date('2026-04-10T12:34:56Z', 'YYYY/MM/DD');
  assert.ok(out.startsWith('2026/'));
});
test('blockquote', () => {
  assert.strictEqual(F.blockquote('line1\nline2'), '> line1\n> line2');
});
test('callout (default note)', () => {
  assert.ok(F.callout('hello').startsWith('> [!note]'));
});
test('callout (typed warning)', () => {
  assert.ok(F.callout('hello', 'warning').startsWith('> [!warning]'));
});
test('link', () => assert.strictEqual(F.link('text', 'https://x'), '[text](https://x)'));
test('wikilink', () => assert.strictEqual(F.wikilink('Foo'), '[[Foo]]'));
test('wikilink (already wiki)', () => assert.strictEqual(F.wikilink('[[Foo]]'), '[[Foo]]'));
test('image', () => assert.strictEqual(F.image('https://x.jpg', 'alt'), '![alt](https://x.jpg)'));
test('list', () => assert.strictEqual(F.list(['a', 'b']), '- a\n- b'));
test('number', () => assert.strictEqual(F.number('42'), 42));
test('safe (html escape)', () => {
  assert.strictEqual(F.safe('<b>x</b>'), '&lt;b&gt;x&lt;/b&gt;');
});

// ---------------------------------------------------------------------------
// Tokenizer + variable parser
// ---------------------------------------------------------------------------

console.log('\n── template-engine: tokenizer ──');

test('tokenize: plain text', () => {
  const toks = te.tokenize('hello world');
  assert.strictEqual(toks.length, 1);
  assert.strictEqual(toks[0].type, 'text');
});

test('tokenize: single variable', () => {
  const toks = te.tokenize('a {{title}} b');
  assert.strictEqual(toks.length, 3);
  assert.strictEqual(toks[1].type, 'var');
  assert.strictEqual(toks[1].value, 'title');
});

test('tokenize: var with filters', () => {
  const toks = te.tokenize('{{content|trim|slice:0,10}}');
  assert.strictEqual(toks[0].type, 'var');
  assert.strictEqual(toks[0].value, 'content|trim|slice:0,10');
});

test('tokenize: quoted prompt with pipes inside', () => {
  const toks = te.tokenize('{{"summarize | this"}}');
  assert.strictEqual(toks[0].type, 'var');
  assert.strictEqual(toks[0].value, '"summarize | this"');
});

test('tokenize: unterminated → text', () => {
  const toks = te.tokenize('a {{broken');
  assert.strictEqual(toks.length, 2);
  assert.strictEqual(toks[1].type, 'text');
});

test('parseVarExpression: base only', () => {
  const p = te.parseVarExpression('title');
  assert.strictEqual(p.base, 'title');
  assert.strictEqual(p.filters.length, 0);
});

test('parseVarExpression: base + filters with args', () => {
  const p = te.parseVarExpression('content|trim|slice:0,100');
  assert.strictEqual(p.base, 'content');
  assert.strictEqual(p.filters.length, 2);
  assert.strictEqual(p.filters[0].name, 'trim');
  assert.strictEqual(p.filters[1].name, 'slice');
  assert.deepStrictEqual(p.filters[1].args, ['0', '100']);
});

test('parseVarExpression: filter arg with quoted comma', () => {
  const p = te.parseVarExpression('x|replace:"a,b":"c"');
  assert.strictEqual(p.filters[0].name, 'replace');
  assert.deepStrictEqual(p.filters[0].args, ['a,b', 'c']);
});

// ---------------------------------------------------------------------------
// render() — end-to-end
// ---------------------------------------------------------------------------

console.log('\n── template-engine: render ──');

test('render: simple preset substitution', () => {
  const ctx = te.buildContext({
    html: '',
    url: 'https://example.com/a',
    presets: { title: 'Hello' },
  });
  assert.strictEqual(te.render('# {{title}}', ctx), '# Hello');
});

test('render: multiple presets + filter chain', () => {
  const ctx = te.buildContext({
    html: '',
    url: 'https://example.com/a',
    presets: { title: '  Hello World  ', content: 'x'.repeat(100) },
  });
  const out = te.render('{{title|trim|upper}} [{{content|slice:0,5}}]', ctx);
  assert.strictEqual(out, 'HELLO WORLD [xxxxx]');
});

test('render: url/domain presets', () => {
  const ctx = te.buildContext({
    html: '',
    url: 'https://www.example.com/a?x=1',
  });
  const out = te.render('{{domain}}', ctx);
  assert.strictEqual(out, 'example.com');
});

test('render: date preset with format filter', () => {
  const ctx = te.buildContext({ html: '', url: 'https://x/' });
  const out = te.render('{{date|date:"YYYY"}}', ctx);
  assert.match(out, /^\d{4}$/);
});

test('render: missing preset → empty string', () => {
  const ctx = te.buildContext({ html: '', url: 'https://x/' });
  assert.strictEqual(te.render('[{{does_not_exist}}]', ctx), '[]');
});

test('render: default filter', () => {
  const ctx = te.buildContext({ html: '', url: 'https://x/' });
  const out = te.render('{{author|default:"Unknown"}}', ctx);
  assert.strictEqual(out, 'Unknown');
});

// ---------------------------------------------------------------------------
// Document-backed resolvers (selector, meta, schema)
// ---------------------------------------------------------------------------

console.log('\n── template-engine: document resolvers ──');

const DOC_HTML = `<!doctype html>
<html>
<head>
  <title>Sample</title>
  <meta name="author" content="Jane Doe">
  <meta property="og:title" content="OG Sample">
  <script type="application/ld+json">
  {"@context":"https://schema.org","@type":"NewsArticle","author":{"@type":"Person","name":"Ada L."},"datePublished":"2026-04-10","keywords":"ai,llm,harness"}
  </script>
</head>
<body>
  <article class="post">
    <h1 id="main-title">Sample Title</h1>
    <p class="lead">Leading paragraph.</p>
    <img src="https://x/img.png" alt="pic">
  </article>
</body>
</html>`;

function buildDocCtx() {
  let jsdom;
  try { jsdom = require('jsdom'); } catch { return null; }
  const dom = new jsdom.JSDOM(DOC_HTML, { url: 'https://example.com/article' });
  return te.buildContext({
    html: DOC_HTML,
    url: 'https://example.com/article',
    document: dom.window.document,
    presets: { title: 'Sample Title' },
  });
}

test('selector: text content', () => {
  const ctx = buildDocCtx();
  if (!ctx) return;
  assert.strictEqual(te.render('{{selector:.lead}}', ctx), 'Leading paragraph.');
});

test('selector: attribute extraction', () => {
  const ctx = buildDocCtx();
  if (!ctx) return;
  assert.strictEqual(te.render('{{selector:img?src}}', ctx), 'https://x/img.png');
});

test('selectorHtml: raw HTML', () => {
  const ctx = buildDocCtx();
  if (!ctx) return;
  const out = te.render('{{selectorHtml:.post h1}}', ctx);
  assert.strictEqual(out, 'Sample Title');
});

test('meta:name:author', () => {
  const ctx = buildDocCtx();
  if (!ctx) return;
  assert.strictEqual(te.render('{{meta:name:author}}', ctx), 'Jane Doe');
});

test('meta:property:og:title', () => {
  const ctx = buildDocCtx();
  if (!ctx) return;
  assert.strictEqual(te.render('{{meta:property:og:title}}', ctx), 'OG Sample');
});

test('schema: by type + field', () => {
  const ctx = buildDocCtx();
  if (!ctx) return;
  const out = te.render('{{schema:@NewsArticle:datePublished}}', ctx);
  assert.strictEqual(out, '2026-04-10');
});

test('schema: nested author.name', () => {
  const ctx = buildDocCtx();
  if (!ctx) return;
  const out = te.render('{{schema:@NewsArticle:author:name}}', ctx);
  assert.strictEqual(out, 'Ada L.');
});

// ---------------------------------------------------------------------------
// Async render + interpreter callback
// ---------------------------------------------------------------------------

console.log('\n── template-engine: renderAsync / interpreter ──');

testAsync('renderAsync: simple preset', async () => {
  const ctx = te.buildContext({ html: '', url: 'https://x/', presets: { title: 'T' } });
  const out = await te.renderAsync('{{title}}', ctx);
  assert.strictEqual(out, 'T');
});

testAsync('renderAsync: interpreter prompt gets called', async () => {
  let seen = null;
  const ctx = te.buildContext({
    html: '',
    url: 'https://x/',
    presets: { title: 'T' },
    interpret: async (prompt) => {
      seen = prompt;
      return 'INTERPRETED';
    },
  });
  const out = await te.renderAsync('prefix {{"what is this?"}} suffix', ctx);
  assert.strictEqual(seen, 'what is this?');
  assert.strictEqual(out, 'prefix INTERPRETED suffix');
});

testAsync('renderAsync: interpreter batching (same prompt cached)', async () => {
  let calls = 0;
  const ctx = te.buildContext({
    html: '',
    url: 'https://x/',
    interpret: async () => { calls++; return 'X'; },
  });
  await te.renderAsync('{{"p"}} {{"p"}} {{"p"}}', ctx);
  assert.strictEqual(calls, 1);
});

testAsync('renderAsync: no interpret → empty string', async () => {
  const ctx = te.buildContext({ html: '', url: 'https://x/' });
  const out = await te.renderAsync('[{{"prompt"}}]', ctx);
  assert.strictEqual(out, '[]');
});

// ---------------------------------------------------------------------------
// Template matching + full renderTemplate
// ---------------------------------------------------------------------------

console.log('\n── template-engine: matchTemplate + renderTemplate ──');

const TEMPLATES = [
  {
    name: 'anthropic-docs',
    behavior: 'create',
    triggers: ['https://docs.claude.com/', 'https://www.anthropic.com/engineering'],
    noteNameFormat: '{{title|safe_filename}}',
    path: 'raw/clips/anthropic',
    properties: [
      { name: 'title', value: '{{title}}', type: 'text' },
      { name: 'source', value: '{{url}}', type: 'text' },
    ],
    noteContentFormat: '# {{title}}\n\nSource: {{url}}',
  },
  {
    name: 'generic-article',
    behavior: 'create',
    triggers: ['/.*/'],
    noteNameFormat: '{{title|safe_filename}}',
    path: 'raw/clips',
    properties: [],
    noteContentFormat: '# {{title}}',
  },
];

test('matchTemplate: prefix match', () => {
  const tpl = te.matchTemplate(TEMPLATES, 'https://docs.claude.com/foo', null);
  assert.ok(tpl);
  assert.strictEqual(tpl.name, 'anthropic-docs');
});

test('matchTemplate: regex fallback', () => {
  const tpl = te.matchTemplate(TEMPLATES, 'https://medium.com/@author/story', null);
  assert.ok(tpl);
  assert.strictEqual(tpl.name, 'generic-article');
});

test('matchTemplate: no match', () => {
  const bareList = [{ name: 'n', triggers: ['https://never.example/'] }];
  const tpl = te.matchTemplate(bareList, 'https://other.com/', null);
  assert.strictEqual(tpl, null);
});

testAsync('renderTemplate: full template → noteName/path/content', async () => {
  const ctx = te.buildContext({
    html: '',
    url: 'https://docs.claude.com/skills',
    presets: { title: 'Claude Skills' },
  });
  const out = await te.renderTemplate(TEMPLATES[0], ctx);
  assert.strictEqual(out.noteName, 'claude-skills');
  assert.strictEqual(out.pathDir, 'raw/clips/anthropic');
  assert.ok(out.content.includes('Claude Skills'));
  assert.strictEqual(out.behavior, 'create');
  assert.strictEqual(out.properties.length, 2);
  assert.strictEqual(out.properties[0].value, 'Claude Skills');
  assert.strictEqual(out.properties[1].value, 'https://docs.claude.com/skills');
});

// ---------------------------------------------------------------------------
// Template loading from disk
// ---------------------------------------------------------------------------

console.log('\n── template-engine: loadTemplates ──');

test('loadTemplates: reads *.json from a directory', () => {
  const dir = path.join(__dirname, '.test-templates');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'a.json'), JSON.stringify({ name: 'a', triggers: [] }));
  fs.writeFileSync(path.join(dir, 'b.json'), JSON.stringify({ name: 'b', triggers: [] }));
  fs.writeFileSync(path.join(dir, 'ignore.txt'), 'nope');
  const out = te.loadTemplates(dir);
  assert.strictEqual(out.length, 2);
  assert.ok(out.some((t) => t.name === 'a'));
  assert.ok(out.some((t) => t.name === 'b'));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('loadTemplates: missing directory → empty array', () => {
  const out = te.loadTemplates(path.join(__dirname, '.does-not-exist'));
  assert.deepStrictEqual(out, []);
});

test('loadTemplates: malformed JSON is skipped', () => {
  const dir = path.join(__dirname, '.test-templates-bad');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'good.json'), JSON.stringify({ name: 'good' }));
  fs.writeFileSync(path.join(dir, 'bad.json'), '{not json');
  const out = te.loadTemplates(dir);
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].name, 'good');
  fs.rmSync(dir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

(async () => {
  await drainAsyncQueue();
  console.log(`\n${'═'.repeat(50)}`);
  console.log(`template tests: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log(`${'═'.repeat(50)}`);
  process.exit(failed > 0 ? 1 : 0);
})();
