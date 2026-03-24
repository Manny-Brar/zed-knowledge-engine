/**
 * mcp-server.mjs — ZED Knowledge Engine MCP Server (Slim)
 *
 * Only 4 MCP tools — the ones Claude needs structured access to during
 * conversations. Everything else is available via the `zed` CLI (bin/zed),
 * which Claude calls through Bash. This saves ~3,500 tokens/turn.
 *
 * MCP Tools:
 *   1. zed_search    — Graph-boosted full-text search
 *   2. zed_read_note — Read a knowledge note
 *   3. zed_write_note — Write/update a note
 *   4. zed_decide    — Create a decision record (ADR)
 *
 * Everything else: `zed <command>` via CLI
 *   zed backlinks, zed hubs, zed clusters, zed path, zed stats,
 *   zed health, zed tags, zed recent, zed overview, zed daily,
 *   zed template, zed rebuild, zed import, zed promote, zed graph,
 *   zed timeline, zed suggest-links, zed snippets, zed global-search,
 *   zed license
 *
 * Transport: stdio (standard for Claude Code plugins)
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
import os from 'os';

// Import CJS core engine
const require = createRequire(import.meta.url);
const KnowledgeEngine = require('../core/engine.cjs');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const DATA_DIR = process.env.CLAUDE_PLUGIN_DATA || path.join(process.env.HOME, '.zed-data');
const VAULT_DIR = path.join(DATA_DIR, 'vault');
const DB_PATH = path.join(DATA_DIR, 'knowledge.db');

// Ensure data directories exist
try {
  for (const dir of [
    VAULT_DIR,
    path.join(VAULT_DIR, 'decisions'),
    path.join(VAULT_DIR, 'patterns'),
    path.join(VAULT_DIR, 'sessions'),
    path.join(VAULT_DIR, 'architecture'),
    path.join(VAULT_DIR, '_loop'),
  ]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
} catch (err) {
  process.stderr.write(`[ZED] Warning: could not create vault directories: ${err.message}\n`);
}

// ---------------------------------------------------------------------------
// Initialize Engine
// ---------------------------------------------------------------------------

let engine;
let engineError = null;

try {
  engine = new KnowledgeEngine({
    vaultPath: VAULT_DIR,
    dbPath: DB_PATH,
  });
  engine.build();
} catch (err) {
  engineError = `Engine failed to initialize: ${err.message}`;
  process.stderr.write(`[ZED] ${engineError}\n`);
}

/**
 * Guard: returns an error response if the engine is not available.
 */
function requireEngine() {
  if (!engine) {
    return { content: [{ type: 'text', text: `Error: ${engineError || 'Engine not available'}` }], isError: true };
  }
  return null;
}

// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'zed-knowledge-engine',
  version: '6.2.0',
});

// ---------------------------------------------------------------------------
// Tool 1: zed_search — Graph-boosted full-text search
// ---------------------------------------------------------------------------

server.tool(
  'zed_search',
  {
    query: z.string().describe('Search query (supports FTS5: AND, OR, NOT, NEAR)'),
    limit: z.number().int().positive().default(10).describe('Max results'),
  },
  async ({ query, limit }) => {
    const guard = requireEngine();
    if (guard) return guard;
    try {
      if (!query || !query.trim()) {
        return { content: [{ type: 'text', text: 'Error: search query must not be empty' }], isError: true };
      }
      const results = engine.searchWithSnippets(query.trim(), { limit });
      if (results.length === 0) {
        return { content: [{ type: 'text', text: `No results for "${query}"` }] };
      }
      const formatted = results.map((r, i) => {
        const snippet = r.snippets && r.snippets.length > 0
          ? r.snippets[0].slice(0, 150)
          : '';
        const snippetLine = snippet ? `\n   Snippet: ${snippet}` : '';
        return `${i + 1}. **${r.node.title}** (score: ${r.score.toFixed(3)}, backlinks: ${r.backlinkCount})\n   Path: ${r.node.path}${snippetLine}`;
      }).join('\n');
      return { content: [{ type: 'text', text: `## Search: "${query}"\n\n${formatted}` }] };
    } catch (err) {
      return { content: [{ type: 'text', text: `Search error: ${err.message}` }], isError: true };
    }
  }
);

