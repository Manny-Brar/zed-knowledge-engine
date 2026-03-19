# Nelson Knowledge Engine v6

**Persistent knowledge graph for Claude Code** — graph-boosted search, auto-capture, decision tracking, and visualization. Your AI co-founder's memory.

## The Problem

Every AI coding assistant has the same fatal flaw: context amnesia. You start a new session and Claude doesn't remember why you chose JWT over sessions, what patterns worked in your auth module, or what you debugged yesterday.

**Nelson Knowledge Engine v6** gives Claude a persistent, compounding memory that gets smarter the more you use it.

## Quick Start

### Install (Local / Dev Testing)

```bash
# Clone the repo
git clone https://github.com/Manny-Brar/nelson-knowledge-engine.git
cd nelson-knowledge-engine

# Install dependencies
# macOS 26 / Node 24 may need this prefix:
# CXXFLAGS="-I$(xcrun --show-sdk-path)/usr/include/c++/v1 -isysroot $(xcrun --show-sdk-path)"
npm install

# Run setup (creates data directories + initializes DB)
npm run setup

# Launch Claude Code with the plugin loaded
claude --plugin-dir .
```

### Install (From Marketplace — coming soon)

```bash
/plugin marketplace add Manny-Brar/nelson-plugins
/plugin install nelson-knowledge-engine
```

### First Run

The plugin auto-starts on session load. On first run it creates your knowledge vault and starts a 14-day free trial.

```bash
# Full vault overview
/ke:overview

# Record your first decision
/ke:decide "Use TypeScript for the API layer"

# Search your knowledge
/ke:search authentication

# View today's session notes
/ke:daily

# Check vault health
/ke:health

# See the full help guide
/ke:help
```

## How To Use It

The Knowledge Engine works in two ways: **you talk to it** via slash commands, and **Claude uses it automatically** via MCP tools in the background.

### Day 1: Set Up Your Knowledge Base

After installing, start a Claude Code session with the plugin loaded:

```bash
claude --plugin-dir /path/to/nelson-knowledge-engine
```

Then in Claude Code:

```
You:  /ke:overview
       → Shows your empty vault. Let's fill it.

You:  /ke:import ./docs
       → Imports any existing markdown docs from your project into the knowledge graph.

You:  /ke:decide "Use PostgreSQL over SQLite for production"
       → Claude asks you for context, alternatives, consequences.
       → Creates a decision record linked into the graph.

You:  /ke:daily
       → Creates today's session note. Auto-captures what you work on.
```

### Day-to-Day: Just Work Normally

Once set up, the engine works **automatically in the background**:

- **When you start a session**: The SessionStart hook rebuilds the graph and shows a status line (`[KE] 42 notes, 87 connections, 3 clusters`)
- **While you work**: Claude can call `ke_search`, `ke_backlinks`, `ke_related` etc. automatically to pull relevant knowledge into conversations. You don't need to do anything.
- **When you end a session**: The Stop hook captures git activity to today's daily note.

### When You Want To Interact Directly

Use slash commands when you want to explicitly manage knowledge:

```
/ke:search auth          → Find everything about authentication
/ke:decide "Switch to JWT" → Record a new decision
/ke:template pattern "Error handling middleware"
                          → Create a reusable pattern note
/ke:health               → Check vault quality (A-F grade, 0-100 score)
/ke:tags                 → Browse all tags
/ke:overview             → Full dashboard: stats + hubs + recent + health
/ke:promote "Error handling middleware"
                          → Move a pattern to global vault (available in ALL projects)
```

### How Knowledge Compounds

```
Session 1:  You decide to use JWT. /ke:decide creates an ADR.
Session 3:  You debug a token expiry bug. Claude finds the JWT decision via
            ke_search and references it automatically.
Session 7:  You extract a "token refresh" pattern. /ke:template pattern.
            It links to the JWT decision via [[wikilinks]].
Session 12: New project. /ke:search "authentication" finds your JWT pattern
            in the global vault — even though it was learned in a different project.
```

The more you use it, the more Claude knows. The graph connects everything.

### Example: Claude Using It Automatically

You don't always need slash commands. Claude uses the MCP tools on its own:

```
You:  "I need to add authentication to this API"

Claude thinks: Let me check what we know about auth...
  → calls ke_search("authentication")
  → finds your JWT decision record and token refresh pattern
  → calls ke_related on the JWT decision (2 hops)
  → finds connected architecture docs

Claude: "Based on your previous decision (2026-03-15), you chose JWT
         with refresh tokens. Here's how to implement it for this API,
         following the token refresh pattern you documented..."
```

---

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
5 built-in templates with `/ke:template`:
- Decision Record (ADR)
- Architecture Doc
- Bug Postmortem
- Pattern Library
- Daily Session

