---
description: Visualize the knowledge graph showing notes and their connections
---

Generate a visual representation of the knowledge graph. Run `zed graph` via the Bash tool to gather the data, then create a visualization.

If "$ARGUMENTS" is provided, filter by it (e.g., "decisions" shows only decision nodes, a search term filters to matching notes and their connections).

## Steps

1. Run `zed stats` via the Bash tool to get an overview
2. Run `zed hubs --limit 20` via the Bash tool to get the most important nodes
3. Run `zed clusters` via the Bash tool to understand groupings
4. For each hub, run `zed backlinks <note>` via the Bash tool to get the connection details

## Output Format

Create an ASCII graph visualization showing:
- Nodes as boxes with titles
- Edges as arrows with relationship labels
- Node size (text emphasis) proportional to backlink count
- Color coding by type in the legend

Example:
```
    ┌──────────────┐
    │  Hub Note    │◄──── Alpha
    │  (3 links)   │◄──── Beta
    └──────┬───────┘
           │
           ▼
    ┌──────────────┐
    │   Charlie    │
    └──────────────┘
```

If the Excalidraw MCP is available, also offer to create an interactive Excalidraw diagram using `mcp__excalidraw__export_to_excalidraw`.

For small graphs (< 20 nodes), show all nodes. For larger graphs, show top hubs and their immediate connections.
