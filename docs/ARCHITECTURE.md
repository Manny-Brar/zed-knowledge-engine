# ZED Architecture

## Data Flow

```
User Prompt
    |
    +- SessionStart hook fires
    |   +- Rebuilds graph, shows stats, loads soul doc
    |
    +- Rules auto-inject (zed-first, zed-capture, zed-verify)
    |
    +- Behavior Controller skill evaluates mode
    |   +- Light: silent search -> work -> maybe capture
    |   +- Full: deep load -> work -> evaluate -> capture
    |   +- Evolve: gate cycle -> work -> capture -> handoff -> loop
    |
    +- PostToolUse hook tracks edits
    |
    +- PreCompact hook reminds to flush
    |
    +- Stop hook
        +- No loop: session-end cleanup -> allow
        +- Active loop: enforce capture + handoff + drift -> block/allow
```

## Knowledge Graph

```
Markdown Notes (.md)
    |
    +- FileLayer: parse frontmatter, body, wikilinks
    +- GraphLayer: build nodes + edges in SQLite
    +- SearchLayer: FTS5 index with graph-boosted ranking
    +- KnowledgeEngine: coordinates all layers
        |
        +- Vault (notes):  ZED_VAULT_ROOT (Obsidian) or <dataDir>/vault
        +- Global vault:   ~/.zed/global/
        +- Database:       <dataDir>/knowledge.db
        +- Loop state:     <dataDir>/loops/<project>/   (per project)
```

### Path resolution — one source of truth

All processes (MCP server, `zed` CLI, and the shell hooks via `scripts/_zed-paths.sh`)
resolve paths through **`core/config.cjs`** so they can never disagree:

| What | Precedence | Default |
|---|---|---|
| Data dir | `ZED_DATA_DIR` > `CLAUDE_PLUGIN_DATA` > `~/.zed-data` | `~/.zed-data` |
| Vault (notes) | `ZED_VAULT_DIR` > `ZED_VAULT_ROOT` > `<dataDir>/vault` | `<dataDir>/vault` |
| DB index | `ZED_DB_PATH` > `<dataDir>/knowledge.db` | `<dataDir>/knowledge.db` |
| Project slug | `ZED_PROJECT` > `CLAUDE_PROJECT_DIR` basename > cwd basename | repo dir name |
| Loop dir | `<dataDir>/loops/<project-slug>` | `<dataDir>/loops/_default` |

**Per-project model (one Obsidian vault, many projects):** set `ZED_VAULT_ROOT`
to an Obsidian vault and notes are written under `<vault>/<project-slug>/` (one
shared graph; `_global/` stays shared). Evolve-loop state is *runtime
scaffolding*, so it lives under the **data dir** keyed by project — never inside
the Obsidian vault. Unexpanded `${...}` env placeholders are rejected
(`cleanEnvPath`) so a literal `${CLAUDE_PLUGIN_DATA}` can't create a stray vault.

> Set `ZED_VAULT_ROOT`/`ZED_DATA_DIR` in `~/.claude/settings.json` (not just
> `.mcp.json`) so hooks and the CLI inherit them too. See
> [SETUP-NEW-PROJECT.md](SETUP-NEW-PROJECT.md).

## Hook Enforcement Chain

```
SessionStart ----> PostToolUse ----> PreCompact ----> Stop
    |                  |                 |              |
    |                  |                 |              +- Capture gate
    |                  |                 |              +- Handoff gate
    |                  |                 |              +- Drift gate
    |                  |                 |              +- Loop continuation
    |                  |                 |
    |                  |                 +- Flush reminder
    |                  |
    |                  +- Edit tracker + drift warning
    |
    +- Graph rebuild + soul doc + vault stats + yesterday's items
```