### Vault Health Scoring
`/ke:health` grades your vault (A-F, 0-100) based on connectivity, orphan ratio, hub density, and cluster count. Gives specific recommendations to improve your knowledge graph.

### Cross-Project Knowledge
Patterns learned in one project are available in all projects via the global vault. Use `/ke:promote` to move knowledge from project to global scope.

### Tag Navigation
Browse your knowledge by tags with `/ke:tags`. See all tags with counts, or filter notes by a specific tag.

### Timeline View
Chronological view of decisions, sessions, patterns, and events with date and type badges.

### Graph Visualization
`/ke:graph` renders your knowledge structure as an ASCII diagram or Excalidraw canvas. See hubs, clusters, orphans, and connections at a glance.

### Smart Link Suggestions
`ke_suggest_links` detects when note titles are mentioned in other notes without `[[wikilinks]]` and suggests connections to strengthen your graph.

## Commands (13)

| Command | Description |
|---------|-------------|
| `/ke:overview` | Full vault dashboard (stats + health + hubs + recent + tags) |
| `/ke:help` | Usage guide |
| `/ke:status` | Vault statistics |
| `/ke:search <query>` | Graph-boosted search |
| `/ke:decide <title>` | Create decision record |
| `/ke:daily` | Today's session note |
| `/ke:template <type> <title>` | Create note from template |
| `/ke:health` | Vault quality score + recommendations |
| `/ke:tags [tag]` | Browse by tags |
| `/ke:graph` | Visualize knowledge graph |
| `/ke:import <dir>` | Import existing markdown files |
| `/ke:promote <note>` | Promote note to global vault |
| `/ke:activate <key>` | Activate license |

## MCP Tools (24)

Claude automatically has access to these tools:

| Tool | Description |
|------|-------------|
| `ke_search` | Full-text search with graph boost |
| `ke_search_snippets` | Search with context snippets showing matching lines |
| `ke_template` | Create note from built-in template |
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
| `ke_license` | License management (status + activate) |
| `ke_health` | Vault quality score (0-100) with recommendations |
| `ke_tags` | List all tags or browse by tag |
| `ke_recent` | Recently modified notes |
| `ke_suggest_links` | Find unlinked mentions, suggest connections |
| `ke_timeline` | Chronological view of decisions and events |
| `ke_graph_data` | Export graph data for visualization |
| `ke_global_search` | Search across project + global vaults |
| `ke_promote` | Promote project note to global vault |

## Architecture

```
Claude Code Session
    │
    ├── Commands (13 slash commands)
    ├── Skills (context-loader, compound-learner, onboarding)
    ├── Agents (knowledge-indexer, graph-explorer)
    ├── Hooks (SessionStart, Stop)
    │
    └── MCP Server (24 tools)
         │
         ├── Project Engine (per-project knowledge)
         │    ├── File Layer (markdown I/O, wikilinks, frontmatter)
         │    ├── Graph Layer (SQLite, BFS, clusters, incremental rebuild)
         │    └── Search Layer (FTS5 + graph-boosted ranking)
         │
         ├── Global Engine (cross-project patterns)
         │
         └── License Manager (trial, key validation)
              │
              ├── ${CLAUDE_PLUGIN_DATA}/
              │    ├── knowledge.db (project graph)
              │    └── vault/ (project notes)
              │
              └── ~/.nelson-ke/
                   ├── global.db (global graph)
                   └── global/ (global patterns)
```

## Performance

Benchmarked on synthetic vaults:

| Vault Size | Full Build | Search | Backlinks |
|-----------|-----------|--------|-----------|
| 100 notes | ~10ms | <1ms | <1ms |
| 500 notes | ~43ms | <1ms | <1ms |
| 1000 notes | ~91ms | <1ms | <1ms |

Incremental rebuild skips unchanged files for even faster updates.

## Pricing

- **14-day free trial** — full features, no credit card
- **Solo**: $9/mo or $89/yr — full engine for individual developers

## Requirements

- Claude Code (Claude Pro or Team subscription)
- Node.js 18+
- macOS or Linux

## Development

```bash
# Clone and test locally
git clone https://github.com/mannybrar/nelson-knowledge-engine.git
cd nelson-knowledge-engine

# Install dependencies (macOS may need CXXFLAGS for better-sqlite3)
npm install

# Run core tests (35 tests)
npm test

# Run MCP integration tests (19 tests)
npm run test:mcp

# Run all tests (54 total)
npm run test:all

# Run performance benchmarks
npm run bench

# Test as Claude Code plugin
claude --plugin-dir .

# Start MCP server directly
npm start
```

## License

Proprietary. See LICENSE for details.

---

**Nelson Knowledge Engine v6** — Claude Code that remembers everything and connects the dots.
