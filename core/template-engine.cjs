/**
 * template-engine.cjs — ZED v8.0 Clip Template DSL
 *
 * A pure-function template engine compatible with the Obsidian Web Clipper
 * template syntax (so community templates port over with minimal changes),
 * adapted for headless use from a rendered HTML document + URL.
 *
 * Syntax:
 *   Variables:
 *     {{title}}                  — preset variable
 *     {{meta:name:author}}       — <meta name="author">
 *     {{meta:property:og:title}} — <meta property="og:title">
 *     {{selector:.article h1}}   — text of CSS selector
 *     {{selectorHtml:.article}}  — raw HTML of CSS selector
 *     {{schema:@Article:author}} — JSON-LD schema.org lookup
 *     {{"prompt text"}}          — Interpreter prompt (resolved by caller)
 *
 *   Filter pipeline:
 *     {{content|markdown|trim|slice:0,4000}}
 *
 * Filters implemented (28):
 *   trim, upper, lower, capitalize, title_case, reverse, length, strip_md,
 *   slice, replace, default, split, join, first, last, unique, map,
 *   safe_name, safe_filename, date, markdown, blockquote, callout, link,
 *   wikilink, image, list, number, safe
 *
 * Templates are JSON objects with:
 *   { name, behavior, noteNameFormat, path, properties, noteContentFormat,
 *     triggers, context }
 *
 * This module is intentionally offline — no fetch, no LLM. The caller
 * provides HTML + URL + (optional) interpreter callback.
 */

'use strict';

const path = require('path');
const fs = require('fs');

// ---------------------------------------------------------------------------
// Filter registry
// ---------------------------------------------------------------------------

function toArray(v) {
  if (Array.isArray(v)) return v;
  if (v === undefined || v === null) return [];
  return [v];
}

function pad2(n) { return String(n).padStart(2, '0'); }

function formatDate(value, fmt) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return String(value);
  fmt = fmt || 'YYYY-MM-DD';
  return fmt
    .replace(/YYYY/g, d.getFullYear())
    .replace(/MM/g, pad2(d.getMonth() + 1))
    .replace(/DD/g, pad2(d.getDate()))
    .replace(/HH/g, pad2(d.getHours()))
    .replace(/mm/g, pad2(d.getMinutes()))
    .replace(/ss/g, pad2(d.getSeconds()));
}

