# Add ZED to a new project

Roll ZED out across all your projects with **one separate Obsidian vault (and
graph) per project**. After a one-time global setting, adding ZED to a new
project is zero-config — just open it and work; ZED auto-creates that project's
own vault, graph, and loop state.

---

## The model (read this once)

```
ONE base dir (your Obsidian "Documents")        ONE data dir (runtime, not synced)
~/.../iCloud~md~obsidian/Documents/             ~/.zed-data/
├── dm_setter/      ← project A's OWN vault      ├── graphs/
│   ├── decisions/  (its own graph)              │   ├── dm_setter/knowledge.db   ← A's index
│   ├── patterns/                                │   └── slateos/knowledge.db     ← B's index
│   └── _moc/                                    └── loops/
├── slateos/        ← project B's OWN vault          ├── dm_setter/   ← A's evolve loop
│   └── …  (separate graph)                          └── slateos/     ← B's evolve loop
└── NELSON/         ← legacy archive (untouched)
```

- **Each project is its own Obsidian vault** under `<base>/<project-slug>`, with
  its **own graph** and **own DB**. Opening a project's vault in Obsidian shows
  only that project's notes — no merged "everything" graph.
- **Fully isolated**: no cross-project search or links. (If you ever want shared
  knowledge, pin a project to a shared vault with `ZED_VAULT_DIR` — see below.)
- **Runtime state** (SQLite index, evolve-loop scaffolding) lives in `~/.zed-data`,
  never inside the Obsidian vault, keyed by project.

The single source of truth for all paths is `core/config.cjs`; the MCP server,
the `zed` CLI, and the hooks all resolve identically from it.

---

## One-time global setup (once per machine)

Set **two** env vars in **`~/.claude/settings.json`** (not just `.mcp.json` —
that only configures the MCP server, not the hooks/CLI):

```jsonc
{
  "env": {
    // The folder that will CONTAIN one Obsidian vault per project.
    "ZED_VAULT_BASE": "/Users/you/Library/Mobile Documents/iCloud~md~obsidian/Documents",
    // Runtime cache + per-project DBs + loop state. Keep it OUT of Obsidian.
    "ZED_DATA_DIR": "/Users/you/.zed-data"
  }
  // ...your other settings (permissions, enabledPlugins, etc.)
}
```

Restart Claude Code once, then verify with **`zed doctor`** (see below).

> **`ZED_VAULT_BASE` vs `ZED_VAULT_ROOT`:** `ZED_VAULT_BASE` = *separate vault per
> project* (what this guide sets up). `ZED_VAULT_ROOT` = the older *one shared
> vault, per-project subfolders, one merged graph* model. Set one, not both.

---

## Adding ZED to a new project

Nothing to install. Open the project in Claude Code and work — ZED auto-creates
`<base>/<project-slug>/` (its vault) and `~/.zed-data/graphs/<slug>/` (its DB).
The slug is the lowercased repo directory name.

Optional touches:

1. **Pin the vault/folder name** — `.claude/settings.json` in the repo:
   `{ "env": { "ZED_PROJECT": "dm_setter" } }` (forces the slug).
2. **Pin to a SHARED vault instead** (opt a project out of isolation) —
   `{ "env": { "ZED_VAULT_DIR": "/path/to/shared/vault" } }` overrides the base.
3. **Declare a North Star** — add `## North Star` to the repo's `CLAUDE.md`, or
   run `zed goal-pin "…" --criteria "…"`.

Then open `<base>/<project-slug>` as a vault in Obsidian → its Graph View shows
only that project.

---

## Verify anytime: `zed doctor`

One command tells you the version, the source actually loaded, update status, the
active graph model, a feature checklist (codex wiring, lean prompts, per-project
loops/vaults), whether your `settings.json` env is wired, and vault health:

```bash
zed doctor            # full self-check
zed doctor --check    # also compares your installed commit against GitHub
zed loop-path         # this project's evolve-loop dir
```

---

## Updating ZED (all projects at once)

ZED is a **single** plugin shared by every project (symlinked install). One update
covers everything — there is no per-project update:

```bash
git -C ~/projects/zed-knowledge-engine pull   # then restart Claude Code
zed doctor --check                            # confirm you're current
```

---

## Keeping a vault healthy

```bash
zed health            # grade for the CURRENT project's vault (aim for A)
zed tend distill      # one-shot tidy: MOC hubs + stitch orphans (add --apply)
```

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Projects still share one graph | `ZED_VAULT_ROOT` set instead of `ZED_VAULT_BASE` | Swap to `ZED_VAULT_BASE` in `~/.claude/settings.json`; restart |
| Hooks/CLI use the wrong vault | Env only in `.mcp.json`, not `settings.json` | Put `ZED_VAULT_BASE`/`ZED_DATA_DIR` in `~/.claude/settings.json`; restart |
| `settings.json` change didn't take | Running session/server has old env | Restart Claude Code (hooks pick up changes on next fire; the MCP server needs a restart) |
| Project notes land in the wrong vault | Slug derived from an unexpected cwd | Pin `ZED_PROJECT` in the repo's `.claude/settings.json` |
| "Am I current / fully featured?" | — | Run `zed doctor --check` |

---

## Reference: what resolves where

| Thing | Precedence | Default |
|---|---|---|
| Data dir (cache/state) | `ZED_DATA_DIR` > `CLAUDE_PLUGIN_DATA` > `~/.zed-data` | `~/.zed-data` |
| Vault (notes) | `ZED_VAULT_DIR` > `ZED_VAULT_BASE/<slug>` > `ZED_VAULT_ROOT` > `<dataDir>/vault` | `<dataDir>/vault` |
| DB index | `ZED_DB_PATH` > (per-project) `<dataDir>/graphs/<slug>/knowledge.db` > `<dataDir>/knowledge.db` | per project in base mode |
| Project slug | `ZED_PROJECT` > `CLAUDE_PROJECT_DIR` basename > cwd basename | repo dir name |
| Evolve loop dir | `<dataDir>/loops/<project-slug>` | `<dataDir>/loops/_default` |

All computed in `core/config.cjs` — the one place to look if a path surprises you.
