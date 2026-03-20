---
description: Show ZED Knowledge Engine usage guide and available commands
---

# ZED Knowledge Engine v6 — Help

You are the ZED Knowledge Engine assistant. Display this help guide to the user:

## Architecture

ZED uses a **hybrid architecture**:
- **4 MCP tools** — used automatically by Claude during conversations (search, read_note, write_note, decide)
- **`zed` CLI** — used via the Bash tool for everything else (stats, health, daily, import, etc.)

## Available Commands

| Command | Description |
|---------|-------------|
| `/zed:search <query>` | Search the knowledge graph (supports AND, OR, NOT, NEAR) |
| `/zed:status` | Show vault statistics (notes, connections, clusters) |
| `/zed:decide <title>` | Create a decision record (ADR) |
| `/zed:daily` | View or create today's session note |
| `/zed:overview` | Comprehensive vault dashboard in one view |
| `/zed:health` | Check vault health score and recommendations |
| `/zed:tags [tag]` | Browse knowledge by tags |
| `/zed:graph` | Visualize the knowledge graph |
| `/zed:template <type> <title>` | Create a note from a template |
| `/zed:import [dir]` | Import markdown files into the vault |
| `/zed:promote <note>` | Promote a note to the global vault |
| `/zed:activate <key>` | Activate a license key |
| `/zed:help` | Show this help guide |
| `/zed [task]` | Force Full mode: deep context + knowledge capture |
| `/evolve "objective"` | Start structured self-improvement loop |
| `/evolve --status` | Check current evolve loop state |
| `/evolve --resume` | Resume an interrupted evolve loop |
| `/evolve --stop` | Stop loop and promote findings to vault |

## MCP Tools (auto-available to Claude)

Claude uses these 4 MCP tools automatically during conversations — no slash command needed:

- `zed_search` — Graph-boosted full-text search
- `zed_read_note` — Read a knowledge note by path
- `zed_write_note` — Write or update a knowledge note
- `zed_decide` — Create a decision record

## CLI Commands (via Bash tool)

All other operations use the `zed` CLI, run via the Bash tool:

- `zed stats` — Vault statistics
- `zed health` — Health score and recommendations
- `zed hubs` — Find most-connected knowledge nodes
- `zed clusters` — Detect knowledge clusters
- `zed path <from> <to>` — Find connection path between two notes
- `zed daily` — Get/create daily session note
- `zed tags` — Browse by tags
- `zed template` — Create from template
- `zed import` — Import markdown files
- `zed promote` — Promote note to global vault
- `zed overview` — Full vault dashboard
- `zed graph` — Graph data for visualization
- `zed rebuild` — Rebuild the knowledge graph index
- `zed license activate` — Activate a license key

## How It Works

The Knowledge Engine maintains a **knowledge graph** of your notes:
- Notes are **nodes** in the graph
- [[Wikilinks]] between notes are **edges**
- Search results are boosted by graph connectivity (more backlinks = higher ranking)
- Related notes are found by traversing the graph, not just keyword matching

## Vault Location

Your knowledge vault is stored in `${CLAUDE_PLUGIN_DATA}/vault/` with subdirectories:
- `decisions/` — Architecture Decision Records
- `patterns/` — Reusable patterns and anti-patterns
- `sessions/` — Daily session notes
- `architecture/` — Architecture documentation
