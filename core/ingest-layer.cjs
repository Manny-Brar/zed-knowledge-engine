/**
 * ingest-layer.cjs — ZED v8.0 Web Ingestion Layer
 *
 * Takes a URL (or local file) and produces a clean markdown note in
 * `<vault>/raw/<category>/YYYY-MM-DD-<slug>.md` with YAML frontmatter.
 *
 * Design:
 *   - Pure-Node core (no Playwright needed) for test-ability
 *   - Lazy-required extractors so missing deps are non-fatal
 *   - URL-pattern dispatch to specialized ingesters (youtube, github, pdf)
 *   - Fallback chain: defuddle(playwright) → defuddle(fetch) → readability
 *   - All output flows through file-layer.writeNote (atomic write + mkdir)
 *
 * Public API:
 *   clipUrl(url, opts)      — web clip
 *   ingestYouTube(url, opts)
 *   ingestRepo(url, opts)   — Phase 3
 *   ingestPdf(path, opts)   — Phase 3
 *   htmlToNote(html, url)   — pure function, the testable core
 *   emitFrontmatter(obj)    — YAML emitter matched to file-layer parser
 *   slugify(title)          — filename slug
 */

'use strict';

const path = require('path');
const fs = require('fs');
const fileLayer = require('./file-layer.cjs');
const templateEngine = require('./template-engine.cjs');

// Bundled templates live alongside the repo under templates/clip-templates/.
// User overrides live at <vault>/_templates/.
const BUNDLED_TEMPLATES_DIR = path.resolve(__dirname, '..', 'templates', 'clip-templates');

/**
 * Build an interpreter callback for the template engine.
 *
 * When a template contains `{{"prompt text"}}` variables (Obsidian Web
 * Clipper's Interpreter feature), the template engine needs an async
 * callback that takes the prompt + page context and returns a string.
 *
 * If ANTHROPIC_API_KEY is set we use council's Anthropic adapter for a
 * cheap, low-latency call (defaults to claude-haiku for cost). If the
 * key is missing we return null and the engine substitutes empty strings
 * — templates degrade gracefully.
 *
 * Returns `null` when no interpreter is available so the template
 * engine's `{{"..."}}` paths short-circuit cleanly.
 */
function buildInterpreter(opts = {}) {
  const explicitProvider = opts.provider;
  const model = opts.model || 'claude-haiku-4-5-20251001';

  if (explicitProvider === 'none') return null;
  if (!process.env.ANTHROPIC_API_KEY && !process.env.OPENROUTER_API_KEY) return null;

  // Lazy-require so tests that don't exercise clip paths avoid the dep graph.
  let PROVIDERS;
  try {
    ({ PROVIDERS } = require('./council.cjs'));
  } catch (e) {
    return null;
  }

  return async (prompt, ctx) => {
    // Extract a rough page context: title + first ~2000 chars of content
    const title = (ctx && ctx.presets && ctx.presets.title) || '';
    const content = ((ctx && ctx.presets && ctx.presets.content) || '').slice(0, 2000);
    const system =
      'You are an HTML/article extraction assistant. Respond with ONLY the ' +
      'requested content — no preamble, no apologies, no framing. Keep it ' +
      'under 300 words unless told otherwise.';
    const fullPrompt =
      `Page title: ${title}\n\n` +
      `Page content (excerpt):\n${content}\n\n---\n\n` +
      `Task: ${prompt}`;

    if (process.env.ANTHROPIC_API_KEY) {
      const res = await PROVIDERS.anthropic(model, fullPrompt, { system, maxTokens: 512 });
      if (res && res.text) return res.text.trim();
    }
    if (process.env.OPENROUTER_API_KEY) {
      const res = await PROVIDERS.openrouter('anthropic/claude-haiku', fullPrompt, { system, maxTokens: 512 });
      if (res && res.text) return res.text.trim();
    }
    return '';
  };
}

// ---------------------------------------------------------------------------
// Lazy requires — so tests + CLI run even if heavy deps are missing
// ---------------------------------------------------------------------------

function tryRequire(name) {
  try {
    return require(name);
  } catch (e) {
    return null;
  }
}

let _jsdom = null;
let _readability = null;
let _turndown = null;
let _defuddleNode = null;
let _playwright = null;

