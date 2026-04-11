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
const ingestLayer = require('../core/ingest-layer.cjs');
const wikiLayer = require('../core/wiki-layer.cjs');
const councilLib = require('../core/council.cjs');
const pkgVersion = require('../package.json').version;

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
    // v8.0 — Karpathy-style raw/wiki/schema layout
    path.join(VAULT_DIR, 'raw'),
    path.join(VAULT_DIR, 'raw', 'clips'),
    path.join(VAULT_DIR, 'raw', 'repos'),
    path.join(VAULT_DIR, 'raw', 'papers'),
    path.join(VAULT_DIR, 'raw', 'transcripts'),
    path.join(VAULT_DIR, 'wiki'),
    path.join(VAULT_DIR, 'wiki', 'concepts'),
    path.join(VAULT_DIR, 'wiki', 'entities'),
    path.join(VAULT_DIR, 'wiki', 'syntheses'),
    path.join(VAULT_DIR, '_templates'),
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
  version: pkgVersion,
});

// ---------------------------------------------------------------------------
// Tool 1: zed_search — Graph-boosted full-text search
// ---------------------------------------------------------------------------

server.tool(
  'zed_search',
  `Search the knowledge vault using full-text search with graph-boosted ranking. Returns notes ranked by text relevance multiplied by graph connectivity (notes with more backlinks rank higher).

Use this BEFORE starting any task to check if relevant prior work exists. Also use when you need to find a specific decision, pattern, or architecture note.

Query syntax: Plain text for simple searches. Supports FTS5 operators: AND, OR, NOT, NEAR. Example: "auth AND jwt" finds notes containing both terms. "architecture NOT deprecated" excludes deprecated notes.

Returns: Title, relevance score, backlink count, file path, and a 150-char content snippet for each result. Results from the global vault (cross-project) are tagged with [GLOBAL].

When to use vs alternatives:
- Use zed_search for finding notes by content
- Use 'zed related <note>' via Bash for graph traversal from a known note
- Use 'zed backlinks <note>' via Bash for finding what links TO a note`,
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
      const formatted = results.map((r, i) => {
        const snippet = r.snippets && r.snippets.length > 0
          ? r.snippets[0].slice(0, 150)
          : '';
        const snippetLine = snippet ? `\n   Snippet: ${snippet}` : '';
        const contextLine = r.contextSummary ? `\n   Context: ${r.contextSummary}` : '';
        return `${i + 1}. **${r.node.title}** (score: ${r.score.toFixed(3)}, backlinks: ${r.backlinkCount})${contextLine}\n   Path: ${r.node.path}${snippetLine}`;
      });

      // Search global vault for cross-project patterns
      const globalDir = path.join(os.homedir(), '.zed', 'global');
      if (fs.existsSync(globalDir)) {
        try {
          const globalEngine = new KnowledgeEngine({
            vaultPath: globalDir,
            dbPath: path.join(os.homedir(), '.zed', 'global.db'),
          });
          globalEngine.build();
          const globalResults = globalEngine.searchWithSnippets(query.trim(), { limit: 3 });
          for (const r of globalResults) {
            // Deduplicate by title — skip if already in project results
            if (!results.some(pr => pr.node.title === r.node.title)) {
              const snippet = r.snippets && r.snippets.length > 0
                ? r.snippets[0].slice(0, 150)
                : '';
              const snippetLine = snippet ? `\n   Snippet: ${snippet}` : '';
              formatted.push(`${formatted.length + 1}. **[GLOBAL] ${r.node.title}** (score: ${r.score.toFixed(3)})\n   Path: ${r.node.path}${snippetLine}`);
            }
          }
          globalEngine.close();
        } catch (e) {
          // Global vault search failure is non-fatal
        }
      }

      if (formatted.length === 0) {
        return { content: [{ type: 'text', text: `No results for "${query}"` }] };
      }
      return { content: [{ type: 'text', text: `## Search: "${query}"\n\n${formatted.join('\n')}` }] };
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
  `Read the full content of a knowledge note from the vault. Returns the complete markdown including frontmatter (title, tags, type, date), body text, and all [[wikilinks]].

Accepts: A note path (relative to vault or absolute), a filename, or a note title. The resolver tries exact path first, then searches by filename, then by title.

Use this after zed_search returns results you want to examine in detail. The search snippet (150 chars) shows relevance; read_note gives the full context.

Common patterns:
- Search then read top result then follow wikilinks to related notes
- Read a decision record to understand WHY a choice was made
- Read a pattern to apply it to current work`,
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
  `Create or update a markdown note in the knowledge vault. The note is indexed in the knowledge graph immediately after writing.

Content must include frontmatter with at least a title and 2 tags:
---
title: "Your Note Title"
type: decision|pattern|architecture|daily|research|note
tags: [tag1, tag2]
date: YYYY-MM-DD
---

Use [[wikilinks]] in the body to connect to other notes. Each link creates an edge in the knowledge graph, making both notes easier to find via graph-boosted search.

File paths are relative to the vault root. Use subdirectories to organize:
- decisions/ for Architecture Decision Records
- patterns/ for reusable patterns and anti-patterns
- architecture/ for system architecture notes
- research/ for research findings
- sessions/ for daily session notes
- projects/ for project-level documentation

Do NOT use this for routine code changes. Only write notes that are genuinely persistence-worthy: decisions between alternatives, patterns that worked/failed, architecture insights, research findings.`,
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

      // Check for potential duplicates before writing
      let duplicateWarning = '';
      try {
        const titleMatch = content.match(/^title:\s*["']?(.+?)["']?\s*$/m);
        if (titleMatch) {
          const newTitle = titleMatch[1].trim().toLowerCase();
          const searchResults = engine.searchNotes(newTitle, { limit: 5 });
          const potentialDupes = searchResults.filter(r => {
            const existingTitle = (r.node.title || '').toLowerCase();
            // Similarity: check if titles share >60% of words (with prefix matching)
            const newWords = newTitle.split(/\s+/).filter(w => w.length > 2);
            const existingWords = existingTitle.split(/\s+/).filter(w => w.length > 2);
            if (newWords.length === 0 || existingWords.length === 0) return false;
            // Count matches including prefix relationships (auth ~ authentication)
            const overlap = newWords.filter(nw =>
              existingWords.some(ew => ew === nw || ew.startsWith(nw) || nw.startsWith(ew))
            ).length;
            const similarity = overlap / Math.max(newWords.length, existingWords.length);
            return similarity > 0.6 && r.node.path !== resolved;
          });

          if (potentialDupes.length > 0) {
            duplicateWarning = `\n\nPossible duplicate(s) detected:\n${potentialDupes.slice(0, 3).map(d => `- "${d.node.title}" at ${d.node.path}`).join('\n')}\nConsider updating the existing note instead of creating a new one.`;
          }
        }
      } catch (e) { /* non-fatal */ }

      engine.writeNote(notePath, content);
      engine.incrementalBuild();

      // Increment capture counter in edit-tracker
      const trackerPathW = path.join(process.env.CLAUDE_PLUGIN_DATA || path.join(os.homedir(), '.zed-data'), 'edit-tracker.json');
      try {
        const tracker = JSON.parse(fs.readFileSync(trackerPathW, 'utf8'));
        tracker.captures = (tracker.captures || 0) + 1;
        fs.writeFileSync(trackerPathW, JSON.stringify(tracker));
      } catch (e) { /* tracker may not exist yet — that's fine */ }

      let resultText = `Note written: ${file_name}\nGraph updated.`;

      // Auto-suggest wikilinks for the new note (H-6: use DB query instead of O(N) file reads)
      try {
        const suggestions = [];
        const allTitles = engine.graph.db.prepare('SELECT title, path FROM nodes').all();
        const bodyLower = content.toLowerCase();
        const selfPath = path.join(VAULT_DIR, file_name.trim());

        for (const row of allTitles) {
          if (!row.title || row.path === selfPath) continue;
          const titleLower = row.title.toLowerCase();
          // Check if the note body mentions this title (and doesn't already have a wikilink)
          if (titleLower.length > 3 && bodyLower.includes(titleLower) && !content.includes(`[[${row.title}]]`)) {
            suggestions.push(row.title);
          }
        }

        if (suggestions.length > 0) {
          resultText += `\n\nSuggested wikilinks (mentioned but not linked): ${suggestions.slice(0, 5).map(t => `[[${t}]]`).join(', ')}`;
        }
      } catch (e) { /* non-fatal */ }

      return { content: [{ type: 'text', text: resultText + duplicateWarning }] };
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
  `Create a structured Architecture Decision Record (ADR) in the vault. ADRs capture WHY you chose X over Y — the reasoning, not just the outcome.

Creates a markdown file at decisions/YYYY-MM-DD-<slug>.md with structured sections: Context, Decision, Alternatives, Consequences.

Use this whenever you:
- Choose between 2+ implementation approaches
- Define or change an architecture boundary
- Evaluate a trade-off (performance vs readability, etc.)
- Make a technology choice (library, framework, pattern)

Do NOT use for routine decisions (variable naming, formatting). Only for decisions that a future developer would want to understand.

The 'alternatives' parameter is optional but valuable — documenting what you DIDN'T choose and why prevents future developers from re-evaluating the same options.`,
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
      // Truncate extremely long inputs with warning
      const MAX_INPUT = 10000;
      let truncWarning = '';
      if (title.length > MAX_INPUT) { title = title.slice(0, MAX_INPUT); truncWarning += ' title'; }
      if (context.length > MAX_INPUT) { context = context.slice(0, MAX_INPUT); truncWarning += ' context'; }
      if (decision.length > MAX_INPUT) { decision = decision.slice(0, MAX_INPUT); truncWarning += ' decision'; }
      if (alternatives && alternatives.length > MAX_INPUT) { alternatives = alternatives.slice(0, MAX_INPUT); truncWarning += ' alternatives'; }
      if (consequences && consequences.length > MAX_INPUT) { consequences = consequences.slice(0, MAX_INPUT); truncWarning += ' consequences'; }
      const date = new Date().toISOString().split('T')[0];
      let slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      // Handle edge cases: empty slug (title was only special chars/unicode)
      if (!slug) slug = 'untitled';
      // Truncate long slugs (>200 chars in title can produce long filenames)
      if (slug.length > 80) slug = slug.slice(0, 80).replace(/-$/, '');
      // Avoid reserved filenames on Windows (CON, NUL, PRN, AUX, etc.)
      const RESERVED = new Set(['con', 'prn', 'aux', 'nul', 'com1', 'com2', 'com3', 'com4', 'com5', 'com6', 'com7', 'com8', 'com9', 'lpt1', 'lpt2', 'lpt3', 'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9']);
      if (RESERVED.has(slug)) slug = slug + '-decision';
      const fileName = `decisions/${date}-${slug}.md`;
      const safeTitle = title.replace(/"/g, '\\"');
      const content = [
        '---',
        `title: "${safeTitle}"`,
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
      engine.incrementalBuild();

      // Increment capture counter in edit-tracker
      const trackerPathD = path.join(process.env.CLAUDE_PLUGIN_DATA || path.join(os.homedir(), '.zed-data'), 'edit-tracker.json');
      try {
        const tracker = JSON.parse(fs.readFileSync(trackerPathD, 'utf8'));
        tracker.captures = (tracker.captures || 0) + 1;
        fs.writeFileSync(trackerPathD, JSON.stringify(tracker));
      } catch (e) { /* tracker may not exist yet — that's fine */ }

      let resultText = `Decision recorded: ${fileName}\nTitle: ${title}`;

      // Suggest related decisions
      try {
        const related = engine.searchNotes(title, 3);
        if (related.length > 1) { // >1 because the new note itself will match
          const relatedTitles = related
            .filter(r => !r.node.path.includes(slug))
            .slice(0, 3)
            .map(r => r.node.title);
          if (relatedTitles.length > 0) {
            resultText += `\n\nRelated decisions: ${relatedTitles.map(t => `[[${t}]]`).join(', ')}`;
          }
        }
      } catch (e) { /* non-fatal */ }

      return { content: [{ type: 'text', text: resultText }] };
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
    }
  }
);

// ---------------------------------------------------------------------------
// Tool 5 (v8.0): zed_clip — Web clip URL → raw/clips/ markdown
// ---------------------------------------------------------------------------

server.tool(
  'zed_clip',
  `Clip a web page as clean markdown into the vault's raw/clips/ directory. Uses Playwright + Defuddle for JS-rendered extraction and falls back to fetch() + Readability when Playwright is unavailable.

Use this when you want to persist an external article, documentation page, research paper HTML, or any URL as a first-class node in the knowledge graph. The clipped note is indexed immediately — a subsequent zed_search will find it.

Do NOT use for:
- Code repositories (use Bash: 'zed ingest-repo <url>')
- YouTube videos (use Bash: 'zed ingest-yt <url>')
- PDFs (use the native Claude PDF support or 'zed ingest-pdf')

The clipped note includes YAML frontmatter (title, source, author, clipped-at, extractor, tags). Use the returned path with zed_read_note if you want to examine the full text afterward.

Strategy flag:
- 'auto' (default): try playwright if available, else fetch
- 'playwright': force playwright (needed for SPAs, auth)
- 'fetch': plain HTTP (fast, no JS rendering)`,
  {
    url: z.string().url().describe('HTTP/HTTPS URL to clip'),
    tags: z.array(z.string()).default([]).describe('Optional tags to add to frontmatter'),
    strategy: z.enum(['auto', 'playwright', 'fetch']).default('auto').describe('Fetch strategy'),
  },
  async ({ url, tags, strategy }) => {
    const guard = requireEngine();
    if (guard) return guard;
    try {
      const result = await ingestLayer.clipUrl(url, {
        vaultPath: VAULT_DIR,
        engine,
        strategy,
        tags,
      });
      const m = result.metadata || {};
      const text = [
        `Clipped: **${m.title || '(untitled)'}**`,
        '',
        `- Path: \`${result.relPath}\``,
        `- Source: ${m.source || url}`,
        `- Author: ${m.author || '-'}`,
        `- Strategy: ${m.fetchStrategy} / ${m.extractor}`,
        `- Size: ${result.bytes} bytes`,
        '',
        'Indexed into the knowledge graph. Search for it with zed_search or read with zed_read_note.',
      ].join('\n');
      return { content: [{ type: 'text', text }] };
    } catch (err) {
      return { content: [{ type: 'text', text: `Clip error: ${err.message}` }], isError: true };
    }
  }
);

// ---------------------------------------------------------------------------
// Tool 6 (v8.0): zed_wiki_compile — Karpathy-style compile plan + index
// ---------------------------------------------------------------------------

server.tool(
  'zed_wiki_compile',
  `Run the Karpathy-style wiki compile pass. Scans vault/raw/ for clips, papers, repo dumps, and transcripts; cross-references them against vault/wiki/ entries; reports a plan (uncompiled, stale, orphaned); and rebuilds wiki/index.md + wiki/log.md.

This tool is DETERMINISTIC — it does not call an LLM. It produces a job list that YOU (Claude, in this session) are expected to act on:

For each uncompiled raw file:
1. Read the raw file (zed_read_note)
2. Classify into wiki/concepts/ | wiki/entities/ | wiki/syntheses/
3. Write a wiki entry (zed_write_note) with frontmatter containing
   'source_paths' (list of raw/ relPaths) and 'summary' (one-sentence).
4. Run zed_wiki_compile again to update the index.

See the wiki-compiler skill for the full compile protocol. Use the 'synthesize' flag to instead write a deterministic session-snapshot note under wiki/syntheses/ — useful as a pre-compaction hook to persist recent vault activity as a searchable artifact.`,
  {
    since: z.number().int().positive().optional().describe('Only scan raw files modified in the last N hours'),
    synthesize: z.boolean().default(false).describe('Write a session-synthesis snapshot instead of running a compile plan'),
    label: z.string().optional().describe('Label for the synthesis file (only with synthesize:true)'),
  },
  async ({ since, synthesize, label }) => {
    const guard = requireEngine();
    if (guard) return guard;
    try {
      wikiLayer.ensureSchema(VAULT_DIR);

      if (synthesize) {
        const result = wikiLayer.writeSessionSynthesis({ vaultPath: VAULT_DIR, since: since || 24, label });
        try { engine.incrementalBuild(); } catch {}
        return { content: [{ type: 'text', text:
          `Session synthesis written: \`${result.relPath}\` (${result.noteCount} notes, last ${since || 24}h).`
        }] };
      }

      const plan = wikiLayer.planCompile({ vaultPath: VAULT_DIR, since });
      const idx = wikiLayer.updateIndex({ vaultPath: VAULT_DIR });
      wikiLayer.appendLog(
        `compile: ${plan.rawCount} raw, ${plan.wikiCount} wiki, ${plan.uncompiled.length} uncompiled, ${plan.stale.length} stale`,
        { vaultPath: VAULT_DIR }
      );
      try { engine.incrementalBuild(); } catch {}

      const lines = [
        `## Wiki Compile Plan`,
        '',
        `- Raw sources:  **${plan.rawCount}**`,
        `- Wiki entries: **${plan.wikiCount}** (excl. index.md / log.md; index updated with ${idx.entries} entries)`,
        `- Uncompiled:   **${plan.uncompiled.length}**`,
        `- Stale:        **${plan.stale.length}**`,
        `- Orphan wiki:  **${plan.orphanWiki.length}**`,
        '',
      ];
      if (plan.uncompiled.length > 0) {
        lines.push('### Next uncompiled sources');
        lines.push('');
        for (const r of plan.uncompiled.slice(0, 15)) {
          lines.push(`- \`${r.relPath}\` — ${r.title || '(untitled)'}`);
        }
        if (plan.uncompiled.length > 15) lines.push(`- _...and ${plan.uncompiled.length - 15} more_`);
        lines.push('');
        lines.push('**Next step**: Read each raw file with `zed_read_note`, classify into wiki/concepts/, wiki/entities/, or wiki/syntheses/, then write the wiki entry with `zed_write_note` and include a `source_paths` frontmatter field.');
      }
      if (plan.stale.length > 0) {
        lines.push('', '### Stale wiki entries');
        lines.push('');
        for (const s of plan.stale.slice(0, 10)) {
          lines.push(`- \`${s.wiki.relPath}\` ← \`${s.source.relPath}\``);
        }
      }
      return { content: [{ type: 'text', text: lines.join('\n') }] };
    } catch (err) {
      return { content: [{ type: 'text', text: `Compile error: ${err.message}` }], isError: true };
    }
  }
);

// ---------------------------------------------------------------------------
// Tool 7 (v8.0): zed_wiki_health — lint the wiki layer
// ---------------------------------------------------------------------------

server.tool(
  'zed_wiki_health',
  `Lint the vault/wiki/ layer: find uncompiled raw sources, stale entries, orphaned wiki files, broken [[wikilinks]], and entries missing source_paths provenance. Returns a 0-100 health score with a breakdown and specific remediation items.

Use this:
- At session start (check for work left behind)
- After a compile pass (verify the output)
- Periodically during evolve loops (keep the knowledge base clean)

The score penalises uncompiled raw, stale entries, orphans, broken links, and entries with no provenance.`,
  {},
  async () => {
    const guard = requireEngine();
    if (guard) return guard;
    try {
      const h = wikiLayer.healthCheck({ vaultPath: VAULT_DIR });
      const lines = [
        `## Wiki Health: ${h.score}/100 (${h.grade})`,
        '',
        `- Raw sources:      **${h.rawCount}**`,
        `- Wiki entries:     **${h.wikiCount}** (excl. index.md / log.md)`,
        `- Uncompiled:       ${h.uncompiled.length}`,
        `- Stale:            ${h.stale.length}`,
        `- Orphan wiki:      ${h.orphanWiki.length}`,
        `- Broken wikilinks: ${h.brokenLinks.length}`,
        `- No provenance:    ${h.noProvenance.length}`,
        `- Expired:          ${(h.expired || []).length}`,
        `- Superseded:       ${(h.superseded || []).length}`,
      ];
      if (h.brokenLinks.length > 0) {
        lines.push('', '### Broken wikilinks');
        for (const b of h.brokenLinks.slice(0, 10)) {
          lines.push(`- \`${b.from}\` → [[${b.target}]]`);
        }
      }
      if (h.noProvenance.length > 0) {
        lines.push('', '### Wiki entries missing source_paths');
        for (const w of h.noProvenance.slice(0, 10)) {
          lines.push(`- \`${w.relPath}\` — ${w.title || '(untitled)'}`);
        }
      }
      if ((h.expired || []).length > 0) {
        lines.push('', '### Expired entries');
        for (const e of h.expired.slice(0, 10)) {
          lines.push(`- \`${e.wiki.relPath}\` — expired ${e.expired_at}`);
        }
      }
      if ((h.superseded || []).length > 0) {
        lines.push('', '### Superseded entries');
        for (const s of h.superseded.slice(0, 10)) {
          const mark = s.replacement_found ? '✓ replacement exists' : '✗ replacement missing';
          lines.push(`- \`${s.wiki.relPath}\` → [[${s.superseded_by}]]  (${mark})`);
        }
      }
      return { content: [{ type: 'text', text: lines.join('\n') }] };
    } catch (err) {
      return { content: [{ type: 'text', text: `wiki-health error: ${err.message}` }], isError: true };
    }
  }
);

// ---------------------------------------------------------------------------
// Tool 8 (v8.0): zed_council — Karpathy llm-council for tier-3 decisions
// ---------------------------------------------------------------------------

server.tool(
  'zed_council',
  `Run an LLM council for a high-stakes decision. Implements Karpathy's llm-council pattern:
  1. Stage 1: dispatch the question to N models (claude + gpt + gemini by default)
  2. Stage 2: each model anonymously ranks the others' answers and gives a 1-sentence critique
  3. Stage 3: a "chairman" model synthesizes a final consensus + dissent answer

REQUIRES environment variables: ANTHROPIC_API_KEY (for claude) and/or OPENROUTER_API_KEY (for gpt/gemini/grok). If neither is set, returns a structured failure note rather than throwing.

Use this for Tier 3 decisions only — it is expensive (3 parallel model calls + 3 ranking calls + 1 synthesis = 7 API calls). Do NOT use for routine questions.

Good use cases:
- "Should we use Defuddle or Mozilla Readability as the primary extractor?"
- "Is this architecture safe under concurrent writes?"
- "What are the failure modes of this evolve-mode loop?"

The returned verdict has a 'consensus' and 'dissent' section — read both before acting. If the models strongly disagree, PREFER the dissent reasoning over the consensus.`,
  {
    question: z.string().min(3).describe('The question for the council to deliberate'),
    models: z.array(z.string()).optional().describe('Model aliases (claude, gpt, gemini, claude-sonnet, ...)'),
    chairman: z.string().optional().describe('Alias for the synthesizer (default: claude)'),
  },
  async ({ question, models, chairman }) => {
    const guard = requireEngine();
    if (guard) return guard;
    try {
      const result = await councilLib.council(question, { models, chairman });
      if (result.answers.length === 0) {
        const errLines = (result.errors || []).slice(0, 5).map((e) => `- ${e.alias} [stage ${e.stage}]: ${e.error}`);
        return { content: [{ type: 'text', text:
          `## Council failed\n\n${result.note || 'no models returned an answer'}\n\n${errLines.join('\n')}`
        }], isError: true };
      }
      const out = [`# Council: ${question}`, '', '## Answers', ''];
      for (const a of result.answers) {
        out.push(`### ${a.letter}. ${a.alias} — ${a.model}`);
        out.push('');
        out.push(a.text);
        out.push('');
      }
      if (result.leaderboard.length > 0) {
        out.push('## Peer ranking');
        for (const e of result.leaderboard) {
          const r = e.avgRank !== null ? e.avgRank.toFixed(2) : '—';
          out.push(`- ${e.letter}. ${e.alias}: avg rank ${r} (${e.votes} votes)`);
        }
        out.push('');
      }
      if (result.verdict) {
        out.push(`## Chairman verdict (${result.verdict.chairman}: ${result.verdict.model})`);
        out.push('');
        out.push(result.verdict.text);
      }
      return { content: [{ type: 'text', text: out.join('\n') }] };
    } catch (err) {
      return { content: [{ type: 'text', text: `council error: ${err.message}` }], isError: true };
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
