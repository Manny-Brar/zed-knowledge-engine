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
║     Every prompt. Planned. Verified. Remembered.             ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
```

**ZED** is a Claude Code plugin that makes Claude think before it acts, verify before it ships, and remember everything — forever.

Install it once. Every task automatically gets structured planning, self-critical verification, and persistent knowledge that compounds across sessions and projects.

---

## What ZED Does

| Without ZED | With ZED |
|-------------|----------|
| Claude forgets everything between sessions | Remembers decisions, patterns, architecture across sessions |
| Jumps straight into coding | Assesses complexity, plans first, executes step by step |
| No verification — you hope it works | 3-stage verification: spec, quality, adversarial review |
| Same mistakes repeat | Captures patterns and anti-patterns automatically |
| Context lost when you switch projects | Knowledge carries across all your projects |

---

## How It Works

Type a prompt. ZED handles the rest:

```
You: "Add rate limiting to the API"

ZED:
╔═══════════════════════════════════════════════════════╗
║ RETRIEVE                                              ║
║ → Searches knowledge graph for prior API decisions    ║
║ → Pulls in connected patterns and architecture docs   ║
╠═══════════════════════════════════════════════════════╣
║ PLAN                                                  ║
║ → Assesses: Medium complexity (5 steps)               ║
║ 1. Choose rate limiting strategy                      ║
║ 2. Add middleware                                     ║
║ 3. Configure limits per endpoint                      ║
║ 4. Add tests                                          ║
║ 5. Update API docs                                    ║
║ → Adversarial: distributed systems? Redis needed?     ║
╠═══════════════════════════════════════════════════════╣
║ EXECUTE                                               ║
║ → Works through each step, commits at checkpoints     ║
╠═══════════════════════════════════════════════════════╣
║ VERIFY                                                ║
║ ✓ Does it match what was asked?                      ║
║ ✓ Do tests pass? Is the code clean?                  ║
║ ✓ How would I break this? Edge cases handled?        ║
╠═══════════════════════════════════════════════════════╣
║ REMEMBER                                              ║
║ → Records: "Chose token bucket rate limiting"         ║
║ → Links to existing API architecture docs             ║
║ → Logs to daily session note                          ║
║ → Graph grows. Next time, ZED already knows.          ║
╚═══════════════════════════════════════════════════════╝
```

Simple tasks skip straight to execute. Complex tasks get the full treatment.

**Session 1**: ZED knows nothing.
**Session 5**: ZED references your decisions and warns about past mistakes.
**Session 12**: ZED knows your codebase like a co-founder.

---

## Quick Start

```bash
git clone https://github.com/Manny-Brar/zed-knowledge-engine.git
cd zed-knowledge-engine
npm install
npm run setup
claude --plugin-dir .
```

That's it. ZED activates automatically. Every prompt now goes through the protocol.

### First Session

```
/zed:overview      → See your vault dashboard
/zed:decide        → Record an architecture decision
/zed:search auth   → Search your knowledge graph
/zed:daily         → Today's session notes
/zed:health        → Vault quality score (A-F)
/zed:help          → Full command reference
```

Or just type normally — ZED handles everything in the background.

---

## The Protocol

### Simple Tasks (fix a bug, rename something)
```
Retrieve → Execute → Quick verify → Log to session note
```

### Medium Tasks (add a feature, refactor a module)
```
Retrieve → Plan → Execute → Verify → Capture decisions + patterns
```

### Complex Tasks (design a system, major architecture change)
```
Retrieve → 5-level plan → Execute with checkpoints →
3-stage verify → Capture everything → Link in knowledge graph
```

### Planning (scales with complexity)

| Level | Question |
|-------|----------|
| Standard | What needs to be done? |
| Deep | Edge cases and dependencies? |
| Adversarial | What could go wrong? |
| Meta | Is this the simplest approach? |
| Compound | What do I already know that applies? |

### Verification (every task gets at least a quick check)

| Stage | Check |
|-------|-------|
| Spec | Does it match what was asked? |
| Quality | Tests pass? Code clean? No hacks? |
| Adversarial | How would I break this? What would a reviewer flag? |

---

## Knowledge Graph

ZED maintains a knowledge graph that grows with every session. Notes are nodes. `[[Wikilinks]]` are edges.

### What Gets Captured
- **Decisions** — Why you chose X over Y (Architecture Decision Records)
- **Patterns** — Approaches that worked and when to use them
- **Anti-patterns** — What failed and why
- **Session notes** — What you worked on each day
- **Architecture** — How your system is structured

### Cross-Project
Knowledge learned in one project is available in all projects. Use `/zed:promote` to move patterns to the global vault.

### Vault Health
`/zed:health` scores your vault (A-F, 0-100) with specific recommendations to strengthen your knowledge graph.

---

## Commands

| Command | What it does |
|---------|-------------|
| `/zed:overview` | Full dashboard |
| `/zed:search <query>` | Search knowledge graph |
| `/zed:decide <title>` | Record a decision |
| `/zed:daily` | Today's session note |
| `/zed:template <type> <title>` | Create from template (decision, pattern, architecture, postmortem, daily) |
| `/zed:health` | Vault quality score |
| `/zed:tags [tag]` | Browse by tags |
| `/zed:graph` | Visualize the graph |
| `/zed:import <dir>` | Import existing docs |
| `/zed:promote <note>` | Move to global vault |
| `/zed:status` | Quick stats |
| `/zed:activate <key>` | Activate license |
| `/zed:help` | Full reference |

## Under the Hood (24 MCP Tools)

ZED uses these automatically during conversations — you never need to call them directly:

`zed_search` `zed_search_snippets` `zed_template` `zed_backlinks` `zed_related` `zed_hubs` `zed_clusters` `zed_shortest_path` `zed_stats` `zed_read_note` `zed_write_note` `zed_decide` `zed_daily` `zed_rebuild` `zed_import` `zed_license` `zed_health` `zed_tags` `zed_recent` `zed_suggest_links` `zed_timeline` `zed_graph_data` `zed_global_search` `zed_promote`

---

## Architecture

```
Claude Code + ZED
    │
    └── ZED (default agent)
         │
         ├── Protocol Engine
         │    ├── Retrieve → Plan → Execute → Verify → Remember
         │    ├── Complexity assessment (simple / medium / complex)
         │    ├── 5-level planning
         │    └── 3-stage verification
         │
         ├── Knowledge Graph (SQLite + FTS5)
         │    ├── Project vault → ~/.zed-data/
         │    └── Global vault  → ~/.zed/global/
         │
         ├── 13 slash commands
         ├── 24 MCP tools
         ├── Session hooks (auto-capture)
         └── 5 templates
```

## Performance

| Vault Size | Build | Search |
|-----------|-------|--------|
| 100 notes | ~10ms | <1ms |
| 500 notes | ~43ms | <1ms |
| 1000 notes | ~91ms | <1ms |

## Pricing

- **14-day free trial** — no credit card
- **$9/mo** or **$89/yr**

## Troubleshooting

**macOS + Node 24**: better-sqlite3 needs C++ headers:
```bash
CXXFLAGS="-I$(xcrun --show-sdk-path)/usr/include/c++/v1 -isysroot $(xcrun --show-sdk-path)" npm install
```

## Development

```bash
npm test          # 35 core tests
npm run test:mcp  # 19 integration tests
npm run test:all  # 54 total
npm run bench     # Benchmarks
```

---

**ZED** — Every prompt. Planned. Verified. Remembered.

Built by Manny Brar. Based on the [Nelson Muntz Protocol](https://github.com/Manny-Brar).