function getJsdom() {
  if (_jsdom === null) _jsdom = tryRequire('jsdom');
  return _jsdom;
}
function getReadability() {
  if (_readability === null) _readability = tryRequire('@mozilla/readability');
  return _readability;
}
function getTurndown() {
  if (_turndown === null) _turndown = tryRequire('turndown');
  return _turndown;
}
function getDefuddle() {
  if (_defuddleNode === null) {
    // defuddle's main export is the Defuddle class itself (the module object
    // behaves like a function). We accept it directly OR via a .Defuddle /
    // .default property for forward compatibility. The async `defuddle/node`
    // subpath is ESM-only and can't be required synchronously, so it's
    // reserved for future async pipelines.
    _defuddleNode = tryRequire('defuddle');
  }
  return _defuddleNode;
}
function getPlaywright() {
  if (_playwright === null) _playwright = tryRequire('playwright');
  return _playwright;
}

// ---------------------------------------------------------------------------
// Slug + filename helpers
// ---------------------------------------------------------------------------

const RESERVED_FILENAMES = new Set([
  'con', 'prn', 'aux', 'nul',
  'com1', 'com2', 'com3', 'com4', 'com5', 'com6', 'com7', 'com8', 'com9',
  'lpt1', 'lpt2', 'lpt3', 'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9',
]);

function slugify(input, opts = {}) {
  const maxLen = opts.maxLen || 80;
  if (!input || typeof input !== 'string') return 'untitled';
  let slug = input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!slug) slug = 'untitled';
  if (slug.length > maxLen) slug = slug.slice(0, maxLen).replace(/-+$/, '');
  if (RESERVED_FILENAMES.has(slug)) slug = slug + '-clip';
  return slug;
}

function todayIso() {
  return new Date().toISOString().split('T')[0];
}

function hostFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'unknown-host';
  }
}

// ---------------------------------------------------------------------------
// Frontmatter emitter — matches file-layer.parseFrontmatter format
// ---------------------------------------------------------------------------

/**
 * Serialize a JS object into YAML frontmatter parseable by
 * file-layer.parseFrontmatter. Only supports the subset that parser handles:
 * string, number, boolean, and array of strings.
 *
 * Strings are always quoted with double quotes (escaped) to avoid YAML
 * gotchas with colons, URLs, hashes, etc. Arrays use inline [a, b, c] form
 * since that's what the parser handles most reliably.
 */
function emitFrontmatter(obj) {
  const lines = ['---'];
  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) continue;
    if (Array.isArray(value)) {
      if (value.length === 0) {
        lines.push(`${key}: []`);
      } else {
        const items = value.map((v) => {
          const s = String(v).replace(/"/g, '\\"');
          return `"${s}"`;
        });
        lines.push(`${key}: [${items.join(', ')}]`);
      }
    } else if (typeof value === 'boolean' || typeof value === 'number') {
      lines.push(`${key}: ${value}`);
    } else {
      const s = String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      lines.push(`${key}: "${s}"`);
    }
  }
  lines.push('---');
  return lines.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// HTML → extracted { title, author, published, excerpt, content_md }
// ---------------------------------------------------------------------------

/**
 * Extract clean article data from raw HTML. Pure function, no network.
 * Tries defuddle first, falls back to mozilla/readability + turndown,
 * and finally falls back to a very naive HTML-strip if neither is available.
 *
 * @param {string} html - raw HTML
 * @param {string} url - original URL (used by defuddle for base links)
 * @returns {{title:string, author:string|null, published:string|null,
 *            excerpt:string|null, content_md:string, extractor:string}}
 */
