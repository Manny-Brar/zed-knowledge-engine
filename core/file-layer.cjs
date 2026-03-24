/**
 * file-layer.cjs — Markdown File I/O Layer
 *
 * Scans directories for .md files, parses [[wikilinks]], extracts YAML
 * frontmatter, watches for file changes. Foundation layer for the
 * Nelson Knowledge Engine.
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Frontmatter Parsing
// ---------------------------------------------------------------------------

/**
 * Parse YAML frontmatter from markdown content.
 * Handles basic key-value pairs, lists, and nested values.
 * Returns an empty object if no frontmatter is found.
 *
 * @param {string} content - Raw markdown file content
 * @returns {{ frontmatter: Record<string, any>, body: string }}
 */
function parseFrontmatter(content) {
  if (!content || typeof content !== 'string') {
    return { frontmatter: {}, body: content || '' };
  }

  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) {
    return { frontmatter: {}, body: content };
  }

  const yamlBlock = match[1];
  const body = content.slice(match[0].length);
  const frontmatter = {};

  const lines = yamlBlock.split(/\r?\n/);
  let currentKey = null;

  for (const line of lines) {
    // Skip empty lines and comments
    if (!line.trim() || line.trim().startsWith('#')) continue;

    // List item under current key (starts with "  - " or "- " after a key)
    const listMatch = line.match(/^\s+-\s+(.*)/);
    if (listMatch && currentKey) {
      if (!Array.isArray(frontmatter[currentKey])) {
        frontmatter[currentKey] = [];
      }
      frontmatter[currentKey].push(listMatch[1].trim());
      continue;
    }

    // Key-value pair
    const kvMatch = line.match(/^(\w[\w\s-]*):\s*(.*)/);
    if (kvMatch) {
      const key = kvMatch[1].trim();
      const rawVal = kvMatch[2].trim();
      currentKey = key;

      if (rawVal === '') {
        // Could be a list or nested block — leave as empty, list items will fill it
        frontmatter[key] = '';
      } else if (rawVal.startsWith('[') && rawVal.endsWith(']')) {
        // Inline YAML list: [a, b, c]
        frontmatter[key] = rawVal
          .slice(1, -1)
          .split(',')
          .map(s => s.trim().replace(/^["']|["']$/g, ''))
          .filter(Boolean);
      } else if (rawVal === 'true') {
        frontmatter[key] = true;
      } else if (rawVal === 'false') {
        frontmatter[key] = false;
      } else if (/^\d+$/.test(rawVal)) {
        frontmatter[key] = parseInt(rawVal, 10);
      } else if (/^\d+\.\d+$/.test(rawVal)) {
        frontmatter[key] = parseFloat(rawVal);
      } else {
        // Strip surrounding quotes
        frontmatter[key] = rawVal.replace(/^["']|["']$/g, '');
      }
    }
  }

  return { frontmatter, body };
}

// ---------------------------------------------------------------------------
// Wikilink Parsing
// ---------------------------------------------------------------------------

/**
 * Extract all [[wikilinks]] from markdown content.
 * Supports aliases: [[target|display text]]
 * Supports headings: [[target#heading]]
 * Supports block refs: [[target^blockid]]
 *
 * @param {string} content - Raw markdown content
 * @returns {Array<{ target: string, alias: string|null, raw: string }>}
 */
function parseWikilinks(content) {
  if (!content || typeof content !== 'string') return [];

  const results = [];
  const regex = /\[\[([^\]]+)\]\]/g;
  let match;

  while ((match = regex.exec(content)) !== null) {
    const inner = match[1];
    const raw = match[0];

    // Split on pipe for alias: [[target|alias]]
    const pipeIdx = inner.indexOf('|');
    let target, alias;

    if (pipeIdx !== -1) {
      target = inner.slice(0, pipeIdx).trim();
      alias = inner.slice(pipeIdx + 1).trim();
    } else {
      target = inner.trim();
      alias = null;
    }

    results.push({ target, alias, raw });
  }

  return results;
}

// ---------------------------------------------------------------------------
// File Scanning & I/O
// ---------------------------------------------------------------------------

/**
 * Recursively list all .md files in a directory.
 *
 * @param {string} dirPath - Absolute path to the directory to scan
 * @param {Object} [opts] - Options
 * @param {string[]} [opts.ignore] - Directory names to skip (default: ['node_modules', '.git', '.obsidian'])
 * @returns {string[]} Array of absolute file paths
 */
function listNotes(dirPath, opts = {}) {
  const ignore = opts.ignore || ['node_modules', '.git', '.obsidian', '.trash'];
  const results = [];

  function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (err) {
      // Permission denied or missing dir — skip silently
      return;
    }

    for (const entry of entries) {
      if (ignore.includes(entry.name)) continue;

      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        results.push(fullPath);
      }
    }
  }

  walk(path.resolve(dirPath));
  return results;
}

/**
 * Read a single markdown note and return parsed content.
 *
 * @param {string} filePath - Absolute path to the .md file
 * @returns {{ path: string, title: string, content: string, frontmatter: Record<string, any>, body: string, wikilinks: Array<{ target: string, alias: string|null, raw: string }>, wordCount: number }}
 */
function readNote(filePath) {
  const resolved = path.resolve(filePath);
  const content = fs.readFileSync(resolved, 'utf-8');
  const { frontmatter, body } = parseFrontmatter(content);
  const wikilinks = parseWikilinks(body);

  // Title: frontmatter title > first H1 > filename
  let title = frontmatter.title || null;
  if (!title) {
    const h1Match = body.match(/^#\s+(.+)/m);
    title = h1Match ? h1Match[1].trim() : path.basename(resolved, '.md');
  }

  // Word count on body text (excluding frontmatter)
  const wordCount = body
    .replace(/```[\s\S]*?```/g, '') // strip code blocks
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // strip markdown links
    .replace(/[#*_~`>|[\]()-]/g, ' ') // strip markdown syntax
    .split(/\s+/)
    .filter(w => w.length > 0).length;

  return {
    path: resolved,
    title,
    content,
    frontmatter,
    body,
    wikilinks,
    wordCount,
  };
}

/**
 * Write content to a markdown file. Creates parent directories if needed.
 *
 * @param {string} filePath - Absolute path to write
 * @param {string} content - Full file content (including frontmatter if desired)
 */
function writeNote(filePath, content) {
  if (!content || !content.trim()) {
    throw new Error('writeNote: content must not be empty');
  }
  const resolved = path.resolve(filePath);
  const dir = path.dirname(resolved);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Atomic write: write to temp file, then rename
  const tmpPath = resolved + '.tmp.' + process.pid;
  try {
    fs.writeFileSync(tmpPath, content, 'utf-8');
    fs.renameSync(tmpPath, resolved);
  } catch (e) {
    // Clean up temp file on failure
    try { fs.unlinkSync(tmpPath); } catch (_) {}
    throw e;
  }
}

// ---------------------------------------------------------------------------
// File Watcher
// ---------------------------------------------------------------------------

/**
 * Watch a directory for .md file changes. Debounces rapid events.
 *
 * @param {string} dirPath - Directory to watch
 * @param {Function} callback - Called with (eventType, filePath) on change
 * @param {Object} [opts] - Options
 * @param {number} [opts.debounceMs] - Debounce interval in ms (default: 300)
 * @returns {{ close: Function }} Watcher handle — call .close() to stop
 */
function watchNotes(dirPath, callback, opts = {}) {
  const debounceMs = opts.debounceMs || 300;
  const timers = new Map();

  const watcher = fs.watch(dirPath, { recursive: true }, (eventType, filename) => {
    if (!filename || !filename.endsWith('.md')) return;

    const fullPath = path.join(dirPath, filename);
    const key = fullPath;

    // Debounce: clear existing timer for this file
    if (timers.has(key)) {
      clearTimeout(timers.get(key));
    }

    timers.set(key, setTimeout(() => {
      timers.delete(key);
      callback(eventType, fullPath);
    }, debounceMs));
  });

  return {
    close() {
      watcher.close();
      for (const timer of timers.values()) {
        clearTimeout(timer);
      }
      timers.clear();
    },
  };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  parseFrontmatter,
  parseWikilinks,
  listNotes,
  readNote,
  writeNote,
  watchNotes,
};
