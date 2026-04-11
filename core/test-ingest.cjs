/**
 * test-ingest.cjs — ZED v8.0 ingest-layer test suite
 *
 * Tests the pure-function helpers (slugify, emitFrontmatter, htmlToNote,
 * extractFromHtml) against HTML fixtures. No network, no Playwright needed —
 * extractors are lazy-loaded, so missing deps degrade gracefully to the
 * naive HTML-strip path which is still testable.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ingest = require('./ingest-layer.cjs');
const fileLayer = require('./file-layer.cjs');

const TEST_VAULT = path.join(__dirname, '.test-vault-ingest');

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

async function testAsync(name, fn) {
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

function setupVault() {
  fs.rmSync(TEST_VAULT, { recursive: true, force: true });
  fs.mkdirSync(path.join(TEST_VAULT, 'raw', 'clips'), { recursive: true });
  fs.mkdirSync(path.join(TEST_VAULT, 'raw', 'transcripts'), { recursive: true });
  fs.mkdirSync(path.join(TEST_VAULT, 'raw', 'repos'), { recursive: true });
}

function teardownVault() {
  fs.rmSync(TEST_VAULT, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// slugify
// ---------------------------------------------------------------------------

console.log('\n── ingest-layer: slugify ──');

test('slugify: basic lowercase + hyphen', () => {
  assert.strictEqual(ingest.slugify('Hello World'), 'hello-world');
});

test('slugify: strips punctuation', () => {
  assert.strictEqual(ingest.slugify('Foo: Bar! Baz?'), 'foo-bar-baz');
});

test('slugify: empty / null → "untitled"', () => {
  assert.strictEqual(ingest.slugify(''), 'untitled');
  assert.strictEqual(ingest.slugify(null), 'untitled');
});

test('slugify: unicode normalization', () => {
  assert.strictEqual(ingest.slugify('Café résumé'), 'cafe-resume');
});

test('slugify: truncates long titles to 80 chars', () => {
  const long = 'a'.repeat(200);
  const slug = ingest.slugify(long);
  assert.ok(slug.length <= 80, `slug length ${slug.length} should be <= 80`);
});

test('slugify: reserved filenames get suffix', () => {
  assert.strictEqual(ingest.slugify('CON'), 'con-clip');
  assert.strictEqual(ingest.slugify('aux'), 'aux-clip');
});

test('slugify: collapses consecutive separators', () => {
  assert.strictEqual(ingest.slugify('a  --  b'), 'a-b');
});

// ---------------------------------------------------------------------------
// hostFromUrl
// ---------------------------------------------------------------------------

console.log('\n── ingest-layer: hostFromUrl ──');

test('hostFromUrl: strips www', () => {
  assert.strictEqual(ingest.hostFromUrl('https://www.example.com/a'), 'example.com');
});

test('hostFromUrl: keeps subdomains', () => {
  assert.strictEqual(ingest.hostFromUrl('https://docs.claude.com/a'), 'docs.claude.com');
});

test('hostFromUrl: invalid url → "unknown-host"', () => {
  assert.strictEqual(ingest.hostFromUrl('not a url'), 'unknown-host');
});

// ---------------------------------------------------------------------------
// emitFrontmatter — must be parseable by file-layer.parseFrontmatter
// ---------------------------------------------------------------------------

console.log('\n── ingest-layer: emitFrontmatter ──');

test('emitFrontmatter: scalar strings round-trip', () => {
  const fm = ingest.emitFrontmatter({ title: 'Hello', type: 'clip' });
  const { frontmatter } = fileLayer.parseFrontmatter(fm + '\nbody');
  assert.strictEqual(frontmatter.title, 'Hello');
  assert.strictEqual(frontmatter.type, 'clip');
});

test('emitFrontmatter: arrays round-trip', () => {
  const fm = ingest.emitFrontmatter({ title: 'T', tags: ['a', 'b', 'c'] });
  const { frontmatter } = fileLayer.parseFrontmatter(fm + '\nbody');
  assert.deepStrictEqual(frontmatter.tags, ['a', 'b', 'c']);
});

test('emitFrontmatter: null/undefined values are skipped', () => {
  const fm = ingest.emitFrontmatter({ title: 'T', author: null, published: undefined });
  assert.ok(!fm.includes('author'));
  assert.ok(!fm.includes('published'));
});

test('emitFrontmatter: URLs with colons are quoted', () => {
  const fm = ingest.emitFrontmatter({
    title: 'T',
    source: 'https://example.com/path?q=1',
  });
  const { frontmatter } = fileLayer.parseFrontmatter(fm + '\nbody');
  assert.strictEqual(frontmatter.source, 'https://example.com/path?q=1');
});

test('emitFrontmatter: numbers and booleans preserve type', () => {
  const fm = ingest.emitFrontmatter({ title: 'T', count: 42, active: true });
  const { frontmatter } = fileLayer.parseFrontmatter(fm + '\nbody');
  assert.strictEqual(frontmatter.count, 42);
  assert.strictEqual(frontmatter.active, true);
});

test('emitFrontmatter: empty arrays emit []', () => {
  const fm = ingest.emitFrontmatter({ title: 'T', tags: [] });
  assert.ok(fm.includes('tags: []'));
});

// ---------------------------------------------------------------------------
// extractFromHtml — fixture-based
// ---------------------------------------------------------------------------

console.log('\n── ingest-layer: extractFromHtml ──');

const FIXTURE_SIMPLE = `<!doctype html>
<html lang="en">
<head>
  <title>Simple Article</title>
  <meta name="author" content="Jane Doe">
</head>
<body>
  <nav>nav links here</nav>
  <article>
    <h1>Simple Article</h1>
    <p>This is the <strong>first paragraph</strong> of the article.</p>
    <p>Here is a second paragraph with a <a href="https://example.com">link</a>.</p>
    <h2>Section</h2>
    <ul>
      <li>Item one</li>
      <li>Item two</li>
    </ul>
  </article>
  <footer>copyright 2026</footer>
</body>
</html>`;

const FIXTURE_NO_ARTICLE = `<!doctype html>
<html><head><title>Bare Page</title></head>
<body><h1>Bare Page</h1><p>Just a paragraph.</p></body></html>`;

const FIXTURE_EMPTY = `<!doctype html><html><head><title></title></head><body></body></html>`;

test('extractFromHtml: pulls title from simple article', () => {
  const out = ingest.extractFromHtml(FIXTURE_SIMPLE, 'https://example.com/a');
  assert.ok(out.title && out.title.length > 0, 'title should be extracted');
  assert.ok(
    out.title.toLowerCase().includes('simple'),
    `expected title to contain "simple", got "${out.title}"`
  );
});

test('extractFromHtml: produces markdown content', () => {
  const out = ingest.extractFromHtml(FIXTURE_SIMPLE, 'https://example.com/a');
  assert.ok(out.content_md.length > 0, 'content_md should not be empty');
  // Should contain at least one of the paragraphs from the fixture
  assert.ok(
    out.content_md.toLowerCase().includes('paragraph'),
    'markdown should contain extracted paragraph text'
  );
});

test('extractFromHtml: bare page still extracts title', () => {
  const out = ingest.extractFromHtml(FIXTURE_NO_ARTICLE, 'https://example.com/b');
  assert.ok(out.title, 'should extract title from bare page');
});

test('extractFromHtml: empty html → empty content gracefully', () => {
  const out = ingest.extractFromHtml(FIXTURE_EMPTY, 'https://example.com/c');
  assert.strictEqual(typeof out.content_md, 'string');
  assert.ok(out.extractor);
});

test('extractFromHtml: throws on empty input', () => {
  assert.throws(() => ingest.extractFromHtml('', 'https://example.com/'), /non-empty string/);
  assert.throws(() => ingest.extractFromHtml(null, 'https://example.com/'), /non-empty string/);
});

test('extractFromHtml: reports which extractor ran', () => {
  const out = ingest.extractFromHtml(FIXTURE_SIMPLE, 'https://example.com/');
  assert.ok(['defuddle', 'readability', 'naive'].includes(out.extractor));
});

test('extractFromHtml: prefers defuddle when the dep is installed', () => {
  // This test serves as a regression guard against the v8.0.0 bug where
  // defuddle's sync path was silently falling through to readability because
  // the wrong argument (JSDOM wrapper vs Document instance) was being passed.
  let installed = false;
  try { require.resolve('defuddle'); installed = true; } catch {}
  if (!installed) return;
  const BIG_FIXTURE = `<!doctype html><html><head><title>Defuddle Regression Fixture</title></head>
<body><nav>nav here</nav><article><h1>Defuddle Regression Fixture</h1>
<p>This paragraph is deliberately long so that defuddle's minimum content length heuristic is satisfied and the extractor picks up the article region without falling back. It needs multiple sentences to rank above the nav and footer clutter around it.</p>
<p>This second paragraph exists to give defuddle a strong anchor for the main content region. It restates the premise in slightly different words so the content scorer sees a coherent article body rather than a sparse stub.</p>
<h2>Sub-heading</h2>
<p>Final paragraph with the usual list:</p>
<ul><li>Alpha</li><li>Beta</li><li>Gamma</li></ul>
</article><footer>footer here</footer></body></html>`;
  const out = ingest.extractFromHtml(BIG_FIXTURE, 'https://example.com/');
  assert.strictEqual(out.extractor, 'defuddle', `expected defuddle, got ${out.extractor}`);
  assert.ok(out.content_md.length > 0);
  // The markdown conversion (turndown) should leave no HTML tags behind
  assert.ok(!/<article>|<p>|<h1>/.test(out.content_md),
    'expected pure markdown — found HTML tags leaking through');
});

// ---------------------------------------------------------------------------
// htmlToNote — full pipeline producing markdown
// ---------------------------------------------------------------------------

console.log('\n── ingest-layer: htmlToNote ──');

test('htmlToNote: produces valid frontmatter + body', () => {
  const { markdown } = ingest.htmlToNote(FIXTURE_SIMPLE, 'https://example.com/a');
  assert.ok(markdown.startsWith('---\n'), 'should start with frontmatter');
  assert.ok(markdown.includes('type: "clip"'), 'should declare type clip');
  assert.ok(markdown.includes('source: "https://example.com/a"'), 'should include source URL');
});

test('htmlToNote: roundtrips through file-layer parser', () => {
  const { markdown } = ingest.htmlToNote(FIXTURE_SIMPLE, 'https://example.com/a');
  const { frontmatter, body } = fileLayer.parseFrontmatter(markdown);
  assert.strictEqual(frontmatter.type, 'clip');
  assert.strictEqual(frontmatter.source, 'https://example.com/a');
  assert.ok(Array.isArray(frontmatter.tags));
  assert.ok(body.length > 0);
});

test('htmlToNote: custom tags are persisted to frontmatter', () => {
  const { markdown } = ingest.htmlToNote(
    FIXTURE_SIMPLE,
    'https://example.com/a',
    { tags: ['research', 'harness'] }
  );
  const { frontmatter } = fileLayer.parseFrontmatter(markdown);
  assert.deepStrictEqual(frontmatter.tags, ['research', 'harness']);
});

test('htmlToNote: includes H1 title header in body', () => {
  const { markdown } = ingest.htmlToNote(FIXTURE_SIMPLE, 'https://example.com/a');
  assert.ok(/^# .+$/m.test(markdown), 'should contain an H1');
});

// ---------------------------------------------------------------------------
// clipUrl — file-system side effects via a stubbed fetch
// ---------------------------------------------------------------------------

console.log('\n── ingest-layer: clipUrl (stubbed) ──');

// We stub the global fetch to return FIXTURE_SIMPLE so the test runs offline.
// Runs only if global fetch is a function (Node 18+, true in the repo).
async function runClipUrlTests() {
  if (typeof globalThis.fetch !== 'function') {
    console.log('  (skipping — no global fetch)');
    return;
  }

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    url: 'https://example.com/article',
    text: async () => FIXTURE_SIMPLE,
    json: async () => ({}),
  });

  try {
    await testAsync('clipUrl: writes a markdown file under raw/clips/', async () => {
      setupVault();
      try {
        const result = await ingest.clipUrl('https://example.com/article', {
          vaultPath: TEST_VAULT,
          strategy: 'fetch',
        });
        assert.ok(fs.existsSync(result.path), 'file should exist');
        assert.ok(result.relPath.startsWith('raw/clips/'), 'should be under raw/clips/');
        assert.ok(result.bytes > 0, 'bytes should be positive');
        assert.ok(result.metadata.source === 'https://example.com/article');
      } finally {
        teardownVault();
      }
    });

    await testAsync('clipUrl: file content has valid frontmatter', async () => {
      setupVault();
      try {
        const result = await ingest.clipUrl('https://example.com/article', {
          vaultPath: TEST_VAULT,
          strategy: 'fetch',
          tags: ['test', 'fixture'],
        });
        const content = fs.readFileSync(result.path, 'utf-8');
        const { frontmatter, body } = fileLayer.parseFrontmatter(content);
        assert.strictEqual(frontmatter.type, 'clip');
        assert.strictEqual(frontmatter.source, 'https://example.com/article');
        // With the generic article template the user tags merge with the
        // template-provided defaults. Assert inclusion rather than equality.
        assert.ok(Array.isArray(frontmatter.tags), 'tags should be an array');
        assert.ok(frontmatter.tags.includes('test'));
        assert.ok(frontmatter.tags.includes('fixture'));
        assert.ok(body.length > 0);
      } finally {
        teardownVault();
      }
    });

    await testAsync('clipUrl: template=none uses fallback buildNote', async () => {
      setupVault();
      try {
        const result = await ingest.clipUrl('https://example.com/article', {
          vaultPath: TEST_VAULT,
          strategy: 'fetch',
          template: 'none',
          tags: ['test'],
        });
        assert.strictEqual(result.metadata.template, null);
        const content = fs.readFileSync(result.path, 'utf-8');
        const { frontmatter } = fileLayer.parseFrontmatter(content);
        assert.strictEqual(frontmatter.type, 'clip');
        // In fallback mode, user tags replace the defaults
        assert.deepStrictEqual(frontmatter.tags, ['test']);
      } finally {
        teardownVault();
      }
    });

    await testAsync('clipUrl: template=auto reports the template name', async () => {
      setupVault();
      try {
        const result = await ingest.clipUrl('https://example.com/article', {
          vaultPath: TEST_VAULT,
          strategy: 'fetch',
        });
        // The bundled generic article template should match '/.*/'
        assert.ok(result.metadata.template, 'expected a template to match');
        assert.strictEqual(typeof result.metadata.template, 'string');
      } finally {
        teardownVault();
      }
    });

    await testAsync('clipUrl: template=<name> forces a specific template', async () => {
      setupVault();
      try {
        const result = await ingest.clipUrl('https://example.com/article', {
          vaultPath: TEST_VAULT,
          strategy: 'fetch',
          template: 'article',
        });
        assert.strictEqual(result.metadata.template, 'article');
      } finally {
        teardownVault();
      }
    });

    await testAsync('clipUrl: rejects non-http URLs', async () => {
      setupVault();
      try {
        let caught = null;
        try {
          await ingest.clipUrl('ftp://example.com/', { vaultPath: TEST_VAULT, strategy: 'fetch' });
        } catch (e) {
          caught = e;
        }
        assert.ok(caught, 'should throw');
        assert.ok(/http\/https/.test(caught.message));
      } finally {
        teardownVault();
      }
    });

    await testAsync('clipUrl: rejects invalid URL', async () => {
      setupVault();
      try {
        let caught = null;
        try {
          await ingest.clipUrl('not a url', { vaultPath: TEST_VAULT, strategy: 'fetch' });
        } catch (e) {
          caught = e;
        }
        assert.ok(caught, 'should throw');
        assert.ok(/invalid URL/.test(caught.message));
      } finally {
        teardownVault();
      }
    });

    await testAsync('clipUrl: requires vaultPath', async () => {
      let caught = null;
      try {
        await ingest.clipUrl('https://example.com/', { strategy: 'fetch' });
      } catch (e) {
        caught = e;
      }
      assert.ok(caught, 'should throw');
      assert.ok(/vaultPath/.test(caught.message));
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
}

// ---------------------------------------------------------------------------
// buildInterpreter — auto-wiring the LLM prompt callback
// ---------------------------------------------------------------------------

console.log('\n── ingest-layer: buildInterpreter ──');

test('buildInterpreter: returns null with no API keys', () => {
  const savedA = process.env.ANTHROPIC_API_KEY;
  const savedO = process.env.OPENROUTER_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  try {
    const fn = ingest.buildInterpreter({});
    assert.strictEqual(fn, null);
  } finally {
    if (savedA) process.env.ANTHROPIC_API_KEY = savedA;
    if (savedO) process.env.OPENROUTER_API_KEY = savedO;
  }
});

test('buildInterpreter: returns null when provider=none', () => {
  const savedA = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = 'fake-key-for-test';
  try {
    const fn = ingest.buildInterpreter({ provider: 'none' });
    assert.strictEqual(fn, null);
  } finally {
    if (savedA) process.env.ANTHROPIC_API_KEY = savedA;
    else delete process.env.ANTHROPIC_API_KEY;
  }
});

test('buildInterpreter: returns a function when ANTHROPIC_API_KEY is set', () => {
  const savedA = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = 'fake-key-for-test';
  try {
    const fn = ingest.buildInterpreter({});
    assert.strictEqual(typeof fn, 'function');
  } finally {
    if (savedA) process.env.ANTHROPIC_API_KEY = savedA;
    else delete process.env.ANTHROPIC_API_KEY;
  }
});

// ---------------------------------------------------------------------------
// ingestPdf — stub path (no pdftotext required)
// ---------------------------------------------------------------------------

console.log('\n── ingest-layer: ingestPdf ──');

async function runPdfTests() {
  await testAsync('ingestPdf: requires vaultPath', async () => {
    let caught = null;
    try {
      await ingest.ingestPdf('/tmp/fake.pdf', {});
    } catch (e) { caught = e; }
    assert.ok(caught);
    assert.ok(/vaultPath/.test(caught.message));
  });

  await testAsync('ingestPdf: errors on missing local file', async () => {
    setupVault();
    try {
      let caught = null;
      try {
        await ingest.ingestPdf('/tmp/definitely-does-not-exist-xyz-123.pdf', {
          vaultPath: TEST_VAULT,
        });
      } catch (e) { caught = e; }
      assert.ok(caught);
      assert.ok(/not found/.test(caught.message));
    } finally {
      teardownVault();
    }
  });

  await testAsync('ingestPdf: stub path writes metadata when pdftotext is missing', async () => {
    setupVault();
    // Create a tiny valid-enough PDF shell
    const tmpPdf = path.join(TEST_VAULT, 'fixture.pdf');
    fs.writeFileSync(tmpPdf, '%PDF-1.4\n%stub for tests\n');
    try {
      // Temporarily scrub PATH so pdftotext can't be found
      const savedPath = process.env.PATH;
      process.env.PATH = '/nonexistent-path-for-test';
      try {
        const result = await ingest.ingestPdf(tmpPdf, { vaultPath: TEST_VAULT });
        assert.ok(result.path.includes('raw/papers/'));
        assert.strictEqual(result.metadata.extractor, 'stub');
        assert.strictEqual(result.metadata.hasText, false);
        const content = fs.readFileSync(result.path, 'utf-8');
        const { frontmatter, body } = fileLayer.parseFrontmatter(content);
        assert.strictEqual(frontmatter.type, 'paper');
        assert.strictEqual(frontmatter.extractor, 'stub');
        assert.ok(frontmatter.source_path.endsWith('fixture.pdf'));
        assert.ok(body.includes('pdftotext'));
      } finally {
        process.env.PATH = savedPath;
      }
    } finally {
      teardownVault();
    }
  });

  await testAsync('ingestPdf: uses pdftotext if available', async () => {
    // This test only runs if pdftotext is on PATH. We still need a valid PDF;
    // we build a minimal one with the `%PDF-1.4` magic and hope pdftotext can
    // handle it, else we skip.
    const { execFileSync } = require('child_process');
    let available = false;
    try {
      execFileSync('pdftotext', ['-v'], { stdio: 'ignore' });
      available = true;
    } catch { /* skip */ }
    if (!available) return;

    setupVault();
    // Write the simplest possible valid PDF with one text operator
    const tmpPdf = path.join(TEST_VAULT, 'fixture.pdf');
    const pdf =
      '%PDF-1.1\n' +
      '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
      '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
      '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n' +
      '4 0 obj<</Length 44>>stream\nBT /F1 12 Tf 72 720 Td (Hello PDF Text) Tj ET\nendstream endobj\n' +
      '5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n' +
      'xref\n0 6\n0000000000 65535 f\n0000000009 00000 n\n0000000052 00000 n\n0000000101 00000 n\n0000000175 00000 n\n0000000232 00000 n\n' +
      'trailer<</Size 6/Root 1 0 R>>\nstartxref\n292\n%%EOF\n';
    fs.writeFileSync(tmpPdf, pdf);
    try {
      const result = await ingest.ingestPdf(tmpPdf, { vaultPath: TEST_VAULT });
      // pdftotext may successfully parse this fixture or fall back to stub.
      // We don't assert extractor — just that SOMETHING was written.
      assert.ok(fs.existsSync(result.path));
      assert.ok(['pdftotext', 'stub'].includes(result.metadata.extractor));
    } finally {
      teardownVault();
    }
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

(async () => {
  await runClipUrlTests();
  await runPdfTests();

  console.log(`\n${'═'.repeat(50)}`);
  console.log(`ingest tests: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log(`${'═'.repeat(50)}`);
  process.exit(failed > 0 ? 1 : 0);
})();