// ---------------------------------------------------------------------------
// Tool 2: zed_read_note — Read a knowledge note
// ---------------------------------------------------------------------------

server.tool(
  'zed_read_note',
  {
    note_path: z.string().describe('Absolute path, vault-relative path, or title of the note'),
  },
  async ({ note_path }) => {
    const guard = requireEngine();
    if (guard) return guard;
    try {
      if (!note_path || !note_path.trim()) {
        return { content: [{ type: 'text', text: 'Error: note_path must not be empty' }], isError: true };
      }
      const resolved = resolveNotePath(note_path.trim());
      if (!resolved) return { content: [{ type: 'text', text: `Note not found: ${note_path}` }], isError: true };
      const note = engine.readNote(resolved);
      const text = [
        `## ${note.title}`,
        '',
        `**Path**: ${note.path}`,
        `**Tags**: ${JSON.stringify(note.frontmatter.tags || [])}`,
        `**Wikilinks**: ${note.wikilinks.map(l => l.target).join(', ') || 'none'}`,
        '',
        '---',
        '',
        note.content,
      ].join('\n');
      return { content: [{ type: 'text', text }] };
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
    }
  }
);

// ---------------------------------------------------------------------------
// Tool 3: zed_write_note — Write or update a note
// ---------------------------------------------------------------------------

server.tool(
  'zed_write_note',
  {
    file_name: z.string().describe('Filename or vault-relative path (e.g., "decisions/auth-strategy.md")'),
    content: z.string().describe('Full markdown content including frontmatter'),
  },
  async ({ file_name, content }) => {
    const guard = requireEngine();
    if (guard) return guard;
    try {
      if (!file_name || !file_name.trim()) {
        return { content: [{ type: 'text', text: 'Error: file_name must not be empty' }], isError: true };
      }
      if (!content || !content.trim()) {
        return { content: [{ type: 'text', text: 'Error: content must not be empty' }], isError: true };
      }
      const notePath = path.join(VAULT_DIR, file_name.trim());
      const resolved = path.resolve(notePath);
      if (!resolved.startsWith(path.resolve(VAULT_DIR) + path.sep) && resolved !== path.resolve(VAULT_DIR)) {
        return { content: [{ type: 'text', text: 'Error: path escapes vault directory' }], isError: true };
      }
      engine.writeNote(notePath, content);
      engine.incrementalBuild();

      // Increment capture counter in edit-tracker
      const trackerPathW = path.join(process.env.CLAUDE_PLUGIN_DATA || path.join(os.homedir(), '.zed-data'), 'edit-tracker.json');
      try {
        const tracker = JSON.parse(fs.readFileSync(trackerPathW, 'utf8'));
        tracker.captures = (tracker.captures || 0) + 1;
        fs.writeFileSync(trackerPathW, JSON.stringify(tracker));
      } catch (e) { /* tracker may not exist yet — that's fine */ }

      return { content: [{ type: 'text', text: `Note written: ${file_name}\nGraph updated.` }] };
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
    }
  }
);

// ---------------------------------------------------------------------------
// Tool 4: zed_decide — Create a decision record (ADR)
// ---------------------------------------------------------------------------

