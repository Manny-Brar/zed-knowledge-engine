# Obsidian + ZED — Recommended Setup

ZED's vault is plain markdown with `[[wikilinks]]` and YAML frontmatter — it's already Obsidian-compatible. Adding Obsidian gives you a **read/browse layer** on top of ZED's **write/maintain layer**.

Karpathy's pattern: humans browse the wiki in Obsidian; the LLM (Claude via ZED's MCP server) handles ingestion, synthesis, and maintenance. Both point at the same folder.

## Quick start

```bash
zed obsidian-bootstrap
```

This drops a `.obsidian/` config folder into your vault. Run it once. Then in Obsidian:

1. Open Obsidian → **Open another vault** → select `~/.zed-data/vault/` (or your `CLAUDE_PLUGIN_DATA/vault/`)
2. Trust the config when prompted
3. Browse

The bootstrap is idempotent — re-running won't clobber any customization you've made.

## What the bootstrap sets up

| File | Purpose |
|---|---|
| `app.json` | Sensible defaults: shortest wikilinks, frontmatter visible, no fold-collapse aggression |
| `core-plugins.json` | Enables the core plugins ZED's workflow needs (graph, backlinks, daily notes, properties, templates) |
| `daily-notes.json` | Daily Notes plugin points at `sessions/` (where `zed daily` writes) |
| `templates.json` | Templates plugin points at `_templates/` (where ZED's scaffolds live) |
| `graph.json` | Graph view: hides `raw/`, color-codes by note type (concepts, entities, syntheses, decisions, patterns, goals) |
| `bookmarks.json` | Pre-pinned: Wiki Index, Schema, Active goal, Recent decisions, Synthesis notes |
| `types.json` | Properties UI knows how to render ZED's frontmatter fields (created, tags, source_paths, goal_id, etc.) |

## Recommended community plugins

Install these from Obsidian's Community Plugins browser. They compose well with ZED.

| Plugin | Why |
|---|---|
| **Dataview** | Query frontmatter like SQL. `list from #goal where status = "active"` shows your North Star instantly. Crucial for goal dashboards. |
| **Templater** | Heavier than core Templates plugin. Useful if you want dynamic template logic (auto-date, vault-aware fields). |
| **Properties View** | Frontmatter UI for `type`, `tags`, `source_paths`, `goal_id`. Faster than editing YAML by hand. |
| **Excalidraw** | Hand-drawn diagrams that save as Excalidraw JSON inside notes. Pairs well with the canvas-thinking style Karpathy uses. |
| **Smart Connections** | Local semantic search over the vault (separate from ZED's keyword search). Different signal, complementary. |
| **Graph Analysis** | Community plugin (not the core one) — adds clustering, similarity metrics on top of the graph view. |

## What NOT to install

| Plugin | Reason |
|---|---|
| Copilot, Smart Composer, Text Generator, any AI writing plugin | ZED is the AI layer. Two AI writers fighting over the same vault produces inconsistent notes and burns tokens twice. Use Claude Code (which calls ZED's MCP server) for writing; use Obsidian to browse. |
| Any plugin that auto-modifies frontmatter at scale | ZED's frontmatter schema (`type`, `tags`, `source_paths`, `summary`) is the contract — `core/wiki-layer.cjs`'s health checks depend on it. Plugins that rewrite frontmatter can silently break the compile loop. |
| Sync plugins that conflict with iCloud / git | Pick one sync mechanism and stick with it (see below). |

## Sync

The vault is just a folder. Pick one and don't mix:

| Option | Pros | Cons |
|---|---|---|
| **iCloud Drive** | Free if you're on Apple. Mobile reads work day one. ZED's default `CLAUDE_PLUGIN_DATA` may already live here. | Slow for large vaults; no conflict resolution UI |
| **Obsidian Sync** ($10/mo) | Best mobile experience, fast, end-to-end encrypted, conflict resolution | Costs money |
| **Git** | Free, full history, branchable, scriptable | Mobile is awkward — you need a separate sync layer for the phone |

Recommended for your setup: **iCloud Drive** (vault already at `~/Library/Mobile Documents/com~apple~CloudDocs/...`).

## Workflow

A normal day with both tools:

1. Morning — open Obsidian, browse the previous synthesis notes or wiki index to re-anchor
2. Code session — Claude Code (with ZED MCP) does the work; `zed_write_note` auto-links new captures
3. Evening — open Obsidian, skim what landed in `wiki/`, `decisions/`, `goals/completed/` today. Manual cleanup or tag refinement if needed
4. Mobile (anywhere) — read on iPhone, never write from there (mobile writes break the compile loop's provenance guarantees)

## Anti-patterns

- **Don't write to `raw/` from Obsidian.** That directory is immutable — only `zed_clip` / `zed ingest-*` should populate it. The compile health check flags manual edits as stale.
- **Don't manually edit `wiki/index.md` or `wiki/log.md`.** Both are auto-rebuilt by `zed_wiki_compile`. Your changes will be overwritten.
- **Don't disable the Properties core plugin.** ZED relies on YAML frontmatter — without it, Obsidian renders raw `---` blocks and editing becomes painful.
