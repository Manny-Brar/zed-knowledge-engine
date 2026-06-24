# Add ZED to a new project

How to roll the ZED system out across all your projects, with **one shared
Obsidian vault** and **per-project organization**. After the one-time global
setup, adding ZED to a new project is essentially zero-config — just work in it.

---

## The model (read this once)

```
ONE Obsidian vault (one graph)          ONE data dir (runtime state, not synced)
NELSON/                                 ~/.zed-data/
├── _global/        shared notes        ├── knowledge.db      the graph index
├── dm_setter/      project A notes     └── loops/            evolve-loop state
├── slateos/        project B notes         ├── dm_setter/    project A's loop
├── zed-knowledge-engine/  …               └── slateos/      project B's loop
└── _moc/           map-of-content hubs
```

- **Notes** live in the Obsidian vault under a **per-project folder** (auto-named
  from the repo directory). One graph, so cross-project links and search still work;
  `_global/` is shared knowledge.
- **Runtime state** (the SQLite index, evolve-loop scaffolding) lives in
  `~/.zed-data` — **never** inside the Obsidian vault, so it doesn't sync or clutter.
- **Evolve loops are per-project**: a loop you start in project A only ever
  continues inside project A. (Run `zed loop-path` to see the active project's loop dir.)

The single source of truth for all paths is `core/config.cjs`. Everything — the
MCP server, the `zed` CLI, and the hooks — resolves paths the same way, driven by
two environment variables.

---

## One-time global setup (do this once per machine)

ZED reads two env vars. Set them in **`~/.claude/settings.json`** so the MCP
server, the CLI, **and** the hooks all inherit them (this is the critical part —
`.mcp.json` only configures the MCP server, not the hooks/CLI):

```jsonc
{
  "env": {
    // Your Obsidian vault root — the one graph all projects share.
    "ZED_VAULT_ROOT": "/Users/you/Library/Mobile Documents/iCloud~md~obsidian/Documents/NELSON",
    // Runtime cache + loop state. Keep it OUT of the Obsidian vault.
    "ZED_DATA_DIR": "/Users/you/.zed-data"
  }
  // ...your other settings (permissions, enabledPlugins, etc.)
}
```

Then **restart Claude Code** once so the running MCP server and the session
inherit the new env. Verify:

```bash
zed health        # should report your real vault (A/100, N notes)
zed loop-path     # should print  ~/.zed-data/loops/<this-project>
```

> Why `settings.json` and not `.mcp.json`? `.mcp.json`'s `env` block only reaches
> the MCP server process. Hooks (SessionStart/Stop/PreTool) and the `zed` CLI are
> separate processes — they only pick up env from `settings.json`. Putting the
> vars in only one place is the classic "works in chat but the hooks use the wrong
> vault" bug.

---

## Adding ZED to a new project

Once the global setup is done, **there's nothing to install per project.** Open
the project in Claude Code and start working — ZED auto-creates
`NELSON/<project>/` for notes and `~/.zed-data/loops/<project>/` for any evolve
loop. The project folder name is derived from the repo directory.

The optional touches below make it nicer:

### 1. (Optional) Pin the project folder name

By default the folder/slug is the lowercased repo directory name (e.g.
`/Users/you/code/DM_SETTER` → `dm_setter`). To force a specific name, add a
project-scoped setting in the repo's **`.claude/settings.json`**:

```jsonc
{ "env": { "ZED_PROJECT": "dm_setter" } }
```

Set `ZED_PROJECT` to `""` to opt a project out of per-project foldering (notes go
to the vault root).

### 2. (Optional, recommended) Declare a North Star

Give the project a long-running goal so ZED keeps work on-target (Standard 11).
Add a `## North Star` block to the repo's **`CLAUDE.md`**, or run:

```bash
zed goal-pin "Ship a reliable X" --criteria "tests green; no regressions"
```

### 3. Verify

```bash
zed health                       # vault grade + note count
zed loop-path                    # ~/.zed-data/loops/<project>
zed search "something"           # graph-boosted search across the whole vault
```

That's it. Notes you capture (`zed decide`, `zed_write_note`, daily notes) land
under `NELSON/<project>/`; evolve loops stay scoped to the project.

---

## Running an evolve loop in a project

```bash
/zed:evolve "harden the auth flow"      # starts a loop in THIS project only
zed loop-path                            # where its state lives
/zed:evolve --status
/zed:evolve --stop                       # always stop cleanly when done
```

Because loops are per-project, a loop left running in one repo will **not** hijack
the Stop hook in another. Still, **stop loops you're done with** (`/zed:evolve
--stop`) — a never-stopped loop stays "active" in its project's slot.

---

## Keeping the vault healthy

```bash
zed health            # grade (aim for A); lists orphans
zed tend distill      # one-shot tidy: generate MOC hubs + stitch orphans
zed tend moc          # (preview) map-of-content hubs per tag
zed tend stitch       # (preview) connect orphan notes
```

Add `--apply` to `tend` subcommands to write changes (they're dry-run by default).

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Hooks/CLI use the wrong vault; `zed health` shows a stale or empty vault | Env set only in `.mcp.json`, not `settings.json` | Move `ZED_VAULT_ROOT`/`ZED_DATA_DIR` into `~/.claude/settings.json`; restart |
| Changes to `settings.json` didn't take effect | Running session/server still has old env | Restart Claude Code (hooks pick up changes on next fire; the MCP server needs a restart) |
| A stray `${CLAUDE_PLUGIN_DATA}` folder appears in a repo | Host didn't expand the placeholder | Already guarded by `config.cjs` (`cleanEnvPath`); delete the stray dir, it won't recur |
| Project notes land in the wrong folder | Slug derived from an unexpected cwd | Pin `ZED_PROJECT` in the repo's `.claude/settings.json` |
| An evolve loop won't stop nagging the Stop hook | A loop was never stopped | `cd` into that project and run `/zed:evolve --stop`, or archive `~/.zed-data/loops/<project>/` |

---

## Reference: what resolves where

| Thing | Resolver | Default |
|---|---|---|
| Vault (notes) | `ZED_VAULT_DIR` > `ZED_VAULT_ROOT` > `<dataDir>/vault` | `<dataDir>/vault` |
| Data dir (cache/state) | `ZED_DATA_DIR` > `CLAUDE_PLUGIN_DATA` > `~/.zed-data` | `~/.zed-data` |
| DB index | `ZED_DB_PATH` > `<dataDir>/knowledge.db` | `<dataDir>/knowledge.db` |
| Project folder/slug | `ZED_PROJECT` > `CLAUDE_PROJECT_DIR` basename > cwd basename | repo dir name |
| Evolve loop dir | `<dataDir>/loops/<project-slug>` | `<dataDir>/loops/_default` |

All of these are computed in `core/config.cjs` — the one place to look if a path
is ever surprising.