server.tool(
  'zed_decide',
  {
    title: z.string().describe('Decision title (e.g., "Use JWT for auth")'),
    context: z.string().describe('What is the context or problem?'),
    decision: z.string().describe('What was decided?'),
    alternatives: z.string().default('').describe('Alternatives considered'),
    consequences: z.string().default('').describe('Consequences of this decision'),
  },
  async ({ title, context, decision, alternatives, consequences }) => {
    const guard = requireEngine();
    if (guard) return guard;
    try {
      if (!title || !title.trim()) {
        return { content: [{ type: 'text', text: 'Error: title must not be empty' }], isError: true };
      }
      if (!context || !context.trim()) {
        return { content: [{ type: 'text', text: 'Error: context must not be empty' }], isError: true };
      }
      if (!decision || !decision.trim()) {
        return { content: [{ type: 'text', text: 'Error: decision must not be empty' }], isError: true };
      }
      const date = new Date().toISOString().split('T')[0];
      const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const fileName = `decisions/${date}-${slug}.md`;
      const content = [
        '---',
        `title: "${title}"`,
        `date: ${date}`,
        'type: decision',
        'tags: [decision]',
        'status: accepted',
        '---',
        '',
        `# ${title}`,
        '',
        '## Context',
        context,
        '',
        '## Decision',
        decision,
        '',
        '## Alternatives Considered',
        alternatives || '_None documented_',
        '',
        '## Consequences',
        consequences || '_To be determined_',
        '',
      ].join('\n');

      const notePath = path.join(VAULT_DIR, fileName);
      engine.writeNote(notePath, content);
      engine.rebuild();

      // Increment capture counter in edit-tracker
      const trackerPathD = path.join(process.env.CLAUDE_PLUGIN_DATA || path.join(os.homedir(), '.zed-data'), 'edit-tracker.json');
      try {
        const tracker = JSON.parse(fs.readFileSync(trackerPathD, 'utf8'));
        tracker.captures = (tracker.captures || 0) + 1;
        fs.writeFileSync(trackerPathD, JSON.stringify(tracker));
      } catch (e) { /* tracker may not exist yet — that's fine */ }

      return { content: [{ type: 'text', text: `Decision recorded: ${fileName}\nTitle: ${title}` }] };
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
    }
  }
);

// ---------------------------------------------------------------------------
// Helper: Resolve note path
// ---------------------------------------------------------------------------

function resolveNotePath(input) {
  const resolvedVault = path.resolve(VAULT_DIR);

  // Helper: check if a path is within the vault
  function isInsideVault(p) {
    const resolved = path.resolve(p);
    return resolved.startsWith(resolvedVault + path.sep) || resolved === resolvedVault;
  }

  if (path.isAbsolute(input) && fs.existsSync(input)) {
    if (!isInsideVault(input)) return null; // Path traversal: outside vault
    return input;
  }
  const vaultRelative = path.join(VAULT_DIR, input);
  if (!isInsideVault(vaultRelative)) return null; // Path traversal: escapes vault
  if (fs.existsSync(vaultRelative)) return vaultRelative;
  if (!input.endsWith('.md')) {
    const withExt = path.join(VAULT_DIR, input + '.md');
    if (isInsideVault(withExt) && fs.existsSync(withExt)) return withExt;
  }
  const notes = engine.listNotes();
  for (const notePath of notes) {
    const basename = path.basename(notePath, '.md');
    if (basename.toLowerCase() === input.toLowerCase()) return notePath;
    try {
      const note = engine.readNote(notePath);
      if (note.title && note.title.toLowerCase() === input.toLowerCase()) return notePath;
    } catch { continue; }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Error handling + Transport
// ---------------------------------------------------------------------------

process.on('uncaughtException', (err) => {
  fs.appendFileSync(
    path.join(DATA_DIR, 'error.log'),
    `[${new Date().toISOString()}] Uncaught: ${err.message}\n${err.stack}\n\n`
  );
});

process.on('unhandledRejection', (reason) => {
  fs.appendFileSync(
    path.join(DATA_DIR, 'error.log'),
    `[${new Date().toISOString()}] Unhandled rejection: ${reason}\n\n`
  );
});

process.on('SIGTERM', () => { try { engine.close(); } catch {} process.exit(0); });
process.on('SIGINT', () => { try { engine.close(); } catch {} process.exit(0); });

const transport = new StdioServerTransport();
await server.connect(transport);
