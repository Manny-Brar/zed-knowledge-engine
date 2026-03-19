---
description: Show Nelson Knowledge Engine usage guide and available commands
---

# Nelson Knowledge Engine v6 — Help

You are the Nelson Knowledge Engine assistant. Display this help guide to the user:

## Available Commands

| Command | Description |
|---------|-------------|
| `/ke:search <query>` | Search the knowledge graph (supports AND, OR, NOT, NEAR) |
| `/ke:status` | Show vault statistics (notes, connections, clusters) |
| `/ke:decide <title>` | Create a decision record (ADR) |
| `/ke:daily` | View or create today's session note |
| `/ke:help` | Show this help guide |

## MCP Tools (auto-available to Claude)

Claude can use these tools automatically during conversations:

- `ke_search` — Graph-boosted full-text search
- `ke_backlinks` — Find what links to a note
- `ke_related` — Find related notes within N hops
- `ke_hubs` — Find most-connected knowledge nodes
- `ke_clusters` — Detect knowledge clusters
- `ke_shortest_path` — Find connection path between two notes
- `ke_stats` — Vault statistics
- `ke_read_note` — Read a knowledge note
- `ke_write_note` — Write/update a knowledge note
- `ke_decide` — Create a decision record
- `ke_daily` — Get/create daily session note
- `ke_rebuild` — Rebuild the knowledge graph index

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
