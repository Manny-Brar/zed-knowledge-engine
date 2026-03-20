# ZED

**Persistent memory for Claude Code.** ZED remembers your decisions, patterns, and architecture across sessions so Claude stops re-learning your codebase every conversation.

## Install

```bash
git clone https://github.com/Manny-Brar/zed-knowledge-engine.git
cd zed-knowledge-engine
./install.sh
```

Restart Claude Code. Done.

---

## How it works

ZED runs in the background. You don't need to do anything different — just work normally.

Every prompt, ZED silently checks if anything in your knowledge vault is relevant to what you're doing. If it finds something, Claude uses it. If not, it stays out of the way. When you make a decision worth remembering, ZED saves it.

That's it. No commands required for daily use.

---

## The 4 commands you'll actually use

Most of the time you won't use commands at all. When you do, it's one of these:

| Command | When to use it | Example |
|---------|---------------|---------|
| `/zed:search <query>` | Find something you know ZED captured before | `/zed:search "auth architecture"` |
| `/zed:decide <title>` | You just made a decision worth recording | `/zed:decide "Use Stripe over Square"` |
| `/zed:health` | Curious how your vault is doing | `/zed:health` |
| `/zed:overview` | Want the full dashboard | `/zed:overview` |

## When you need more

### Deep mode — `/zed`

When you're doing complex work and want Claude to really dig into your vault first:

```
/zed "explain how our auth system works"
```

ZED loads all related notes, follows connections between them, then works on your task with full context. Use this for architecture discussions, multi-session work, or research tasks.

### Self-improvement loops — `/zed:evolve`

Run a scoped, autonomous loop that works toward an objective:

```
/zed:evolve "harden the test suite"
/zed:evolve "refactor the payment module" --max 10
```

Each iteration: do one unit of work, check progress, drift-check against the objective. Survives conversation death — `/zed:evolve --resume` picks up where it left off.

### Everything else

These exist but you'll rarely need them:

| Command | What it does |
|---------|-------------|
| `/zed:daily` | Open today's session note |
| `/zed:tags` | Browse notes by tag |
| `/zed:graph` | ASCII visualization of note connections |
| `/zed:template <type> <title>` | Create a note from a template |
| `/zed:import <dir>` | Bulk import markdown files |
| `/zed:promote <note>` | Copy a note to the global vault (shared across projects) |
| `/zed:status` | Quick stats |
| `/zed:activate <key>` | Activate a license |
| `/zed:help` | Full command reference |

---

## What gets saved

ZED captures knowledge automatically during Full and Evolve modes. In Light mode (default), it only saves when something is clearly worth persisting. You'll never see it save junk.

- **Decisions** — Why you chose X over Y (as Architecture Decision Records)
- **Patterns** — Approaches that worked, with context on when to reuse them
- **Anti-patterns** — What failed and why, so it doesn't happen again
- **Session notes** — What you worked on each day
- **Architecture** — How your system is structured

All notes live in a knowledge graph. Notes link to each other with `[[wikilinks]]`. Search results are ranked by both text relevance and graph connectivity — well-connected notes surface first.

---

## Cross-project knowledge

Knowledge from one project is available in all your projects. Use `/zed:promote <note>` to move a pattern or decision to the global vault.

---

## Under the hood

ZED is a Claude Code plugin with three layers:

**4 MCP tools** — Claude calls these automatically, no action needed from you:
- `zed_search` — full-text search with graph boosting
- `zed_read_note` — read a note
- `zed_write_note` — create or update a note
- `zed_decide` — create a decision record

**27 CLI subcommands** — run via `zed <command>` in the terminal:
```
zed stats          zed backlinks <note>     zed rebuild
zed health         zed related <note>       zed backup
zed tags [tag]     zed hubs 10              zed fix
zed recent 5       zed clusters             zed version
zed overview       zed path <from> <to>     zed import <dir>
zed daily "text"   zed suggest-links        zed promote <note>
zed snippets <q>   zed timeline [type]      zed graph 50
```

Add `--json` to any command for structured output.

**7 behavioral skills** — loaded automatically, govern how Claude behaves when ZED is installed.

---

## Performance

| Vault size | Full build | Search |
|-----------|-----------|--------|
| 100 notes | ~10ms | <1ms |
| 500 notes | ~43ms | <1ms |
| 1000 notes | ~75ms | <1ms |

Light mode overhead: ~500 tokens per prompt.

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

**Vault location** — project vault: `~/.zed-data/vault/`, global vault: `~/.zed/global/`

---

## Development

```bash
npm test          # 49 core engine tests
npm run test:mcp  # 16 MCP server tests
npm run test:cli  # 54 CLI integration tests
npm run test:all  # 119 total
npm run bench     # Performance benchmarks
```

---

Built by [Manny Brar](https://github.com/Manny-Brar).
