# Changelog

## [6.3.0] - 2026-03-20

### Added
- `zed backup` command for timestamped vault archival
- `zed fix` command for auto-healing vault health issues
- `zed version` command
- `install.sh` one-command installer
- 1000-note stress benchmark tier
- 44 new tests (75 → 119 total)

### Security
- Path traversal containment on all MCP read/write operations
- Empty content write guard in file-layer
- Fixed echo -e escape injection in session-end.sh

### Fixed
- All phantom MCP tool references replaced with CLI equivalents (22 files)
- Plugin loading: flattened skills, removed invalid hook events, clean plugin.json
- Plugin installed to ~/.claude/plugins/ZED/ with correct installPath
- Health score divergence between health and overview commands
- loop-promote crash with subdirectories
- Benchmark validation only checking build result
- Daily append now includes timestamps
- Loop state validation unified across all loop commands
- Graph export now includes all vault nodes, not just hubs
- FTS5 query error handling improved
- loop-tick frontmatter regex restricted to YAML header
- Timeline type validation with error messages
- Promote returns JSON with alreadyExists in --json mode
- computeHealthScore division by zero guard

### Performance
- Adjacency list caching across graph traversal calls
- MCP write_note uses incrementalBuild() instead of full rebuild()
- CLI write commands use incrementalBuild() (6 locations)
- LIMIT parameter in findHubs SQL query
- suggest-links O(n²) optimized to single-pass
- Recent command uses DB for titles instead of reading every file

### Documentation
- README: proper installation instructions with install.sh
- All 16 command descriptions improved for Claude Code autocomplete
- Test counts updated throughout
- BETA-GUIDE placeholders filled
- Command help file accuracy verified

## v6.0.0 — 2026-03-19

### Initial Release — 24 MCP Tools, 13 Commands, 54 Tests

**Core Engine**
- File layer: markdown I/O, wikilink parsing, YAML frontmatter extraction, file watching
- Graph layer: SQLite knowledge graph with nodes, edges, BFS shortest path, N-hop related, orphan detection, cluster detection (union-find), hub analysis, incremental rebuild with file mtime tracking
- Search layer: FTS5 full-text search with graph-boosted ranking, tiered search (L0/L1/L2), search with context snippets
- License manager: 14-day trial, offline key validation with checksum, activation flow
- Performance: readNote cache eliminates double reads during build, prepared statement reuse
- Error hardening: corrupt DB auto-recovery, crash-proof MCP server with error logging
- Benchmarks: 1000 notes in 91ms, search <1ms

**Claude Code Plugin (24 MCP Tools)**
- zed_search, zed_search_snippets, zed_template, zed_backlinks, zed_related, zed_hubs, zed_clusters, zed_shortest_path, zed_stats, zed_read_note, zed_write_note, zed_decide, zed_daily, zed_rebuild, zed_import, zed_license, zed_health, zed_tags, zed_recent, zed_suggest_links, zed_timeline, zed_graph_data, zed_global_search, zed_promote

**13 Slash Commands**
- /zed:overview, /zed:help, /zed:status, /zed:search, /zed:decide, /zed:daily, /zed:template, /zed:health, /zed:tags, /zed:graph, /zed:import, /zed:promote, /zed:activate

**Auto-Capture**
- SessionStart hook: rebuilds graph, shows vault status
- Stop hook: captures git activity to daily session note
- Context loader skill: auto-loads relevant graph context
- Compound learner skill: extracts patterns/anti-patterns after work
- Onboarding skill: first-run guide + project scanner

**Cross-Project Knowledge**
- Global vault at ~/.zed/global/ for patterns that carry across projects
- zed_global_search searches both project + global vaults
- zed_promote copies project notes to global vault

**Knowledge Management**
- 5 built-in templates (decision, architecture, postmortem, pattern, daily)
- Vault health scoring (0-100, A-F grade) with specific recommendations
- Tag navigation and browsing
- Timeline view with date + type badges
- Recently modified notes feed
- Unlinked mention detection with link suggestions

**Agents**
- Knowledge indexer: graph health audits and connection suggestions
- Graph explorer: deep graph traversal for knowledge questions

**Testing**
- 35 core unit tests
- 19 MCP server integration tests
- Performance benchmark suite (100/500/1000 note vaults)

**Documentation**
- Landing page (docs/index.html)
- README with full tool/command reference
- Marketplace distribution repo (nelson-plugins/)
- License server scaffold (nelson-license-server/)
