# Nelson Knowledge Engine v6

**Persistent knowledge graph for Claude Code** — graph-boosted search, auto-capture, decision tracking, and visualization. Your AI co-founder's memory.

## The Problem

Every AI coding assistant has the same fatal flaw: context amnesia. You start a new session and Claude doesn't remember why you chose JWT over sessions, what patterns worked in your auth module, or what you debugged yesterday.

**Nelson Knowledge Engine v6** gives Claude a persistent, compounding memory that gets smarter the more you use it.

## Quick Start

### Install

```bash
# Add the marketplace
/plugin marketplace add mannybrar/nelson-knowledge-engine

# Install the plugin
/plugin install nelson-knowledge-engine

# Or install directly from Git
/plugin install --git https://github.com/mannybrar/nelson-knowledge-engine.git
```

### First Run

The plugin auto-starts on session load. On first run it creates your knowledge vault and starts a 14-day free trial.

```bash
# Check status
/ke:status

# Record your first decision
/ke:decide "Use TypeScript for the API layer"

# Search your knowledge
/ke:search authentication

# View today's session notes
/ke:daily

# See the full help guide
/ke:help
```

## Features

### Knowledge Graph
Every note you create is a node in a graph. `[[Wikilinks]]` between notes create edges. The graph reveals how your decisions, patterns, and architecture connect.

### Graph-Boosted Search
Search results are ranked by both content relevance AND graph connectivity. Notes with more backlinks (more things reference them) rank higher. Hub knowledge surfaces first.

### Auto-Capture
- **Session hooks** automatically log what you worked on
- **Compound learner** extracts patterns and anti-patterns after significant work
- **Context loader** pulls relevant knowledge at session start

### Decision Records
Architecture Decision Records (ADRs) with `/ke:decide`. Track what was decided, why, what alternatives were considered, and what the consequences are. Linked to related decisions via the graph.

### Daily Session Notes
Automatic daily notes that capture your work sessions. Build continuity across days — each session picks up where the last one left off.

### Templates
5 built-in templates for structured knowledge capture:
- Decision Record (ADR)
- Architecture Doc
- Bug Postmortem
- Pattern Library
- Daily Session

### Graph Visualization
`/ke:graph` renders your knowledge structure as an ASCII diagram or Excalidraw canvas. See hubs, clusters, orphans, and connections at a glance.

## Commands

| Command | Description |
|---------|-------------|
| `/ke:help` | Usage guide |
| `/ke:status` | Vault statistics |
| `/ke:search <query>` | Graph-boosted search |
| `/ke:decide <title>` | Create decision record |
| `/ke:daily` | Today's session note |
| `/ke:graph` | Visualize knowledge graph |
| `/ke:import <dir>` | Import existing markdown files |
| `/ke:promote <note>` | Promote note to global vault |
| `/ke:activate <key>` | Activate license |

## MCP Tools (17 total)

Claude automatically has access to these tools:

| Tool | Description |
|------|-------------|
| `ke_search` | Full-text search with graph boost |
| `ke_backlinks` | Find what links to a note |
| `ke_related` | Related notes within N hops |
| `ke_hubs` | Most-connected knowledge nodes |
| `ke_clusters` | Detect knowledge clusters |
| `ke_shortest_path` | Path between two notes |
| `ke_stats` | Vault statistics |
| `ke_read_note` | Read a note |
| `ke_write_note` | Write/update a note |
| `ke_decide` | Create decision record |
| `ke_daily` | Daily session note |
| `ke_rebuild` | Rebuild graph index |
| `ke_import` | Import markdown files from directory |
| `ke_license` | License management |
| `ke_graph_data` | Export graph data for visualization |
| `ke_global_search` | Search across project + global vaults |
| `ke_promote` | Promote project note to global vault |

## Architecture

```
Claude Code Session
    │
    ├── Commands (/ke:search, /ke:decide, etc.)
    ├── Skills (context-loader, compound-learner)
    ├── Agents (knowledge-indexer, graph-explorer)
    ├── Hooks (SessionStart, Stop)
    │
    └── MCP Server (14 tools)
         │
         └── Knowledge Engine Core
              ├── File Layer (markdown I/O, wikilinks, frontmatter)
              ├── Graph Layer (SQLite nodes + edges, BFS, clusters)
              └── Search Layer (FTS5 + graph-boosted ranking)
                   │
                   └── ${CLAUDE_PLUGIN_DATA}/
                        ├── knowledge.db (SQLite)
                        └── vault/ (markdown notes)
```

## Pricing

- **14-day free trial** — full features, no credit card
- **Solo**: $9/mo or $89/yr — full engine for individual developers

## Requirements

- Claude Code (Claude Pro or Team subscription)
- Node.js 18+
- macOS, Linux, or Windows

## Development

```bash
# Clone and test locally
git clone https://github.com/mannybrar/nelson-knowledge-engine.git
cd nelson-knowledge-engine

# Install dependencies (macOS may need CXXFLAGS for better-sqlite3)
npm install

# Run tests
npm test

# Test as Claude Code plugin
claude --plugin-dir .

# Start MCP server directly
npm start
```

## License

Proprietary. See LICENSE for details.

---

**Nelson Knowledge Engine v6** — Claude Code that remembers everything and connects the dots.