function extractFromHtml(html, url) {
  if (!html || typeof html !== 'string') {
    throw new Error('extractFromHtml: html must be a non-empty string');
  }

  const jsdom = getJsdom();
  const defuddleMod = getDefuddle();

  // ---- 1. Try defuddle (extraction) + turndown (markdown) ----
  // Defuddle does the hard work — finding the article, stripping nav/footer,
  // respecting schema.org data, handling code blocks/math. Its sync browser
  // build doesn't bundle a markdown converter (that lives in defuddle/node,
  // which is ESM-only), so we pipe its cleaned HTML through turndown.
  const turndownMod = getTurndown();
  if (jsdom && defuddleMod && turndownMod) {
    // Silence defuddle's unconditional `console.log("Initial parse returned
    // very little content, trying again")` noise — it's chatter, not an
    // error, and it pollutes CI output + Claude Code tool results.
    const origLog = console.log;
    if (!process.env.ZED_DEBUG_EXTRACTOR) {
      console.log = () => {};
    }
    try {
      const { JSDOM, VirtualConsole } = jsdom;
      const virtualConsole = new VirtualConsole();
      const dom = new JSDOM(html, { url, virtualConsole });
      const Defuddle = defuddleMod.Defuddle || defuddleMod.default || defuddleMod;
      // Pass dom.window.document (the Document instance), not the wrapper.
      const result = new Defuddle(dom.window.document, { url }).parse();
      if (result && result.content) {
        const TurndownService = turndownMod.default || turndownMod;
        const td = new TurndownService({
          headingStyle: 'atx',
          codeBlockStyle: 'fenced',
          bulletListMarker: '-',
        });
        const content_md = td.turndown(result.content).trim();
        if (content_md.length > 0) {
          return {
            title: (result.title || '').trim() || null,
            author: (result.author || '').trim() || null,
            published: (result.published || result.date || '').trim() || null,
            excerpt: (result.description || '').trim() || null,
            content_md,
            extractor: 'defuddle',
          };
        }
      }
    } catch (e) {
      // fall through to readability
    } finally {
      console.log = origLog;
    }
  }

  // ---- 2. Fallback: readability + turndown ----
  const readabilityMod = getReadability();
  if (jsdom && readabilityMod && turndownMod) {
    try {
      const { JSDOM, VirtualConsole } = jsdom;
      const virtualConsole = new VirtualConsole();
      const dom = new JSDOM(html, { url, virtualConsole });
      const Readability = readabilityMod.Readability || readabilityMod.default || readabilityMod;
      const reader = new Readability(dom.window.document);
      const article = reader.parse();
      if (article && article.content) {
        const TurndownService = turndownMod.default || turndownMod;
        const td = new TurndownService({
          headingStyle: 'atx',
          codeBlockStyle: 'fenced',
          bulletListMarker: '-',
        });
        const content_md = td.turndown(article.content).trim();
        return {
          title: (article.title || '').trim() || null,
          author: (article.byline || '').trim() || null,
          published: (article.publishedTime || '').trim() || null,
          excerpt: (article.excerpt || '').trim() || null,
          content_md,
          extractor: 'readability',
        };
      }
    } catch (e) {
      // fall through to naive
    }
  }

  // ---- 3. Last-resort naive strip ----
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : null;
  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<\/(p|div|h[1-6]|br|li)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return {
    title,
    author: null,
    published: null,
    excerpt: null,
    content_md: body,
    extractor: 'naive',
  };
}

/**
 * Build a complete markdown note (frontmatter + body) from extracted data
 * and a source URL. Pure function.
 */
function htmlToNote(html, url, opts = {}) {
  const extracted = extractFromHtml(html, url);
  return {
    extracted,
    markdown: buildNote(extracted, url, opts),
  };
}

function buildNote(extracted, url, opts = {}) {
  const title = extracted.title || hostFromUrl(url);
  const clippedAt = new Date().toISOString();
  const frontmatter = emitFrontmatter({
    title,
    type: 'clip',
    source: url,
    source_host: hostFromUrl(url),
    author: extracted.author || null,
    published: extracted.published || null,
    clipped: clippedAt,
    extractor: extracted.extractor,
    tags: opts.tags && opts.tags.length ? opts.tags : ['clip', hostFromUrl(url).replace(/\./g, '-')],
    excerpt: extracted.excerpt || null,
  });

  const header = `# ${title}\n\n> Source: [${hostFromUrl(url)}](${url})  \n> Clipped: ${clippedAt}  \n> Extractor: ${extracted.extractor}\n\n`;
  const body = extracted.content_md || '_(no content extracted)_';
  return frontmatter + '\n' + header + body + '\n';
}

