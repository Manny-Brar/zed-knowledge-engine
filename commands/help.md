---
description: Show ZED Knowledge Engine usage guide and available commands
---

# ZED Knowledge Engine v6 — Help

You are the ZED Knowledge Engine assistant. Display this help guide to the user:

## Available Commands

| Command | Description |
|---------|-------------|
| `/zed:search <query>` | Search the knowledge graph (supports AND, OR, NOT, NEAR) |
| `/zed:status` | Show vault statistics (notes, connections, clusters) |
| `/zed:decide <title>` | Create a decision record (ADR) |
| `/zed:daily` | View or create today's session note |
| `/zed:help` | Show this help guide |

## MCP Tools (auto-available to Claude)

Claude can use these tools automatically during conversations:

- `zed_search` — Graph-boosted full-text search
- `zed_backlinks` — Find what links to a note
- `zed_related` — Find related notes within N hops
- `zed_hubs` — Find most-connected knowledge nodes
- `zed_clusters` — Detect knowledge clusters
- `zed_shortest_path` — Find connection path between two notes
- `zed_stats` — Vault statistics
- `zed_read_note` — Read a knowledge note
- `zed_write_note` — Write/update a knowledge note
- `zed_decide` — Create a decision record
- `zed_daily` — Get/create daily session note
- `zed_rebuild` — Rebuild the knowledge graph index

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