const FILTERS = {
  trim: (v) => (typeof v === 'string' ? v.trim() : String(v || '').trim()),

  upper: (v) => String(v || '').toUpperCase(),

  lower: (v) => String(v || '').toLowerCase(),

  capitalize: (v) => {
    const s = String(v || '');
    return s.length ? s[0].toUpperCase() + s.slice(1) : s;
  },

  title_case: (v) =>
    String(v || '')
      .split(/\s+/)
      .map((w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
      .join(' '),

  reverse: (v) => {
    if (Array.isArray(v)) return v.slice().reverse();
    return String(v || '').split('').reverse().join('');
  },

  length: (v) => {
    if (Array.isArray(v) || typeof v === 'string') return v.length;
    if (v && typeof v === 'object') return Object.keys(v).length;
    return 0;
  },

  strip_md: (v) =>
    String(v || '')
      .replace(/```[\s\S]*?```/g, '')
      .replace(/`[^`]+`/g, '')
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/[#*_~>|]/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim(),

  slice: (v, start, end) => {
    const s = start !== undefined ? parseInt(start, 10) : 0;
    const e = end !== undefined ? parseInt(end, 10) : undefined;
    if (Array.isArray(v)) return v.slice(s, e);
    return String(v || '').slice(s, e);
  },

  replace: (v, from, to) => {
    if (from === undefined) return v;
    const str = String(v || '');
    // global replace, literal (not regex) — matches Web Clipper behaviour
    return str.split(from).join(to || '');
  },

  default: (v, fallback) =>
    v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)
      ? fallback
      : v,

  split: (v, sep) => String(v || '').split(sep === undefined ? ',' : sep),

  join: (v, sep) => toArray(v).join(sep === undefined ? ', ' : sep),

  first: (v) => {
    const a = toArray(v);
    return a.length ? a[0] : '';
  },

  last: (v) => {
    const a = toArray(v);
    return a.length ? a[a.length - 1] : '';
  },

  unique: (v) => Array.from(new Set(toArray(v))),

  map: (v, expr) => {
    // Very limited: supports "x => x.name" or "x => x.trim()"
    const arr = toArray(v);
    if (!expr) return arr;
    const m = expr.match(/^\s*(\w+)\s*=>\s*(.+)$/);
    if (!m) return arr;
    const [, argName, body] = m;
    try {
      // eslint-disable-next-line no-new-func
      const fn = new Function(argName, `return (${body});`);
      return arr.map((x) => {
        try { return fn(x); } catch { return x; }
      });
    } catch {
      return arr;
    }
  },

  safe_name: (v) => {
    // Filesystem-safe but preserves spaces
    const s = String(v || '');
    return s
      .replace(/[\\/:*?"<>|]/g, '-')
      .replace(/\s+/g, ' ')
      .trim();
  },

  safe_filename: (v) => {
    const s = String(v || '').toLowerCase();
    return s
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'untitled';
  },

  date: (v, fmt) => formatDate(v, fmt),

  markdown: (v) => {
    // HTML → markdown is the responsibility of the renderer; when a selectorHtml
    // upstream variable passes raw HTML, this filter triggers a conversion.
    // We look up a lazy-loaded turndown instance.
    const html = String(v || '');
    const turndownMod = (() => {
      try { return require('turndown'); } catch { return null; }
    })();
    if (!turndownMod) return html; // graceful: pass through raw
    const TurndownService = turndownMod.default || turndownMod;
    const td = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
      bulletListMarker: '-',
    });
    return td.turndown(html);
  },

  blockquote: (v) =>
    String(v || '')
      .split('\n')
      .map((line) => '> ' + line)
      .join('\n'),

  callout: (v, type) => {
    const t = type || 'note';
    return `> [!${t}]\n` +
      String(v || '')
        .split('\n')
        .map((line) => '> ' + line)
        .join('\n');
  },

  link: (v, url) => {
    if (!url) return String(v || '');
    return `[${v || ''}](${url})`;
  },

  wikilink: (v) => {
    // Wraps a bare title into a [[wikilink]].
    const s = String(v || '').trim();
    if (!s) return '';
    if (s.startsWith('[[') && s.endsWith(']]')) return s;
    return `[[${s}]]`;
  },

  image: (v, alt) => {
    if (!v) return '';
    return `![${alt || ''}](${v})`;
  },

  list: (v, marker) => {
    const m = marker || '-';
    return toArray(v).map((item) => `${m} ${item}`).join('\n');
  },

  number: (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  },

  safe: (v) => String(v || '').replace(/[<>&"']/g, (c) => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;',
  }[c])),
};

// ---------------------------------------------------------------------------
// Variable resolver — reads from a rendered context
// ---------------------------------------------------------------------------

/**
 * Build a context object that variable lookups will resolve against.
 *
 * The context bundles: raw HTML, a jsdom document (if available), the URL,
 * current date, preset variables (title/author/etc), and an optional
 * interpreter callback for {{"prompt"}} variables.
 *
 * @param {Object} opts
 * @param {string} opts.html
 * @param {string} opts.url
 * @param {Object} [opts.presets]  — pre-resolved values (title, author, ...)
 * @param {Object} [opts.document] — a jsdom-like document (optional)
 * @param {Function} [opts.interpret] — async (prompt, contextText) => string
 */
function buildContext(opts) {
  const now = new Date();
  const urlObj = (() => { try { return new URL(opts.url); } catch { return null; } })();
  const presets = Object.assign(
    {
      title: '',
      author: '',
      content: '',
      contentHtml: '',
      fullHtml: opts.html || '',
      url: opts.url || '',
      site: urlObj ? urlObj.hostname : '',
      domain: urlObj ? urlObj.hostname.replace(/^www\./, '') : '',
      date: now,
      time: now,
      published: '',
      description: '',
      image: '',
      highlights: [],
    },
    opts.presets || {}
  );

  return {
    html: opts.html || '',
    url: opts.url || '',
    document: opts.document || null,
    presets,
    interpret: opts.interpret || null,
  };
}

function resolvePresetVar(name, ctx) {
  if (name in ctx.presets) return ctx.presets[name];
  return '';
}

function resolveMetaVar(spec, ctx) {
  // meta:name:author  OR  meta:property:og:title
  const [kind, ...rest] = spec.split(':');
  const attrName = rest.join(':');
  if (!ctx.document) {
    // crude regex fallback from raw html
    const re = new RegExp(
      `<meta[^>]+${kind}=["']${escapeRegExp(attrName)}["'][^>]*content=["']([^"']*)["']`,
      'i'
    );
    const m = ctx.html.match(re);
    return m ? m[1] : '';
  }
  const el = ctx.document.querySelector(`meta[${kind}="${attrName}"]`);
  return el ? el.getAttribute('content') || '' : '';
}

function resolveSelectorVar(spec, ctx, asHtml) {
  if (!ctx.document) return '';
  // optional attribute extraction: selector?attr
  const attrMatch = spec.match(/^(.*)\?([\w-]+)$/);
  const sel = attrMatch ? attrMatch[1] : spec;
  const attr = attrMatch ? attrMatch[2] : null;
  try {
    const el = ctx.document.querySelector(sel);
    if (!el) return '';
    if (attr) return el.getAttribute(attr) || '';
    return asHtml ? el.innerHTML : (el.textContent || '');
  } catch {
    return '';
  }
}

function resolveSchemaVar(spec, ctx) {
  // schema:@Article:author  OR  schema:author
  if (!ctx.document) return '';
  const scripts = ctx.document.querySelectorAll('script[type="application/ld+json"]');
  const blobs = [];
  scripts.forEach((s) => {
    try {
      const parsed = JSON.parse(s.textContent || '');
      if (Array.isArray(parsed)) blobs.push(...parsed);
      else blobs.push(parsed);
    } catch {}
  });
  // Normalise {@graph: [...]}
  const nodes = [];
  for (const b of blobs) {
    if (b && Array.isArray(b['@graph'])) nodes.push(...b['@graph']);
    else nodes.push(b);
  }
  const parts = spec.split(':');
  let typeFilter = null;
  let fieldPath;
  if (parts[0].startsWith('@')) {
    typeFilter = parts[0].slice(1);
    fieldPath = parts.slice(1);
  } else {
    fieldPath = parts;
  }
  const candidates = typeFilter
    ? nodes.filter((n) => {
        const t = n && n['@type'];
        if (!t) return false;
        if (Array.isArray(t)) return t.includes(typeFilter);
        return t === typeFilter;
      })
    : nodes;
  for (const n of candidates) {
    const v = walkPath(n, fieldPath);
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return '';
}

function walkPath(obj, segments) {
  let cur = obj;
  for (let i = 0; i < segments.length; i++) {
    if (cur === undefined || cur === null) return undefined;
    const seg = segments[i];
    const wildcard = seg.match(/^(.+)\[\*\]$/);
    if (wildcard) {
      const key = wildcard[1];
      const arr = cur[key];
      if (!Array.isArray(arr)) return undefined;
      const rest = segments.slice(i + 1);
      return arr.map((x) => (rest.length ? walkPath(x, rest) : x));
    }
    cur = cur[seg];
  }
  return cur;
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---------------------------------------------------------------------------
// Tokenizer — split a template string into text + variable tokens
// ---------------------------------------------------------------------------

/**
 * Parse a template string into tokens. Variables use {{...}}. Supports nested
 * quoted strings (for interpreter prompts) and the filter pipeline `|`.
 *
 * Returns an array of { type: 'text'|'var', value, raw } tokens.
 */
function tokenize(tpl) {
  if (!tpl) return [];
  const tokens = [];
  let i = 0;
  const n = tpl.length;
  while (i < n) {
    const start = tpl.indexOf('{{', i);
    if (start === -1) {
      tokens.push({ type: 'text', value: tpl.slice(i) });
      break;
    }
    if (start > i) {
      tokens.push({ type: 'text', value: tpl.slice(i, start) });
    }
    // Find the matching }} (accounting for quoted strings)
    let j = start + 2;
    let inStr = null;
    while (j < n) {
      const c = tpl[j];
      if (inStr) {
        if (c === '\\' && j + 1 < n) { j += 2; continue; }
        if (c === inStr) inStr = null;
      } else if (c === '"' || c === "'") {
        inStr = c;
      } else if (c === '}' && tpl[j + 1] === '}') {
        break;
      }
      j++;
    }
    if (j >= n) {
      // unterminated — treat rest as text
      tokens.push({ type: 'text', value: tpl.slice(start) });
      break;
    }
    const inner = tpl.slice(start + 2, j);
    tokens.push({ type: 'var', value: inner, raw: tpl.slice(start, j + 2) });
    i = j + 2;
  }
  return tokens;
}

/**
 * Parse a single variable expression: `base|filter1|filter2:arg1,arg2`
 * into { base, filters: [{name, args}] }.
 */
function parseVarExpression(expr) {
  // Split on | that is NOT inside quotes
  const parts = [];
  let buf = '';
  let inStr = null;
  for (let k = 0; k < expr.length; k++) {
    const c = expr[k];
    if (inStr) {
      if (c === '\\' && k + 1 < expr.length) { buf += c + expr[k + 1]; k++; continue; }
      if (c === inStr) inStr = null;
      buf += c;
    } else if (c === '"' || c === "'") {
      inStr = c;
      buf += c;
    } else if (c === '|') {
      parts.push(buf);
      buf = '';
    } else {
      buf += c;
    }
  }
  if (buf.length) parts.push(buf);

  const base = parts[0].trim();
  const filters = parts.slice(1).map((p) => {
    const s = p.trim();
    const colonIdx = s.indexOf(':');
    if (colonIdx === -1) return { name: s, args: [] };
    const name = s.slice(0, colonIdx).trim();
    const argStr = s.slice(colonIdx + 1);
    return { name, args: parseFilterArgs(argStr) };
  });
  return { base, filters };
}

function parseFilterArgs(argStr) {
  // Web Clipper syntax allows both `,` and `:` as filter-arg separators:
  //   slice:0,100            → args = ["0", "100"]
  //   replace:"old":"new"    → args = ["old", "new"]
  // Quoted strings preserve their inner characters verbatim.
  const args = [];
  let buf = '';
  let inStr = null;
  for (let k = 0; k < argStr.length; k++) {
    const c = argStr[k];
    if (inStr) {
      if (c === '\\' && k + 1 < argStr.length) { buf += argStr[k + 1]; k++; continue; }
      if (c === inStr) { inStr = null; continue; }
      buf += c;
    } else if (c === '"' || c === "'") {
      inStr = c;
    } else if (c === ',' || c === ':') {
      args.push(buf);
      buf = '';
    } else {
      buf += c;
    }
  }
  if (buf.length || argStr.length > 0) args.push(buf);
  return args.map((a) => a.trim());
}

// ---------------------------------------------------------------------------
// Resolver — turn a variable expression into a final string
// ---------------------------------------------------------------------------

function resolveBase(base, ctx) {
  const trimmed = base.trim();

  // Interpreter prompt: {{"prompt"}} or {{'prompt'}}
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    const prompt = trimmed.slice(1, -1);
    if (ctx.interpret) {
      // interpret is async — the caller of render() must use renderAsync.
      return { __prompt: prompt };
    }
    return '';
  }

  // Prefixed lookups
  if (trimmed.startsWith('meta:')) {
    return resolveMetaVar(trimmed.slice(5), ctx);
  }
  if (trimmed.startsWith('selectorHtml:')) {
    return resolveSelectorVar(trimmed.slice(13), ctx, true);
  }
  if (trimmed.startsWith('selector:')) {
    return resolveSelectorVar(trimmed.slice(9), ctx, false);
  }
  if (trimmed.startsWith('schema:')) {
    return resolveSchemaVar(trimmed.slice(7), ctx);
  }

  // Preset variable (title, author, url, ...)
  return resolvePresetVar(trimmed, ctx);
}

function applyFilters(value, filters) {
  let v = value;
  for (const f of filters) {
    const fn = FILTERS[f.name];
    if (!fn) continue; // unknown filter — skip silently
    try {
      v = fn(v, ...f.args);
    } catch {
      // filter error — skip
    }
  }
  return v;
}

/**
 * Synchronously render a template string against a context. Interpreter
 * prompts ({{"..."}}) are left as empty strings if the context has no
 * interpret callback; use renderAsync() to run them.
 */
function render(tpl, ctx) {
  const tokens = tokenize(tpl);
  const out = [];
  for (const tok of tokens) {
    if (tok.type === 'text') {
      out.push(tok.value);
      continue;
    }
    const { base, filters } = parseVarExpression(tok.value);
    let v = resolveBase(base, ctx);
    if (v && typeof v === 'object' && v.__prompt !== undefined) {
      v = ''; // sync render can't run prompts
    }
    v = applyFilters(v, filters);
    if (Array.isArray(v)) v = v.join(', ');
    if (v === undefined || v === null) v = '';
    out.push(String(v));
  }
  return out.join('');
}

/**
 * Async render: collects all interpreter prompts in a template into a single
 * batch, calls ctx.interpret(prompt, pageContext) once per unique prompt, then
 * substitutes the results.
 */
async function renderAsync(tpl, ctx) {
  const tokens = tokenize(tpl);

  // Pre-pass: collect prompts for batching
  const prompts = new Map(); // prompt string -> result
  for (const tok of tokens) {
    if (tok.type !== 'var') continue;
    const { base } = parseVarExpression(tok.value);
    const trimmed = base.trim();
    if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
        (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
      const p = trimmed.slice(1, -1);
      prompts.set(p, null);
    }
  }

  if (prompts.size > 0 && ctx.interpret) {
    for (const p of prompts.keys()) {
      try {
        const r = await ctx.interpret(p, ctx);
        prompts.set(p, r || '');
      } catch {
        prompts.set(p, '');
      }
    }
  }

  // Render
  const out = [];
  for (const tok of tokens) {
    if (tok.type === 'text') {
      out.push(tok.value);
      continue;
    }
    const { base, filters } = parseVarExpression(tok.value);
    let v;
    const trimmed = base.trim();
    if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
        (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
      v = prompts.get(trimmed.slice(1, -1)) || '';
    } else {
      v = resolveBase(base, ctx);
    }
    v = applyFilters(v, filters);
    if (Array.isArray(v)) v = v.join(', ');
    if (v === undefined || v === null) v = '';
    out.push(String(v));
  }
  return out.join('');
}

// ---------------------------------------------------------------------------
// Template loader / matcher
// ---------------------------------------------------------------------------

/**
 * Load all JSON templates from a directory. Returns an array sorted by
 * priority (name field).
 */
function loadTemplates(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const ent of entries) {
    if (!ent.isFile() || !ent.name.endsWith('.json')) continue;
    try {
      const raw = fs.readFileSync(path.join(dir, ent.name), 'utf-8');
      const parsed = JSON.parse(raw);
      parsed._file = ent.name;
      out.push(parsed);
    } catch (e) {
      // Skip malformed templates
    }
  }
  return out;
}

/**
 * Pick the first template whose triggers match the given URL. Triggers can be:
 *   - "https://docs.claude.com/"         — prefix match
 *   - "/docs\\.claude\\.com/"            — regex (leading + trailing /)
 *   - "schema:@NewsArticle"              — schema.org type (requires doc)
 * Returns null if nothing matches.
 */
function matchTemplate(templates, url, document) {
  for (const tpl of templates) {
    const triggers = tpl.triggers || [];
    for (const trig of triggers) {
      if (typeof trig !== 'string') continue;
      if (trig.startsWith('schema:@')) {
        if (!document) continue;
        const want = trig.slice(8);
        const scripts = document.querySelectorAll('script[type="application/ld+json"]');
        let hit = false;
        scripts.forEach((s) => {
          try {
            const obj = JSON.parse(s.textContent || '');
            const walk = (node) => {
              if (!node) return;
              if (Array.isArray(node)) { node.forEach(walk); return; }
              const t = node['@type'];
              if (t === want || (Array.isArray(t) && t.includes(want))) hit = true;
              if (node['@graph']) walk(node['@graph']);
            };
            walk(obj);
          } catch {}
        });
        if (hit) return tpl;
      } else if (trig.startsWith('/') && trig.endsWith('/') && trig.length > 2) {
        try {
          const re = new RegExp(trig.slice(1, -1));
          if (re.test(url)) return tpl;
        } catch {}
      } else {
        if (url.startsWith(trig)) return tpl;
      }
    }
  }
  return null;
}

/**
 * Render a full template against a context, producing:
 *   { noteName, pathDir, content, properties, behavior }
 */
async function renderTemplate(tpl, ctx) {
  const noteName = tpl.noteNameFormat
    ? await renderAsync(tpl.noteNameFormat, ctx)
    : '';
  const pathDir = tpl.path ? await renderAsync(tpl.path, ctx) : '';
  const contextVal = tpl.context ? await renderAsync(tpl.context, ctx) : '';
  // Make 'context' available as a preset for the content template
  const ctx2 = Object.assign({}, ctx, {
    presets: Object.assign({}, ctx.presets, { context: contextVal }),
  });
  const content = tpl.noteContentFormat
    ? await renderAsync(tpl.noteContentFormat, ctx2)
    : '';
  const properties = [];
  for (const prop of tpl.properties || []) {
    properties.push({
      name: prop.name,
      value: await renderAsync(String(prop.value), ctx2),
      type: prop.type || 'text',
    });
  }
  return {
    noteName: (noteName || '').trim(),
    pathDir: (pathDir || '').trim(),
    content,
    properties,
    behavior: tpl.behavior || 'create',
  };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  FILTERS,
  buildContext,
  render,
  renderAsync,
  tokenize,
  parseVarExpression,
  loadTemplates,
  matchTemplate,
  renderTemplate,
  // Internal resolvers (tested directly)
  resolveBase,
  applyFilters,
};