// ---------------------------------------------------------------------------
// Page fetching — playwright for JS-rendered, fetch() for plain
// ---------------------------------------------------------------------------

/**
 * Fetch HTML from a URL. Strategy:
 *   - "playwright" (default if installed) — full JS rendering, SPA-friendly
 *   - "fetch" — node fetch(), fast, no JS rendering
 *
 * @param {string} url
 * @param {Object} [opts]
 * @param {string} [opts.strategy] — 'auto'|'playwright'|'fetch'
 * @param {string} [opts.authFile] — path to playwright storageState JSON
 * @param {number} [opts.timeoutMs] — default 30s
 * @returns {Promise<{html:string, finalUrl:string, strategy:string}>}
 */
async function fetchHtml(url, opts = {}) {
  const strategy = opts.strategy || 'auto';
  const timeoutMs = opts.timeoutMs || 30000;

  const playwrightMod = getPlaywright();
  const wantPlaywright =
    strategy === 'playwright' ||
    (strategy === 'auto' && playwrightMod !== null);

  if (wantPlaywright && playwrightMod) {
    try {
      const browser = await playwrightMod.chromium.launch({ headless: true });
      try {
        const contextOpts = {};
        if (opts.authFile && fs.existsSync(opts.authFile)) {
          contextOpts.storageState = opts.authFile;
        }
        const context = await browser.newContext(contextOpts);
        const page = await context.newPage();
        await page.goto(url, { waitUntil: 'networkidle', timeout: timeoutMs });
        const html = await page.content();
        const finalUrl = page.url();
        return { html, finalUrl, strategy: 'playwright' };
      } finally {
        await browser.close();
      }
    } catch (e) {
      if (strategy === 'playwright') throw e;
      // fall through to fetch()
    }
  }

  // fetch() fallback
  if (typeof fetch !== 'function') {
    throw new Error('ingest: no fetcher available (need Node 18+ or playwright)');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ZED-Knowledge-Engine/8.0)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
    }
    const html = await res.text();
    return { html, finalUrl: res.url || url, strategy: 'fetch' };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Template loading — user vault overrides bundled templates
// ---------------------------------------------------------------------------

/**
 * Load all clip templates: user vault first, then bundled fallback.
 * User templates override bundled ones with the same name.
 */
function loadAllTemplates(vaultPath) {
  const userDir = vaultPath ? path.join(vaultPath, '_templates') : null;
  const user = userDir ? templateEngine.loadTemplates(userDir) : [];
  const bundled = templateEngine.loadTemplates(BUNDLED_TEMPLATES_DIR);
  // User overrides bundled by template `name`
  const byName = new Map();
  for (const t of bundled) byName.set(t.name || t._file, t);
  for (const t of user) byName.set(t.name || t._file, t);
  // Preserve bundled order: put user-override names first, then rest
  return Array.from(byName.values());
}

/**
 * Convert a template's rendered properties[] into a frontmatter object.
 * Handles the `multitext` type by splitting on commas.
 */
