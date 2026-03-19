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

**Every prompt. Planned. Verified. Remembered.**

ZED is a Claude Code plugin that gives Claude intelligent execution AND persistent memory. Install it once — every task automatically gets multi-phase planning, self-critical verification, and knowledge capture that compounds across sessions.

---

## What Makes ZED Different

Most AI coding tools forget everything between sessions. ZED doesn't.

| Without ZED | With ZED |
|-------------|----------|
| Claude forgets decisions between sessions | Claude remembers WHY you chose JWT, PostgreSQL, React |
| No planning — Claude just starts coding | Every task gets complexity-assessed planning |
| No verification — you hope it works | 3-stage verification: spec, quality, adversarial review |
| No learning — same mistakes repeat | Patterns and anti-patterns captured automatically |
| Context lost across projects | Global vault carries knowledge everywhere |

## How It Works

When you install ZED and type a prompt, this happens automatically:

```
You: "Add rate limiting to the API"

ZED Protocol:
╔═══════════════════════════════════════════════════════╗
║ PHASE 0: KNOWLEDGE RETRIEVAL                          ║
║ → Searches graph for "rate limiting", "API"           ║
║ → Finds your prior API architecture decision          ║
║ → Pulls in connected patterns and docs                ║
╠═══════════════════════════════════════════════════════╣
║ PHASE 1: ASSESS COMPLEXITY                            ║
║ → Medium (5 steps) — brief plan, then execute         ║
╠═══════════════════════════════════════════════════════╣
║ PHASE 2: MULTI-PHASE PLANNING                         ║
║ 1. Choose rate limiting strategy                      ║
║ 2. Add middleware                                     ║
║ 3. Configure limits per endpoint                      ║
║ 4. Add tests                                          ║
║ 5. Update API docs                                    ║
║ (Adversarial: distributed systems? Redis needed?)     ║
╠═══════════════════════════════════════════════════════╣
║ PHASE 3: EXECUTE (step by step, commits at gates)     ║
╠═══════════════════════════════════════════════════════╣
║ PHASE 4: VERIFY                                       ║
║ ✓ Spec check — matches requirements                  ║
║ ✓ Quality check — tests pass, clean code             ║
║ ✓ Adversarial review — edge cases handled            ║
╠═══════════════════════════════════════════════════════╣
║ PHASE 5: CAPTURE                                      ║
║ → Records decision: "Use token bucket rate limiting"  ║
║ → Appends to daily session note                       ║
║ → Links to existing API architecture docs             ║
║ → Knowledge graph grows stronger                      ║
╚═══════════════════════════════════════════════════════╝
```

Simple tasks (rename a variable, fix a typo) skip straight to execute → verify → capture.
Complex tasks get the full 5-level planning treatment.

**The more you use ZED, the smarter it gets.** Session 1 it knows nothing. Session 12 it references your decisions, patterns, and architecture like a co-founder who's been there from day one.

---

## Quick Start

```bash
# Clone
git clone https://github.com/Manny-Brar/zed-knowledge-engine.git
cd zed-knowledge-engine

# Install (macOS may need CXXFLAGS — see Troubleshooting below)
npm install

# Setup (creates vault + initializes database)
npm run setup

# Launch Claude Code with ZED
claude --plugin-dir .
```

That's it. ZED activates as the default agent. Every prompt now goes through the protocol.

### First Session

```
/zed:overview      → See your vault dashboard
/zed:decide        → Record an architecture decision
/zed:search auth   → Search your knowledge graph
/zed:daily         → Today's session notes
/zed:health        → Vault quality score (A-F)
/zed:help          → Full command reference
```

Or just type normally — ZED handles everything automatically.

---

## The ZED Protocol

### For Simple Tasks (< 3 steps)
```
Retrieve relevant knowledge → Execute → Quick verify → Capture to daily note
```

### For Medium Tasks (3-10 steps)
```
Retrieve knowledge → Brief plan → Execute → Full verify → Capture decisions + patterns
```

### For Complex Tasks (10+ steps, architecture decisions)
```
Retrieve knowledge → 5-level planning → Execute with checkpoints →
3-stage verification → Capture decisions, patterns, architecture docs →
Link everything in the knowledge graph
```

### 5-Level Planning (Complex Tasks)
1. **Standard** — What needs to be done?
2. **Deep** — Edge cases and dependencies?
3. **Adversarial** — What could go wrong?
4. **Meta** — Is this the simplest approach?
5. **Compound** — What existing knowledge applies? How does this make the next task easier?

### 3-Stage Verification
1. **Spec Check** — Does it match what was asked?
2. **Quality Check** — Tests pass? Code clean? No hacks?
3. **Adversarial Review** — How would I break this? What would a hostile reviewer flag?

---

## Knowledge Graph

Every note is a node. `[[Wikilinks]]` are edges. The graph reveals how your decisions, patterns, and architecture connect.

### What Gets Captured Automatically
- **Session notes** — What you worked on each day
- **Decisions** — Architecture Decision Records (ADRs)
- **Patterns** — Reusable approaches that worked
- **Anti-patterns** — Approaches that failed and why

### Cross-Project Knowledge
Patterns learned in Project A are available in Project B via the global vault.
Use `/zed:promote` to move knowledge from project to global scope.

### Vault Health
`/zed:health` grades your vault (A-F, 0-100) and gives specific recommendations:
- Connect orphan notes
- Add wikilinks between related knowledge
- Bridge disconnected clusters

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

Claude uses these automatically — you don't need to call them:

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

---

## Architecture

```
Claude Code Session
    │
    └── ZED Agent (default thread)
         │
         │  ┌──────────────────────────────────────┐
         │  │     THE ZED PROTOCOL                  │
         │  │                                        │
         │  │  0. Retrieve knowledge from graph      │
         │  │  1. Assess complexity                  │
         │  │  2. Multi-phase plan (if needed)       │
         │  │  3. Execute step by step               │
         │  │  4. 3-stage verification               │
         │  │  5. Capture learnings to graph          │
         │  └──────────────────────────────────────┘
         │
         ├── MCP Server (24 tools)
         │    ├── Project Engine → ~/.zed-data/
         │    ├── Global Engine  → ~/.zed/global/
         │    └── License Manager
         │
         ├── Commands (13 slash commands)
         ├── Skills (execution-protocol, context-loader, compound-learner, onboarding)
         ├── Agents (knowledge-indexer, graph-explorer)
         └── Hooks (SessionStart, Stop)
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

**ZED Knowledge Engine v6** — Every prompt. Planned. Verified. Remembered.
Powered by the Nelson Muntz Protocol. Built by Manny Brar.
