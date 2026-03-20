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
║     Always on. Always aware. Always compounding.             ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
```

**ZED** is a Claude Code plugin that gives Claude persistent memory, structured execution, and self-improving autonomous loops.

Install it once. ZED silently checks your knowledge vault on every prompt, activates full knowledge capture when the work demands it, and can run overnight self-improvement loops that survive conversation death.

---

## What ZED Does

| Without ZED | With ZED |
|-------------|----------|
| Claude forgets everything between sessions | Remembers decisions, patterns, architecture forever |
| No context from prior work | Silently loads relevant knowledge before every task |
| Jumps straight into coding | Assesses complexity, plans first, executes step by step |
| No verification — you hope it works | 3-stage verification: spec, quality, adversarial review |
| Same mistakes repeat | Captures patterns and anti-patterns automatically |
| Can't run autonomous improvement loops | `/evolve` runs scoped, self-assessing loops for hours |

---

## Behavioral Modes

ZED operates in three modes. Light is always on. Full and Evolve activate on demand or automatically.

### Light Mode (always on)

Every prompt, ZED silently:
1. Searches your vault for relevant context (3 results, titles only)
2. Loads the top matches if relevant
3. Lets you work — no overhead you'd notice
4. Writes to vault only when something is genuinely persistence-worthy

**Overhead**: ~500 tokens, ~1-2 seconds. Skips entirely for trivial prompts (greetings, simple math).

### Full Mode (`/zed`)

Force deep engagement:

```
/zed "explain the auth architecture"
```

ZED does a deep context load (search → read → follow connections), executes the task, then evaluates everything for knowledge capture. Use this when you want ZED to really dig in.

**Auto-activates** when ZED detects:
- Multi-session work ("continuing from yesterday")
- Architecture decisions ("should we use X or Y")
- Complex plans (5+ steps)
- Research tasks ("compare", "evaluate", "options for")
- Post-mortems or audits

### Evolve Mode (`/evolve`)

Run structured, autonomous self-improvement loops:

```
/evolve "harden the test suite"           # runs till stopped
/evolve "refactor auth module" --max 10   # caps at 10 iterations
/evolve --status                           # check progress
/evolve --resume                           # continue after interruption
/evolve --stop                             # graceful shutdown
```

Each iteration:
1. Re-reads the objective (scope lock — prevents drift)
2. Reads progress (catches up on prior work)
3. Does one unit of work
4. Updates progress
5. Drift-checks: "Does this serve the objective?"
6. Every 3rd iteration: full self-assessment

**Survives conversation death.** All loop state lives in the vault. Start a new session and `/evolve --resume` picks up exactly where it left off.

---

## Installation

### Quick Start

```bash
git clone https://github.com/Manny-Brar/zed-knowledge-engine.git
cd zed-knowledge-engine
./install.sh
```

The installer handles everything: npm dependencies, marketplace creation, plugin registration, JSON config updates, and absolute path resolution.

### Restart Claude Code

Restart your Claude Code session. ZED activates automatically in Light mode on every prompt.

### Verify installation

After restart, these commands should appear in your available skills:

```
/zed                → Activate Full mode
/zed:help           → Full command reference
/zed:overview       → Vault dashboard
/zed:search <query> → Search your knowledge graph
/zed:health         → Vault quality score (A-F)
```

### Quick start (development mode)

If you just want to try ZED without full plugin registration:

```bash
claude --plugin-dir /path/to/zed-knowledge-engine
```

This loads ZED for a single session only.

### First Session

```
/zed:overview      → See your vault dashboard
/zed:decide        → Record an architecture decision
/zed:search auth   → Search your knowledge graph
/zed:daily         → Today's session notes
/zed:health        → Vault quality score (A-F)
/zed:help          → Full command reference
```

Or just type normally — ZED works in the background.

---

## The Protocol

### Simple Tasks (fix a bug, rename something)
```
Context check → Execute → Quick verify → Log to session note
```

### Medium Tasks (add a feature, refactor a module)
```
Context check → Plan → Execute → Verify → Capture decisions + patterns
```

### Complex Tasks (design a system, major architecture change)
```
Deep context load → 5-level plan → Execute with checkpoints →
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

ZED maintains a knowledge graph that grows with every session. Notes are nodes. `[[Wikilinks]]` are edges. Search results are boosted by graph connectivity.

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

### Mode Commands

