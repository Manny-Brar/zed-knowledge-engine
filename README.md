```
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║     ███████╗███████╗██████╗                                  ║
║     ╚══███╔╝██╔════╝██╔══██╗                                ║
║       ███╔╝ █████╗  ██║  ██║                                ║
║      ███╔╝  ██╔══╝  ██║  ██║                                ║
║     ███████╗███████╗██████╔╝                                 ║
║     ╚══════╝╚══════╝╚═════╝                                  ║
║                                                              ║
║     Knowledge Engine v6                                      ║
║     Powered by the Nelson Muntz Protocol                     ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
```

**Claude Code that remembers everything and connects the dots.**

A persistent knowledge graph plugin for Claude Code — graph-boosted search, auto-capture, decision tracking, and cross-project learning.

---

## Quick Start

```bash
# Clone
git clone https://github.com/Manny-Brar/nelson-knowledge-engine.git
cd nelson-knowledge-engine

# Install (macOS may need CXXFLAGS — see Troubleshooting below)
npm install

# Setup (creates vault + initializes database)
npm run setup

# Launch Claude Code with ZED loaded
claude --plugin-dir .
```

Then in Claude Code:
```
/zed:overview      → Full vault dashboard
/zed:decide        → Record an architecture decision
/zed:search auth   → Search your knowledge graph
/zed:daily         → Today's session notes
/zed:health        → Vault quality score
/zed:help          → Full command reference
```

---

## How It Works

ZED works in two ways: **you talk to it** via slash commands, and **Claude uses it automatically** via MCP tools in the background.

### Day 1: Set Up Your Knowledge Base

```
You:  /zed:overview
       → Shows your empty vault. Let's fill it.

You:  /zed:import ./docs
       → Imports any existing markdown docs into the knowledge graph.

You:  /zed:decide "Use PostgreSQL over SQLite for production"
       → Claude asks for context, alternatives, consequences.
       → Creates a decision record linked into the graph.

You:  /zed:daily
       → Creates today's session note. Auto-captures what you work on.
```

### Day-to-Day: Just Work Normally

Once set up, ZED works **automatically in the background**:

- **Session start**: Rebuilds the graph, shows status (`[ZED] 42 notes, 87 connections`)
- **While you work**: Claude calls `zed_search`, `zed_backlinks`, `zed_related` automatically to pull relevant knowledge
- **Session end**: Captures git activity to today's daily note

### How Knowledge Compounds

```
Session 1:  You decide to use JWT. /zed:decide creates an ADR.
Session 3:  You debug a token bug. Claude finds the JWT decision via
            zed_search and references it automatically.
Session 7:  You extract a "token refresh" pattern. /zed:template pattern.
Session 12: New project. zed_global_search finds your JWT pattern in
            the global vault — learned in a different project.
```

### Claude Uses It Automatically

```
You:  "I need to add authentication to this API"

Claude: → calls zed_search("authentication")
        → finds your JWT decision and token refresh pattern
        → calls zed_related on the JWT decision
        → finds connected architecture docs

Claude: "Based on your previous decision, you chose JWT with refresh
         tokens. Here's how to implement it..."
```

---

## Commands (13)

| Command | Description |
|---------|-------------|
| `/zed:overview` | Full dashboard (stats + health + hubs + recent) |
| `/zed:help` | Usage guide |
| `/zed:status` | Vault statistics |
| `/zed:search <query>` | Graph-boosted search |
| `/zed:decide <title>` | Create decision record (ADR) |
| `/zed:daily` | Today's session note |
| `/zed:template <type> <title>` | Create from template |
| `/zed:health` | Vault quality score + recommendations |
| `/zed:tags [tag]` | Browse by tags |
| `/zed:graph` | Visualize knowledge graph |
| `/zed:import <dir>` | Import existing markdown files |
| `/zed:promote <note>` | Promote note to global vault |
| `/zed:activate <key>` | Activate license |

## MCP Tools (24)

Claude has access to these tools automatically:

| Tool | Description |
|------|-------------|
| `zed_search` | Full-text search with graph boost |
| `zed_search_snippets` | Search with context snippets |
| `zed_template` | Create note from template |
| `zed_backlinks` | Find what links to a note |
| `zed_related` | Related notes within N hops |
| `zed_hubs` | Most-connected knowledge nodes |
| `zed_clusters` | Detect knowledge clusters |
| `zed_shortest_path` | Path between two notes |
| `zed_stats` | Vault statistics |
| `zed_read_note` | Read a note |
| `zed_write_note` | Write/update a note |
| `zed_decide` | Create decision record |
| `zed_daily` | Daily session note |
| `zed_rebuild` | Rebuild graph index |
| `zed_import` | Import markdown files |
| `zed_license` | License management |
| `zed_health` | Vault quality score (0-100) |
| `zed_tags` | List/browse tags |
| `zed_recent` | Recently modified notes |
| `zed_suggest_links` | Find unlinked mentions |
| `zed_timeline` | Chronological event view |
| `zed_graph_data` | Export graph data |
| `zed_global_search` | Cross-project search |
| `zed_promote` | Promote to global vault |

## Features

- **Knowledge Graph** — Notes are nodes, `[[wikilinks]]` are edges
- **Graph-Boosted Search** — Backlinks boost ranking. Hub knowledge surfaces first
- **Auto-Capture** — Session hooks log work automatically. Compound learner extracts patterns
- **Decision Records** — ADRs with `/zed:decide`. Track what, why, alternatives, consequences
- **Cross-Project Knowledge** — Global vault carries patterns across all projects
- **Vault Health Scoring** — A-F grade (0-100) with specific improvement recommendations
- **Templates** — Decision, architecture, postmortem, pattern, daily session
- **Tag Navigation** — Browse by tag with `/zed:tags`
- **Timeline** — Chronological view with type badges
- **Link Suggestions** — Detects unlinked mentions, suggests connections
- **Local-First** — SQLite + markdown. No cloud. No telemetry. Works offline

## Architecture

```
Claude Code Session
    │
    ├── /zed: Commands (13)
    ├── Skills (context-loader, compound-learner, onboarding)
    ├── Agents (knowledge-indexer, graph-explorer)
    ├── Hooks (SessionStart, Stop)
    │
    └── MCP Server (24 tools)
         ├── Project Engine ──→ ~/.zed-data/ (per-project)
         ├── Global Engine  ──→ ~/.zed/global/ (cross-project)
         └── License Manager
```

## Performance

| Vault Size | Full Build | Search | Backlinks |
|-----------|-----------|--------|-----------|
| 100 notes | ~10ms | <1ms | <1ms |
| 500 notes | ~43ms | <1ms | <1ms |
| 1000 notes | ~91ms | <1ms | <1ms |

## Pricing

- **14-day free trial** — full features, no credit card
- **Solo**: $9/mo or $89/yr

## Troubleshooting

**macOS with Node 24** — better-sqlite3 may need C++ headers:
```bash
CXXFLAGS="-I$(xcrun --show-sdk-path)/usr/include/c++/v1 -isysroot $(xcrun --show-sdk-path)" npm install
```

## Development

```bash
npm test          # Core tests (35)
npm run test:mcp  # MCP integration tests (19)
npm run test:all  # All tests (54)
npm run bench     # Performance benchmarks
npm start         # Start MCP server directly
```

---

**ZED Knowledge Engine v6** — Powered by the Nelson Muntz Protocol.
Built by Manny Brar.