function propertiesToFrontmatter(properties) {
  const fm = {};
  for (const prop of properties || []) {
    const name = prop.name;
    const value = prop.value;
    if (prop.type === 'multitext' && typeof value === 'string') {
      fm[name] = value
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (prop.type === 'number') {
      const n = Number(value);
      fm[name] = Number.isFinite(n) ? n : value;
    } else if (prop.type === 'checkbox' || prop.type === 'boolean') {
      fm[name] = value === 'true' || value === true;
    } else {
      fm[name] = value;
    }
  }
  return fm;
}

// ---------------------------------------------------------------------------
// clipUrl — main entry point
// ---------------------------------------------------------------------------

/**
 * Clip a URL into the vault as a markdown note under raw/<subdir>/.
 *
 * Template resolution:
 *   opts.template === 'none' (or false) — skip templates, use buildNote
 *   opts.template === '<name>'          — force a template by name
 *   opts.template === 'auto' (default)  — match by URL triggers, else buildNote
 *
 * @param {string} url
 * @param {Object} opts
 * @param {string} opts.vaultPath           — absolute path to vault root
 * @param {Object} [opts.engine]            — optional KnowledgeEngine to
 *                                            incrementalBuild after write
 * @param {string} [opts.strategy]          — 'auto'|'playwright'|'fetch'
 * @param {string} [opts.authFile]
 * @param {number} [opts.timeoutMs]
 * @param {string[]} [opts.tags]            — extra tags merged into frontmatter
 * @param {string|false} [opts.template]    — 'auto' (default), 'none', or name
 * @param {string} [opts.subdir]            — default 'clips' (used for fallback)
 * @param {Function} [opts.interpret]       — async (prompt, ctx) => string; LLM
 * @returns {Promise<{path:string, metadata:Object, bytes:number}>}
 */
async function clipUrl(url, opts = {}) {
  if (!url || typeof url !== 'string') {
    throw new Error('clipUrl: url is required');
  }
  if (!opts.vaultPath) {
    throw new Error('clipUrl: opts.vaultPath is required');
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`clipUrl: invalid URL: ${url}`);
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`clipUrl: only http/https URLs supported (got ${parsed.protocol})`);
  }

  // 1. Fetch
  const { html, finalUrl, strategy } = await fetchHtml(url, opts);

  // 2. Build a jsdom document once (used for extraction + template resolvers)
  let documentObj = null;
  const jsdom = getJsdom();
  if (jsdom) {
    try {
      const { JSDOM } = jsdom;
      const dom = new JSDOM(html, { url: finalUrl });
      documentObj = dom.window.document;
    } catch {
      documentObj = null;
    }
  }

  // 3. Extract clean content
  const extracted = extractFromHtml(html, finalUrl);

  // 4. Resolve template (if enabled)
  const templateMode = opts.template === undefined ? 'auto' : opts.template;
  let matchedTemplate = null;
  if (templateMode !== 'none' && templateMode !== false) {
    const templates = loadAllTemplates(opts.vaultPath);
    if (typeof templateMode === 'string' && templateMode !== 'auto') {
      matchedTemplate = templates.find((t) => t.name === templateMode) || null;
    } else {
      matchedTemplate = templateEngine.matchTemplate(templates, finalUrl, documentObj);
    }
  }

  let noteMarkdown;
  let noteSubdir = opts.subdir || 'clips';
  let noteBasename = null;

  if (matchedTemplate) {
    // --- Template path ---
    // Auto-wire an LLM interpreter if the caller didn't explicitly set one
    // and the template contains {{"..."}} prompts (cheap to build, no-op
    // when no API key is set). opts.interpret === false disables it.
    let interpret = opts.interpret;
    if (interpret === undefined) {
      const rawTplString = JSON.stringify(matchedTemplate);
      const hasPromptVar = /\{\{\s*["'][^"']+["']\s*(\||\}\})/.test(rawTplString);
      interpret = hasPromptVar ? buildInterpreter({}) : null;
    } else if (interpret === false) {
      interpret = null;
    }

    const ctx = templateEngine.buildContext({
      html,
      url: finalUrl,
      document: documentObj,
      presets: {
        title: extracted.title || hostFromUrl(finalUrl),
        author: extracted.author || '',
        published: extracted.published || '',
        content: extracted.content_md || '',
        contentHtml: html,
        description: extracted.excerpt || '',
      },
      interpret,
    });
    const rendered = await templateEngine.renderTemplate(matchedTemplate, ctx);

    // Build frontmatter from template properties
    const fmObj = propertiesToFrontmatter(rendered.properties);
    // Ensure housekeeping fields
    if (!fmObj.extractor) fmObj.extractor = extracted.extractor;
    if (!fmObj.source) fmObj.source = finalUrl;
    // Merge user tags
    if (opts.tags && opts.tags.length) {
      const existing = Array.isArray(fmObj.tags) ? fmObj.tags : [];
      fmObj.tags = Array.from(new Set([...existing, ...opts.tags]));
    }

    noteMarkdown = emitFrontmatter(fmObj) + '\n' + (rendered.content || '') + '\n';

    // Use template-provided path + noteName
    if (rendered.pathDir) {
      // pathDir is relative to the vault, already includes "raw/clips/..."
      // We extract the subdir portion beyond "raw/" for consistency.
      const rel = rendered.pathDir.replace(/^\/+/, '');
      if (rel.startsWith('raw/')) {
        noteSubdir = rel.slice(4);
      } else {
        noteSubdir = rel; // user override — store under vault/<rel>
      }
    }
    if (rendered.noteName) {
      noteBasename = rendered.noteName.replace(/\.md$/i, '') + '.md';
    }
  }

  if (!matchedTemplate) {
    // --- Fallback path: buildNote ---
    noteMarkdown = buildNote(extracted, finalUrl, { tags: opts.tags });
  }

  // 5. Resolve final filename
  if (!noteBasename) {
    const slug = slugify(extracted.title || hostFromUrl(finalUrl));
    noteBasename = `${todayIso()}-${slug}.md`;
  }

  // Template-provided pathDir can be absolute inside vault (e.g. "raw/clips")
  // or just a subdir name. Normalise to "raw/<subdir>".
  let absPath;
  if (matchedTemplate && /^(raw|wiki)\b/.test(noteSubdir === (opts.subdir || 'clips') ? '' : '')) {
    // keep simple: if template provided a full "raw/..." path, honour it
    absPath = path.join(opts.vaultPath, 'raw', noteSubdir, noteBasename);
  } else if (matchedTemplate) {
    absPath = path.join(opts.vaultPath, 'raw', noteSubdir, noteBasename);
  } else {
    absPath = path.join(opts.vaultPath, 'raw', noteSubdir, noteBasename);
  }

  // Path traversal guard
  const absResolved = path.resolve(absPath);
  const vaultResolved = path.resolve(opts.vaultPath);
  if (!absResolved.startsWith(vaultResolved + path.sep)) {
    throw new Error(`clipUrl: path escapes vault: ${absPath}`);
  }

  // Dedupe: append -2, -3, ... if a different-URL file already occupies slot
  let finalAbsPath = absPath;
  let i = 2;
  while (fs.existsSync(finalAbsPath)) {
    const existing = fs.readFileSync(finalAbsPath, 'utf-8');
    if (existing.includes(`source: "${finalUrl}"`)) break; // idempotent overwrite
    const parsed = path.parse(absPath);
    finalAbsPath = path.join(parsed.dir, `${parsed.name}-${i}${parsed.ext}`);
    i++;
    if (i > 50) throw new Error('clipUrl: too many duplicate slugs');
  }

  fileLayer.writeNote(finalAbsPath, noteMarkdown);

  if (opts.engine && typeof opts.engine.incrementalBuild === 'function') {
    try {
      opts.engine.incrementalBuild();
    } catch (e) {
      // non-fatal; indexing can catch up on next call
    }
  }

  return {
    path: finalAbsPath,
    relPath: path.relative(opts.vaultPath, finalAbsPath),
    metadata: {
      title: extracted.title,
      author: extracted.author,
      published: extracted.published,
      source: finalUrl,
      extractor: extracted.extractor,
      fetchStrategy: strategy,
      template: matchedTemplate ? matchedTemplate.name : null,
    },
    bytes: Buffer.byteLength(noteMarkdown, 'utf-8'),
  };
}