| Command | What it does |
|---------|-------------|
| `/zed [task]` | Force Full mode — deep context + knowledge capture |
| `/evolve "objective"` | Start structured self-improvement loop |
| `/evolve --status` | Check current evolve loop state |
| `/evolve --resume` | Resume an interrupted evolve loop |
| `/evolve --stop` | Stop loop and promote findings to vault |

### Knowledge Commands

| Command | What it does |
|---------|-------------|
| `/zed:overview` | Full dashboard |
| `/zed:search <query>` | Search knowledge graph |
| `/zed:decide <title>` | Record a decision |
| `/zed:daily` | Today's session note |
| `/zed:template <type> <title>` | Create from template |
| `/zed:health` | Vault quality score |
| `/zed:tags [tag]` | Browse by tags |
| `/zed:graph` | Visualize the graph |
| `/zed:import <dir>` | Import existing docs |
| `/zed:promote <note>` | Move to global vault |
| `/zed:status` | Quick stats |
| `/zed:activate <key>` | Activate license |
| `/zed:help` | Full reference |

---

## Under the Hood

ZED uses a **hybrid architecture** for maximum token efficiency:

### MCP Tools (4) — Claude uses these automatically
| Tool | Purpose |
|------|---------|
| `zed_search` | Graph-boosted full-text search |
| `zed_read_note` | Read a knowledge note |
| `zed_write_note` | Create/update notes |
| `zed_decide` | Create decision records |

### CLI (26 subcommands) — via `zed <command>`
Everything else runs through the CLI, saving ~3,500 tokens per turn:

```
Graph:                         Info:
  backlinks <note>               stats
  related <note> [hops]          health
  hubs [limit]                   tags [tag]
  clusters                       recent [limit]
  path <from> <to>               overview
                                 timeline [type]
Content:
  daily [text]                 Maintenance:
  template <type> <title>        rebuild
  snippets <query>               import <dir> [subdir]
  suggest-links [note]           promote <note> [subdir]
                                 global-search <query>
Evolve Loop:                     license [status|activate]
  loop-init "obj" [--max N]      graph [max_nodes]
  loop-tick "progress"
  loop-status
  loop-stop "reason"
  loop-promote
```

Add `--json` to any CLI command for structured output.

### Skills (7) — Behavioral control layer

| Skill | Purpose |
|-------|---------|
| `behavior-controller` | Root controller — Light/Full/Evolve modes, auto-escalation |
| `full-mode` | Capture evaluation rubric for Full mode |
| `evolve-mode` | Drift guard, scope lock, self-assessment for Evolve loops |
| `context-loader` | L0/L1/L2 tiered context retrieval |
| `execution-protocol` | Multi-phase planning + verification |
| `compound-learner` | Post-task knowledge extraction |
| `onboarding` | First-session initialization |

---

## Architecture

```
Claude Code + ZED
    │
    └── ZED Agent
         │
         ├── Behavioral Controller (always-on)
         │    ├── Light mode  → silent vault check every prompt
         │    ├── Full mode   → /zed or auto-detected
         │    └── Evolve mode → /evolve (autonomous loops)
         │
         ├── Protocol Engine
         │    ├── Retrieve → Plan → Execute → Verify → Remember
         │    ├── Complexity assessment (simple / medium / complex)
         │    ├── 5-level planning
         │    └── 3-stage verification
         │
         ├── Knowledge Graph (SQLite + FTS5)
         │    ├── Project vault → ~/.zed-data/vault/
         │    ├── Global vault  → ~/.zed/global/
         │    └── Loop state    → ~/.zed-data/vault/_loop/
         │
         ├── MCP Server (4 tools — token efficient)
         ├── CLI (26 subcommands — zed <cmd>)
         ├── 16 slash commands
         ├── 7 skills
         ├── Session hooks (auto-rebuild on start)
         └── 7 templates
```

## Performance

| Vault Size | Build | Search |
|-----------|-------|--------|
| 100 notes | ~10ms | <1ms |
| 500 notes | ~43ms | <1ms |
| 1000 notes | ~91ms | <1ms |

Light mode overhead: ~500 tokens, ~1-2 seconds per prompt.

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
npm test          # 48 core engine tests
npm run test:mcp  # 16 MCP server tests
npm run test:cli  # 47 CLI integration tests
npm run test:all  # 111 total
npm run bench     # Performance benchmarks
```

---

**ZED** — Always on. Always aware. Always compounding.

Built by Manny Brar. Based on the [Nelson Muntz Protocol](https://github.com/Manny-Brar).
