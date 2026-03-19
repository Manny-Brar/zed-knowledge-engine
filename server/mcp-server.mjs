/**
 * mcp-server.mjs — Nelson Knowledge Engine MCP Server
 *
 * Exposes the knowledge engine as MCP tools for Claude Code.
 * 12 tools: search, backlinks, related, hubs, clusters, shortest_path,
 * stats, read_note, write_note, decide, daily, rebuild.
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

const DATA_DIR = process.env.CLAUDE_PLUGIN_DATA || path.join(process.env.HOME, '.nelson-ke-data');
const VAULT_DIR = path.join(DATA_DIR, 'vault');
const DB_PATH = path.join(DATA_DIR, 'knowledge.db');

// Global vault (cross-project patterns and learnings)
const GLOBAL_DIR = path.join(process.env.HOME, '.nelson-ke', 'global');
const GLOBAL_DB_PATH = path.join(process.env.HOME, '.nelson-ke', 'global.db');

// Ensure data directories exist
for (const dir of [
  VAULT_DIR,
  path.join(VAULT_DIR, 'decisions'),
  path.join(VAULT_DIR, 'patterns'),
  path.join(VAULT_DIR, 'sessions'),
  path.join(VAULT_DIR, 'architecture'),
  GLOBAL_DIR,
  path.join(GLOBAL_DIR, 'patterns'),
  path.join(GLOBAL_DIR, 'learnings'),
]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ---------------------------------------------------------------------------
// Initialize License Manager
// ---------------------------------------------------------------------------

const { LicenseManager } = require('../core/license.cjs');
const license = new LicenseManager(DATA_DIR);

// ---------------------------------------------------------------------------
// Initialize Engine
// ---------------------------------------------------------------------------

const engine = new KnowledgeEngine({
  vaultPath: VAULT_DIR,
  dbPath: DB_PATH,
});

// Build index on startup (fast for empty vaults, necessary for populated ones)
engine.build();

// Initialize global engine (cross-project knowledge)
const globalEngine = new KnowledgeEngine({
  vaultPath: GLOBAL_DIR,
  dbPath: GLOBAL_DB_PATH,
});
globalEngine.build();

// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'nelson-knowledge-engine',
  version: '6.0.0',
});

// ---------------------------------------------------------------------------
// Tool 1: ke_search — Graph-boosted full-text search
// ---------------------------------------------------------------------------

server.tool(
  'ke_search',
  {
    query: z.string().describe('Search query (supports FTS5 operators: AND, OR, NOT, NEAR)'),
    limit: z.number().int().positive().default(10).describe('Maximum number of results'),
  },
  async ({ query, limit }) => {
    try {
      const results = engine.searchNotes(query, { limit });
      if (results.length === 0) {
        return { content: [{ type: 'text', text: `No results found for "${query}"` }] };
      }
      const formatted = results.map((r, i) =>
        `${i + 1}. **${r.node.title}** (score: ${r.boostedScore.toFixed(3)}, backlinks: ${r.backlinkCount})\n   Path: ${r.node.path}`
      ).join('\n');
      return { content: [{ type: 'text', text: `## Search Results for "${query}"\n\n${formatted}` }] };
    } catch (err) {
      return { content: [{ type: 'text', text: `Search error: ${err.message}` }], isError: true };
    }
  }
);

// ---------------------------------------------------------------------------
// Tool 2: ke_backlinks — Get backlinks pointing to a note
// ---------------------------------------------------------------------------

server.tool(
  'ke_backlinks',
  {
    note_path: z.string().describe('Absolute path to the note, or title to search for'),
  },
  async ({ note_path }) => {
    try {
      const resolved = resolveNotePath(note_path);
      if (!resolved) return { content: [{ type: 'text', text: `Note not found: ${note_path}` }], isError: true };
      const backlinks = engine.getBacklinks(resolved);
      if (backlinks.length === 0) {
        return { content: [{ type: 'text', text: `No backlinks found for "${path.basename(resolved)}"` }] };
      }
      const formatted = backlinks.map(b =>
        `- **${b.source_title}** → "${b.link_text}"\n  Context: ${b.context}`
      ).join('\n');
      return { content: [{ type: 'text', text: `## Backlinks to ${path.basename(resolved)}\n\n${formatted}` }] };
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
    }
  }
);

// ---------------------------------------------------------------------------
// Tool 3: ke_related — Find related notes within N hops
// ---------------------------------------------------------------------------

server.tool(
  'ke_related',
  {
    note_path: z.string().describe('Absolute path to the note, or title to search for'),
    max_hops: z.number().int().min(1).max(5).default(2).describe('Maximum number of hops in the graph'),
  },
  async ({ note_path, max_hops }) => {
    try {
      const resolved = resolveNotePath(note_path);
      if (!resolved) return { content: [{ type: 'text', text: `Note not found: ${note_path}` }], isError: true };
      const related = engine.getRelated(resolved, max_hops);
      if (related.length === 0) {
        return { content: [{ type: 'text', text: `No related notes found within ${max_hops} hops` }] };
      }
      const formatted = related.map(r =>
        `- **${r.node.title}** (${r.distance} hop${r.distance > 1 ? 's' : ''})`
      ).join('\n');
      return { content: [{ type: 'text', text: `## Related to ${path.basename(resolved)} (within ${max_hops} hops)\n\n${formatted}` }] };
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
    }
  }
);

// ---------------------------------------------------------------------------
// Tool 4: ke_hubs — Find most-connected knowledge nodes
// ---------------------------------------------------------------------------

server.tool(
  'ke_hubs',
  {
    limit: z.number().int().positive().default(10).describe('Number of hubs to return'),
  },
  async ({ limit }) => {
    try {
      const hubs = engine.findHubs(limit);
      if (hubs.length === 0) {
        return { content: [{ type: 'text', text: 'No hubs found (empty knowledge graph)' }] };
      }
      const formatted = hubs.map((h, i) =>
        `${i + 1}. **${h.title}** — ${h.backlink_count} backlinks`
      ).join('\n');
      return { content: [{ type: 'text', text: `## Knowledge Hubs\n\n${formatted}` }] };
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
    }
  }
);

// ---------------------------------------------------------------------------
// Tool 5: ke_clusters — Detect knowledge clusters
// ---------------------------------------------------------------------------

server.tool(
  'ke_clusters',
  {},
  async () => {
    try {
      const clusters = engine.getClusters();
      if (clusters.length === 0) {
        return { content: [{ type: 'text', text: 'No clusters found (empty knowledge graph)' }] };
      }
      const formatted = clusters.map((c, i) =>
        `### Cluster ${i + 1} (${c.length} notes)\n${c.map(n => `- ${n.title}`).join('\n')}`
      ).join('\n\n');
      return { content: [{ type: 'text', text: `## Knowledge Clusters\n\n${formatted}` }] };
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
    }
  }
);

// ---------------------------------------------------------------------------
// Tool 6: ke_shortest_path — Find connection between two notes
// ---------------------------------------------------------------------------

server.tool(
  'ke_shortest_path',
  {
    from_note: z.string().describe('Source note path or title'),
    to_note: z.string().describe('Target note path or title'),
  },
  async ({ from_note, to_note }) => {
    try {
      const fromResolved = resolveNotePath(from_note);
      const toResolved = resolveNotePath(to_note);
      if (!fromResolved) return { content: [{ type: 'text', text: `Source note not found: ${from_note}` }], isError: true };
      if (!toResolved) return { content: [{ type: 'text', text: `Target note not found: ${to_note}` }], isError: true };
      const sp = engine.shortestPath(fromResolved, toResolved);
      if (!sp) {
        return { content: [{ type: 'text', text: `No path found between "${from_note}" and "${to_note}"` }] };
      }
      const formatted = sp.map(n => n.title).join(' → ');
      return { content: [{ type: 'text', text: `## Path: ${formatted}\n\n${sp.length - 1} hops` }] };
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
    }
  }
);

// ---------------------------------------------------------------------------
// Tool 7: ke_stats — Vault statistics
// ---------------------------------------------------------------------------

server.tool(
  'ke_stats',
  {},
  async () => {
    try {
      const stats = engine.getStats();
      const text = [
        '## Knowledge Engine Stats',
        '',
        `- **Notes**: ${stats.nodeCount}`,
        `- **Connections**: ${stats.edgeCount}`,
        `- **Orphans**: ${stats.orphanCount}`,
        `- **Clusters**: ${stats.clusterCount}`,
        `- **Vault path**: ${VAULT_DIR}`,
        `- **Database**: ${DB_PATH}`,
      ].join('\n');
      return { content: [{ type: 'text', text }] };
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
    }
  }
);

// ---------------------------------------------------------------------------
// Tool 8: ke_read_note — Read a knowledge note
// ---------------------------------------------------------------------------

server.tool(
  'ke_read_note',
  {
    note_path: z.string().describe('Absolute path or title of the note to read'),
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
        `**Word count**: ${note.wordCount}`,
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
// Tool 9: ke_write_note — Write/update a knowledge note
// ---------------------------------------------------------------------------

server.tool(
  'ke_write_note',
  {
    file_name: z.string().describe('Filename (e.g., "my-decision.md") or relative path within vault (e.g., "decisions/auth-strategy.md")'),
    content: z.string().describe('Full markdown content including frontmatter'),
  },
  async ({ file_name, content }) => {
    try {
      const notePath = path.join(VAULT_DIR, file_name);
      engine.writeNote(notePath, content);
      // Rebuild to pick up new note in graph
      engine.rebuild();
      return { content: [{ type: 'text', text: `Note written: ${notePath}\nGraph rebuilt with new note.` }] };
    } catch (err) {
      return { content: [{ type: 'text', text: `Error writing note: ${err.message}` }], isError: true };
    }
  }
);

// ---------------------------------------------------------------------------
// Tool 10: ke_decide — Create a decision record
// ---------------------------------------------------------------------------

server.tool(
  'ke_decide',
  {
    title: z.string().describe('Title of the decision (e.g., "Use JWT for authentication")'),
    context: z.string().describe('What is the context or problem?'),
    decision: z.string().describe('What was decided?'),
    alternatives: z.string().default('').describe('What alternatives were considered?'),
    consequences: z.string().default('').describe('What are the consequences of this decision?'),
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
        `tags: [decision]`,
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
      return { content: [{ type: 'text', text: `Decision record created: ${fileName}\nTitle: ${title}\nGraph rebuilt.` }] };
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
    }
  }
);

// ---------------------------------------------------------------------------
// Tool 11: ke_daily — Get or create today's session note
// ---------------------------------------------------------------------------

server.tool(
  'ke_daily',
  {
    append: z.string().default('').describe('Optional text to append to today\'s session note'),
  },
  async ({ append }) => {
    try {
      const date = new Date().toISOString().split('T')[0];
      const fileName = `sessions/${date}.md`;
      const notePath = path.join(VAULT_DIR, fileName);

      if (fs.existsSync(notePath)) {
        // Read existing
        if (append) {
          const existing = fs.readFileSync(notePath, 'utf-8');
          fs.writeFileSync(notePath, existing + '\n' + append + '\n', 'utf-8');
          engine.rebuild();
          return { content: [{ type: 'text', text: `Appended to ${fileName}` }] };
        }
        const note = engine.readNote(notePath);
        return { content: [{ type: 'text', text: note.content }] };
      }

      // Create new daily note
      const content = [
        '---',
        `title: "Session ${date}"`,
        `date: ${date}`,
        'type: daily',
        'tags: [session, daily]',
        '---',
        '',
        `# Session Notes — ${date}`,
        '',
        '## Work Done',
        append || '- _Session started_',
        '',
        '## Decisions Made',
        '',
        '## Patterns Learned',
        '',
        '## Next Session',
        '',
      ].join('\n');

      engine.writeNote(notePath, content);
      engine.rebuild();
      return { content: [{ type: 'text', text: `Daily note created: ${fileName}` }] };
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
    }
  }
);

// ---------------------------------------------------------------------------
// Tool 12: ke_rebuild — Rebuild graph index
// ---------------------------------------------------------------------------

server.tool(
  'ke_rebuild',
  {},
  async () => {
    try {
      const start = Date.now();
      const result = engine.rebuild();
      const elapsed = Date.now() - start;
      return {
        content: [{
          type: 'text',
          text: `Graph rebuilt in ${elapsed}ms\nNodes: ${result.nodeCount}\nEdges: ${result.edgeCount}`,
        }],
      };
    } catch (err) {
      return { content: [{ type: 'text', text: `Rebuild error: ${err.message}` }], isError: true };
    }
  }
);

// ---------------------------------------------------------------------------
// Tool 13: ke_import — Import markdown files from a directory
// ---------------------------------------------------------------------------

server.tool(
  'ke_import',
  {
    source_dir: z.string().describe('Directory path to scan for .md files to import'),
    subdirectory: z.string().default('imported').describe('Vault subdirectory to place imported files in'),
  },
  async ({ source_dir, subdirectory }) => {
    try {
      const resolvedSource = path.resolve(source_dir);
      if (!fs.existsSync(resolvedSource)) {
        return { content: [{ type: 'text', text: `Directory not found: ${resolvedSource}` }], isError: true };
      }

      const fileLayerMod = require('../core/file-layer.cjs');
      const sourceFiles = fileLayerMod.listNotes(resolvedSource);

      if (sourceFiles.length === 0) {
        return { content: [{ type: 'text', text: `No .md files found in ${resolvedSource}` }] };
      }

      const targetDir = path.join(VAULT_DIR, subdirectory);
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      let imported = 0;
      let skipped = 0;
      const importedFiles = [];

      for (const sourceFile of sourceFiles) {
        const relativeName = path.relative(resolvedSource, sourceFile);
        const targetFile = path.join(targetDir, relativeName);
        const targetParent = path.dirname(targetFile);

        // Don't overwrite existing files
        if (fs.existsSync(targetFile)) {
          skipped++;
          continue;
        }

        if (!fs.existsSync(targetParent)) {
          fs.mkdirSync(targetParent, { recursive: true });
        }

        // Read source, add frontmatter if missing
        let content = fs.readFileSync(sourceFile, 'utf-8');
        const { frontmatter } = fileLayerMod.parseFrontmatter(content);

        if (Object.keys(frontmatter).length === 0) {
          const title = path.basename(sourceFile, '.md');
          const date = new Date().toISOString().split('T')[0];
          content = `---\ntitle: "${title}"\ndate: ${date}\ntype: imported\ntags: [imported]\n---\n\n${content}`;
        }

        fs.writeFileSync(targetFile, content, 'utf-8');
        imported++;
        importedFiles.push(relativeName);
      }

      // Rebuild graph
      engine.rebuild();

      const text = [
        `## Import Complete`,
        '',
        `- **Imported**: ${imported} files`,
        `- **Skipped**: ${skipped} (already exist)`,
        `- **Source**: ${resolvedSource}`,
        `- **Destination**: ${targetDir}`,
        '',
        imported > 0 ? `### Imported Files\n${importedFiles.map(f => `- ${f}`).join('\n')}` : '',
      ].join('\n');

      return { content: [{ type: 'text', text }] };
    } catch (err) {
      return { content: [{ type: 'text', text: `Import error: ${err.message}` }], isError: true };
    }
  }
);

// ---------------------------------------------------------------------------
// Tool 14: ke_license — License management
// ---------------------------------------------------------------------------

server.tool(
  'ke_license',
  {
    action: z.enum(['status', 'activate']).describe('Action: "status" to check license, "activate" to activate a key'),
    key: z.string().default('').describe('License key (required for activate action)'),
  },
  async ({ action, key }) => {
    try {
      if (action === 'activate') {
        if (!key) {
          return { content: [{ type: 'text', text: 'Please provide a license key. Format: KE6-XXXX-XXXX-XXXX-XXXX' }], isError: true };
        }
        const result = license.activate(key);
        return { content: [{ type: 'text', text: result.success ? `License activated! ${result.message}` : `Activation failed: ${result.message}` }] };
      }

      // Status
      const status = license.getStatus();
      const lines = [
        '## License Status',
        '',
        `- **Status**: ${status.valid ? 'Active' : 'Inactive'}`,
        `- **Tier**: ${status.tier}`,
        `- **Reason**: ${status.reason}`,
      ];
      if (status.daysRemaining !== null) {
        lines.push(`- **Days remaining**: ${status.daysRemaining}`);
      }
      if (status.key) {
        lines.push(`- **Key**: ${status.key.slice(0, 8)}...${status.key.slice(-4)}`);
      }
      if (!status.valid) {
        lines.push('', 'Activate with: `/ke:activate KE6-XXXX-XXXX-XXXX-XXXX`');
      }
      return { content: [{ type: 'text', text: lines.join('\n') }] };
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
    }
  }
);

// ---------------------------------------------------------------------------
// Tool 14: ke_graph_data — Export graph data for visualization
// ---------------------------------------------------------------------------

server.tool(
  'ke_graph_data',
  {
    filter_type: z.string().default('').describe('Filter nodes by type (e.g., "decision", "pattern", "daily"). Empty for all.'),
    max_nodes: z.number().int().positive().default(50).describe('Maximum number of nodes to include'),
  },
  async ({ filter_type, max_nodes }) => {
    try {
      const stats = engine.getStats();
      const hubs = engine.findHubs(max_nodes);
      const clusters = engine.getClusters();
      const orphans = engine.getOrphans();

      // Build nodes list with metadata
      const nodes = [];
      const edgesOut = [];

      for (const hub of hubs.slice(0, max_nodes)) {
        // Parse tags from JSON string
        let tags = [];
        try { tags = JSON.parse(hub.tags || '[]'); } catch {}

        if (filter_type && hub.type !== filter_type && !tags.includes(filter_type)) continue;

        nodes.push({
          id: hub.id,
          title: hub.title,
          type: hub.type || 'note',
          backlinks: hub.backlink_count,
          path: hub.path,
        });

        // Get outlinks for this node
        const outlinks = engine.getOutlinks(hub.path);
        for (const link of outlinks) {
          edgesOut.push({
            from: hub.title,
            to: link.target_title,
            label: link.link_text,
          });
        }
      }

      const data = {
        stats,
        nodes,
        edges: edgesOut,
        clusters: clusters.map((c, i) => ({
          id: i + 1,
          size: c.length,
          members: c.map(n => n.title),
        })),
        orphans: orphans.map(o => o.title),
      };

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(data, null, 2),
        }],
      };
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
    }
  }
);

// ---------------------------------------------------------------------------
// Tool 16: ke_global_search — Search across project + global vaults
// ---------------------------------------------------------------------------

server.tool(
  'ke_global_search',
  {
    query: z.string().describe('Search query'),
    limit: z.number().int().positive().default(10).describe('Max results per vault'),
  },
  async ({ query, limit }) => {
    try {
      const projectResults = engine.searchNotes(query, { limit });
      const globalResults = globalEngine.searchNotes(query, { limit });

      const sections = [];

      if (projectResults.length > 0) {
        sections.push('### Project Knowledge\n' + projectResults.map((r, i) =>
          `${i + 1}. **${r.node.title}** (score: ${r.boostedScore.toFixed(3)}) [project]`
        ).join('\n'));
      }

      if (globalResults.length > 0) {
        sections.push('### Global Knowledge\n' + globalResults.map((r, i) =>
          `${i + 1}. **${r.node.title}** (score: ${r.boostedScore.toFixed(3)}) [global]`
        ).join('\n'));
      }

      if (sections.length === 0) {
        return { content: [{ type: 'text', text: `No results in project or global vaults for "${query}"` }] };
      }

      return { content: [{ type: 'text', text: `## Cross-Project Search: "${query}"\n\n${sections.join('\n\n')}` }] };
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
    }
  }
);

// ---------------------------------------------------------------------------
// Tool 17: ke_promote — Promote a project note to global vault
// ---------------------------------------------------------------------------

server.tool(
  'ke_promote',
  {
    note_path: z.string().describe('Path or title of the project note to promote to global'),
    global_subdir: z.string().default('patterns').describe('Subdirectory in global vault (patterns, learnings)'),
  },
  async ({ note_path, global_subdir }) => {
    try {
      const resolved = resolveNotePath(note_path);
      if (!resolved) return { content: [{ type: 'text', text: `Note not found: ${note_path}` }], isError: true };

      const note = engine.readNote(resolved);
      const targetDir = path.join(GLOBAL_DIR, global_subdir);
      if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

      const targetFile = path.join(targetDir, path.basename(resolved));

      if (fs.existsSync(targetFile)) {
        return { content: [{ type: 'text', text: `Note already exists in global vault: ${path.basename(resolved)}` }], isError: true };
      }

      // Copy to global vault
      fs.writeFileSync(targetFile, note.content, 'utf-8');
      globalEngine.rebuild();

      return { content: [{ type: 'text', text: `Promoted to global vault: ${global_subdir}/${path.basename(resolved)}\nGlobal vault rebuilt.` }] };
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
    }
  }
);

// ---------------------------------------------------------------------------
// Helper: Resolve a note path (accepts absolute path, title, or relative name)
// ---------------------------------------------------------------------------

function resolveNotePath(input) {
  // If it's an absolute path that exists, use it
  if (path.isAbsolute(input) && fs.existsSync(input)) return input;

  // Try as vault-relative path
  const vaultRelative = path.join(VAULT_DIR, input);
  if (fs.existsSync(vaultRelative)) return vaultRelative;

  // Try with .md extension
  if (!input.endsWith('.md')) {
    const withExt = path.join(VAULT_DIR, input + '.md');
    if (fs.existsSync(withExt)) return withExt;
  }

  // Search by title in the graph
  const notes = engine.listNotes();
  for (const notePath of notes) {
    const basename = path.basename(notePath, '.md');
    if (basename.toLowerCase() === input.toLowerCase()) return notePath;

    // Try reading title
    try {
      const note = engine.readNote(notePath);
      if (note.title && note.title.toLowerCase() === input.toLowerCase()) return notePath;
    } catch {
      continue;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Connect transport and start
// ---------------------------------------------------------------------------

// Cleanup on exit
process.on('SIGTERM', () => { engine.close(); globalEngine.close(); process.exit(0); });
process.on('SIGINT', () => { engine.close(); globalEngine.close(); process.exit(0); });

const transport = new StdioServerTransport();
await server.connect(transport);
