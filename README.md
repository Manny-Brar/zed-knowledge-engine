# ZED

**Persistent memory + structured execution for Claude Code.** ZED remembers your decisions, patterns, and architecture across sessions — and enforces a protocol that makes Claude plan before coding, verify before committing, and capture knowledge automatically.

## Install

```bash
git clone https://github.com/Manny-Brar/zed-knowledge-engine.git
cd zed-knowledge-engine
./install.sh
```

Restart Claude Code. Done.

---

## How it works

ZED is always on. You don't need to do anything different.

**On every session start**, ZED rebuilds your knowledge graph index, shows vault stats, and reminds Claude of the ZED Protocol — plan first, verify after, capture always.

**On every prompt**, ZED searches your vault for relevant context. If it finds prior decisions, patterns, or architecture notes that apply, Claude uses them. If not, ZED stays silent.

**On every file edit**, ZED tracks changes. If you're editing a lot of files without capturing any knowledge, it flags drift.

**On session end**, ZED logs what happened. If significant work was done but nothing was captured, it nudges you to record the decision or pattern.

**When you make a decision**, ZED captures it as an Architecture Decision Record — why you chose X over Y, what alternatives you considered, and links it into the knowledge graph.

---

## The 4 commands you'll actually use

Most of the time you won't use commands at all. When you do, it's one of these:

| Command | When to use it | Example |
|---------|---------------|---------|
| `/zed:search <query>` | Find something ZED captured before | `/zed:search "auth architecture"` |
| `/zed:decide <title>` | Record a decision worth remembering | `/zed:decide "Use Stripe over Square"` |
| `/zed:health` | Check your vault's health score | `/zed:health` |
| `/zed:overview` | Full vault dashboard | `/zed:overview` |

---

## When you need more

### Deep mode — `/zed`

Force Claude to load deep context before working:

```
/zed "explain how our auth system works"
```

ZED loads all related notes, follows `[[wikilink]]` connections between them, then works on your task with full context. Use this for architecture discussions, multi-session work, or research tasks.

### Scan a codebase — `zed scan`

Point ZED at any project to auto-generate linked knowledge notes:

```bash
zed scan /path/to/project
```

Generates architecture overview, tech stack breakdown, and per-module notes — all cross-linked with `[[wikilinks]]` so the graph is immediately connected. This is how you onboard an existing project.

### Visualize your graph — `zed visualize`

Open an interactive knowledge graph in your browser:

```bash
zed visualize
```

Force-directed layout, color-coded by type (blue=decisions, green=patterns, purple=projects), pan/zoom/hover. Runs on `localhost:7847`.

### Auto-fix vault issues — `zed fix`

```bash
zed fix
```

Finds broken wikilinks, orphan notes, and missing tags — fixes them automatically. Shows before/after health score.

### Self-improvement loops — `/zed:evolve`

Run a scoped, autonomous loop that works toward an objective:

```
/zed:evolve "harden the test suite"
/zed:evolve "refactor the payment module" --max 10
```

Each iteration: do one unit of work, check progress, drift-check against the objective. Survives conversation death — `/zed:evolve --resume` picks up where it left off.

### Everything else

| Command | What it does |
|---------|-------------|
| `/zed:daily` | Open today's session note |
| `/zed:tags` | Browse notes by tag |
| `/zed:graph` | Graph data as JSON |
| `/zed:template <type> <title>` | Create a note from a template |
| `/zed:import <dir>` | Bulk import markdown files |
| `/zed:promote <note>` | Copy a note to the global vault (shared across projects) |
| `/zed:status` | Quick stats |
| `/zed:help` | Full command reference |

---

## The ZED Protocol

ZED doesn't just store knowledge — it enforces a structured execution protocol on every task.

### Complexity tiers

| Task type | What ZED enforces |
|-----------|------------------|
| **Simple** (bug fix, rename) | Vault check → execute → quick verify |
| **Medium** (feature, refactor) | Vault check → plan → execute → verify → capture decisions |
| **Complex** (architecture, system design) | Deep context load → 5-level plan → execute with checkpoints → 3-stage verify → capture everything |

### Verification (3 stages)

| Stage | Question |
|-------|----------|
| Spec | Does it match what was asked? |
| Quality | Tests pass? Code clean? No hacks? |
| Adversarial | How would I break this? What would a reviewer flag? |

### Automatic knowledge capture

ZED captures knowledge based on concrete rules, not vibes:

- Decision between alternatives → **always** saved as an ADR
- Pattern that worked → saved with `[pattern]` tag
- Something failed → saved as anti-pattern
- Architecture learned → architecture note created or updated

---

## Multi-agent system

ZED includes 4 specialized agents:

| Agent | Role | Restrictions |
|-------|------|-------------|
| `zed` | Main execution agent — plans, executes, captures | Full access |
| `graph-explorer` | Traverses knowledge connections | Read-only |
| `knowledge-indexer` | Vault health and maintenance | Read-only |
| `zed-validator` | Adversarial 3-stage validation | **Cannot edit code** — can only find issues |

The validator is intentionally restricted from editing. It must find at least 3 potential issues per review.

---

## Session lifecycle hooks

| Hook | When | What it does |
|------|------|-------------|
| **SessionStart** | Every new conversation | Rebuilds graph, shows vault stats, loads ZED Protocol |
| **PostToolUse** | After every file edit | Tracks edit count and file spread, warns on drift |
| **Stop** | Session ends | Logs session activity, warns if no knowledge captured |

---

## Under the hood

**4 MCP tools** — Claude calls these automatically:
- `zed_search` — full-text search with graph boosting
- `zed_read_note` — read a knowledge note
- `zed_write_note` — create or update a note
- `zed_decide` — create a decision record

**29 CLI subcommands** — run via `zed <command>`:
```
zed stats          zed backlinks <note>     zed rebuild
zed health         zed related <note>       zed backup
zed tags [tag]     zed hubs 10              zed fix
zed recent 5       zed clusters             zed version
zed overview       zed path <from> <to>     zed import <dir>
zed daily "text"   zed suggest-links        zed promote <note>
zed snippets <q>   zed timeline [type]      zed graph 50
zed scan [dir]     zed visualize            zed suggest-links
```

Add `--json` to any command for structured output.

**7 behavioral skills** — loaded automatically, govern Claude's behavior.

**1 injected protocol** — `prompts/zed-protocol.md` is loaded at session start, not on demand.

---

## Performance

| Vault size | Full build | Search |
|-----------|-----------|--------|
| 100 notes | ~10ms | <1ms |
| 500 notes | ~43ms | <1ms |
| 1000 notes | ~75ms | <1ms |

---

## Pricing

- **14-day free trial** — no credit card
- **$9/mo** or **$89/yr**

---

## Troubleshooting

**macOS + Node 24** — better-sqlite3 needs C++ headers:
```bash
CXXFLAGS="-I$(xcrun --show-sdk-path)/usr/include/c++/v1 -isysroot $(xcrun --show-sdk-path)" npm install
```

**Plugin not loading** — verify with `/zed:help`. If missing, re-run `./install.sh` and restart Claude Code.

**Vault location** — project: `~/.zed-data/vault/`, global: `~/.zed/global/`

---

## Development

```bash
npm test          # 49 core engine tests
npm run test:mcp  # 16 MCP server tests
npm run test:cli  # 57 CLI integration tests
npm run test:all  # 122 total
npm run bench     # Performance benchmarks
```

---

Built by [Manny Brar](https://github.com/Manny-Brar).
