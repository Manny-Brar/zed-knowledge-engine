---
description: Visualize the knowledge graph showing notes and their connections
---

Generate a visual representation of the knowledge graph. Use the knowledge engine MCP tools to gather the data, then create a visualization.

If "$ARGUMENTS" is provided, filter by it (e.g., "decisions" shows only decision nodes, a search term filters to matching notes and their connections).

## Steps

1. Use `zed_stats` to get an overview
2. Use `zed_hubs` (limit 20) to get the most important nodes
3. Use `zed_clusters` to understand groupings
4. For each hub, use `zed_backlinks` to get the connection details

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
