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

// ---------------------------------------------------------------------------
// Initialize Engine
// ---------------------------------------------------------------------------

const engine = new KnowledgeEngine({
  vaultPath: VAULT_DIR,
  dbPath: DB_PATH,
});

engine.build();

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
    try {
      const results = engine.searchNotes(query, { limit });
      if (results.length === 0) {
        return { content: [{ type: 'text', text: `No results for "${query}"` }] };
      }
      const formatted = results.map((r, i) =>
        `${i + 1}. **${r.node.title}** (score: ${r.boostedScore.toFixed(3)}, backlinks: ${r.backlinkCount})\n   Path: ${r.node.path}`
      ).join('\n');
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
    try {
      const resolved = resolveNotePath(note_path);
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
    try {
      const notePath = path.join(VAULT_DIR, file_name);
      engine.writeNote(notePath, content);
      engine.rebuild();
      return { content: [{ type: 'text', text: `Note written: ${file_name}\nGraph rebuilt.` }] };
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
    try {
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
  if (path.isAbsolute(input) && fs.existsSync(input)) return input;
  const vaultRelative = path.join(VAULT_DIR, input);
  if (fs.existsSync(vaultRelative)) return vaultRelative;
  if (!input.endsWith('.md')) {
    const withExt = path.join(VAULT_DIR, input + '.md');
    if (fs.existsSync(withExt)) return withExt;
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