// ---------------------------------------------------------------------------
// YouTube transcript ingester
// ---------------------------------------------------------------------------

async function ingestYouTube(url, opts = {}) {
  if (!opts.vaultPath) throw new Error('ingestYouTube: opts.vaultPath is required');
  const ytMod = tryRequire('youtube-transcript');
  if (!ytMod) {
    throw new Error('ingestYouTube: youtube-transcript dep not installed');
  }
  const YoutubeTranscript = ytMod.YoutubeTranscript || ytMod.default || ytMod;
  const segments = await YoutubeTranscript.fetchTranscript(url);
  if (!segments || segments.length === 0) {
    throw new Error('ingestYouTube: no transcript available');
  }
  const text = segments.map((s) => s.text).join(' ').replace(/\s+/g, ' ').trim();

  // Try to grab title via oembed (no deps)
  let title = null;
  try {
    const oembed = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`);
    if (oembed.ok) {
      const data = await oembed.json();
      title = data.title || null;
    }
  } catch {}

  const frontmatter = emitFrontmatter({
    title: title || `YouTube transcript: ${url}`,
    type: 'transcript',
    source: url,
    source_host: 'youtube.com',
    clipped: new Date().toISOString(),
    extractor: 'youtube-transcript',
    tags: opts.tags && opts.tags.length ? opts.tags : ['clip', 'youtube', 'transcript'],
    duration_segments: segments.length,
  });
  const header = `# ${title || 'YouTube Transcript'}\n\n> Source: [${url}](${url})\n\n`;
  const markdown = frontmatter + '\n' + header + text + '\n';

  const slug = slugify(title || `yt-${Date.now()}`);
  const fileName = `${todayIso()}-${slug}.md`;
  const absPath = path.join(opts.vaultPath, 'raw', 'transcripts', fileName);
  fileLayer.writeNote(absPath, markdown);
  if (opts.engine) {
    try { opts.engine.incrementalBuild(); } catch {}
  }
  return {
    path: absPath,
    relPath: path.relative(opts.vaultPath, absPath),
    metadata: { title, source: url, segments: segments.length },
    bytes: Buffer.byteLength(markdown, 'utf-8'),
  };
}

// ---------------------------------------------------------------------------
// PDF ingester — pdftotext preferred, else metadata stub
// ---------------------------------------------------------------------------

/**
 * Ingest a PDF into raw/papers/. Accepts a local file path OR an HTTP(S) URL.
 *
 * Strategy:
 *   1. If `pdftotext` (poppler) is on PATH, extract full text layer
 *   2. Otherwise, write a metadata stub pointing at the local PDF. Claude
 *      can then Read() the PDF directly via Claude Code's native PDF support.
 *
 * @param {string} pathOrUrl
 * @param {Object} opts
 * @param {string} opts.vaultPath
 * @param {Object} [opts.engine]
 * @param {string[]} [opts.tags]
 */
async function ingestPdf(pathOrUrl, opts = {}) {
  if (!pathOrUrl) throw new Error('ingestPdf: pathOrUrl is required');
  if (!opts.vaultPath) throw new Error('ingestPdf: opts.vaultPath is required');

  // Resolve input to a local file path. If it's a URL, download first.
  let localPath;
  let sourceUrl = null;
  let tmpDownload = null;

  if (/^https?:\/\//i.test(pathOrUrl)) {
    sourceUrl = pathOrUrl;
    if (typeof fetch !== 'function') {
      throw new Error('ingestPdf: need Node 18+ fetch to download URL PDFs');
    }
    const res = await fetch(pathOrUrl, { redirect: 'follow' });
    if (!res.ok) throw new Error(`ingestPdf: HTTP ${res.status} fetching ${pathOrUrl}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const os = require('os');
    tmpDownload = path.join(os.tmpdir(), `zed-pdf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.pdf`);
    fs.writeFileSync(tmpDownload, buf);
    localPath = tmpDownload;
  } else {
    localPath = path.resolve(pathOrUrl);
    if (!fs.existsSync(localPath)) {
      throw new Error(`ingestPdf: local file not found: ${localPath}`);
    }
  }

  // Derive a title from the basename (minus extension)
  const basename = path.basename(localPath, path.extname(localPath));
  const title = basename.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Untitled PDF';

  // Try pdftotext
  let textBody = null;
  let extractor = 'stub';
  try {
    const { execFileSync } = require('child_process');
    // `pdftotext -layout <src> -` writes to stdout
    const out = execFileSync('pdftotext', ['-layout', '-nopgbrk', localPath, '-'], {
      encoding: 'utf-8',
      maxBuffer: 20 * 1024 * 1024,
      timeout: 60000,
    });
    if (out && out.trim().length > 0) {
      textBody = out.trim();
      extractor = 'pdftotext';
    }
  } catch (e) {
    // pdftotext missing or failed — stub fallback
  }

  // Build the note
  const slug = slugify(title);
  const fileName = `${todayIso()}-${slug}.md`;
  const absPath = path.join(opts.vaultPath, 'raw', 'papers', fileName);

  const fm = emitFrontmatter({
    title,
    type: 'paper',
    source: sourceUrl || `file://${localPath}`,
    source_host: sourceUrl ? hostFromUrl(sourceUrl) : 'local',
    source_path: localPath,
    clipped: new Date().toISOString(),
    extractor,
    tags: opts.tags && opts.tags.length ? opts.tags : ['clip', 'paper', 'pdf'],
  });

  const header = [
    `# ${title}`,
    '',
    `> Source: ${sourceUrl ? `[${hostFromUrl(sourceUrl)}](${sourceUrl})` : `\`${localPath}\``}  `,
    `> Extractor: ${extractor}`,
    '',
  ].join('\n');

  let body;
  if (textBody) {
    body = '## Extracted text\n\n' + textBody;
  } else {
    body = [
      '## (no text extracted)',
      '',
      '`pdftotext` (from poppler) was not found on PATH. To get full-text',
      'extraction, install it:',
      '',
      '```',
      'brew install poppler     # macOS',
      'apt install poppler-utils # Debian/Ubuntu',
      '```',
      '',
      'In the meantime, Claude can read the PDF directly via the `Read`',
      `tool against \`${localPath}\` — ZED has recorded this path in the`,
      'frontmatter so future searches can find it.',
      '',
    ].join('\n');
  }

  fileLayer.writeNote(absPath, fm + '\n' + header + body + '\n');

  if (tmpDownload) {
    try { fs.unlinkSync(tmpDownload); } catch {}
  }

  if (opts.engine) {
    try { opts.engine.incrementalBuild(); } catch {}
  }

  return {
    path: absPath,
    relPath: path.relative(opts.vaultPath, absPath),
    metadata: {
      title,
      source: sourceUrl || `file://${localPath}`,
      sourcePath: localPath,
      extractor,
      hasText: textBody !== null,
    },
    bytes: Buffer.byteLength(textBody || '', 'utf-8'),
  };
}

