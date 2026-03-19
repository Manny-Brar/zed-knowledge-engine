# Changelog

## v6.0.0 — 2026-03-19

### Initial Release

**Core Engine**
- File layer: markdown I/O, wikilink parsing, YAML frontmatter extraction, file watching
- Graph layer: SQLite knowledge graph with nodes, edges, BFS shortest path, N-hop related, orphan detection, cluster detection (union-find), hub analysis
- Search layer: FTS5 full-text search with graph-boosted ranking (score × (1 + 0.1 × backlinks)), tiered search (L0 titles, L1 summaries, L2 full content)
- 35 tests, all passing

**Claude Code Plugin**
- Plugin manifest with commands, skills, agents, hooks, MCP server
- 14 MCP tools: ke_search, ke_backlinks, ke_related, ke_hubs, ke_clusters, ke_shortest_path, ke_stats, ke_read_note, ke_write_note, ke_decide, ke_daily, ke_rebuild, ke_license, ke_graph_data
- 7 slash commands: /ke:help, /ke:status, /ke:search, /ke:decide, /ke:daily, /ke:graph, /ke:activate

**Auto-Capture**
- SessionStart hook: rebuilds graph, shows vault status
- Stop hook: captures git activity to daily session note
- Context loader skill: auto-loads relevant graph context
- Compound learner skill: extracts patterns/anti-patterns after work

**Templates**
- Decision Record (ADR), Architecture Doc, Bug Postmortem, Pattern Library, Daily Session

**Agents**
- Knowledge indexer: graph health audits and connection suggestions
- Graph explorer: deep graph traversal for knowledge questions

**License**
- 14-day free trial
- Offline key validation with checksum
- License key format: KE6-XXXX-XXXX-XXXX-XXXX