// ---------------------------------------------------------------------------
// Git repo ingester — shells out to npx repomix
// ---------------------------------------------------------------------------

async function ingestRepo(gitUrl, opts = {}) {
  if (!opts.vaultPath) throw new Error('ingestRepo: opts.vaultPath is required');
  const { spawn } = require('child_process');

  // Derive repo slug from the URL
  let slug;
  try {
    const parsed = new URL(gitUrl);
    const parts = parsed.pathname.replace(/\.git$/, '').split('/').filter(Boolean);
    slug = parts.slice(-2).join('-') || parsed.hostname;
  } catch {
    slug = 'repo-' + Date.now();
  }

  const fileName = `${todayIso()}-${slugify(slug)}.md`;
  const absPath = path.join(opts.vaultPath, 'raw', 'repos', fileName);
  fs.mkdirSync(path.dirname(absPath), { recursive: true });

  // Use repomix with the --remote flag. Repomix must be available via npx.
  return new Promise((resolve, reject) => {
    const args = ['repomix', '--remote', gitUrl, '-o', absPath, '--style', 'markdown'];
    const proc = spawn('npx', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('error', (err) => reject(new Error(`ingestRepo: spawn failed: ${err.message}`)));
    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ingestRepo: repomix exited ${code}\n${stderr}`));
        return;
      }
      // Repomix writes raw markdown — prepend our frontmatter header
      try {
        const raw = fs.readFileSync(absPath, 'utf-8');
        const fm = emitFrontmatter({
          title: `Repo: ${slug}`,
          type: 'repo-dump',
          source: gitUrl,
          clipped: new Date().toISOString(),
          extractor: 'repomix',
          tags: ['clip', 'repo', 'repomix'],
        });
        const merged = fm + '\n# Repo: ' + slug + '\n\n> Source: ' + gitUrl + '\n\n' + raw;
        fileLayer.writeNote(absPath, merged);
        if (opts.engine) {
          try { opts.engine.incrementalBuild(); } catch {}
        }
        resolve({
          path: absPath,
          relPath: path.relative(opts.vaultPath, absPath),
          metadata: { slug, source: gitUrl },
          bytes: Buffer.byteLength(merged, 'utf-8'),
        });
      } catch (e) {
        reject(e);
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  // Main entry points
  clipUrl,
  ingestYouTube,
  ingestRepo,
  ingestPdf,
  // Pure helpers (exported for tests)
  htmlToNote,
  extractFromHtml,
  buildNote,
  emitFrontmatter,
  slugify,
  hostFromUrl,
  fetchHtml,
  loadAllTemplates,
  buildInterpreter,
};
