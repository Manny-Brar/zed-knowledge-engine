# Changelog

## v7.5.0 (2026-04-01)

### Bug Fixes (Gap Analysis — 18 findings resolved)
- 5 CRITICAL: Atomic writes for merge/fix/daily commands, incrementalBuild in decide, TypeError in related decisions
- 7 HIGH: Version string sync, loop-next double-increment guard, wikilink suggestion perf (DB vs file reads), git dir detection
- 6 MEDIUM/CONSISTENCY: Code fence wikilinks, YAML inline comments, layer abstraction (getAllTags), empty vault rebuild, search limit, import traversal reporting
- Schema migration resilience (always verify column existence)

## v7.4.0 (2026-03-25)

### New Features
- `zed export` — portable JSON vault export for migration between machines
- `zed merge` — import notes from exported vault JSON for team knowledge sharing
- `zed diff [hours]` — show vault changes since last session (default 24h)
- Auto-suggest wikilinks when writing notes — graph self-connects
- Duplicate note detection warns before creating similar notes
- Stale note detection (>30 days) in health and analytics commands
- Contextual metadata on all notes improves retrieval accuracy

### Testing
- 208 total tests across 5 suites (52 core + 19 MCP + 89 CLI + 18 E2E + 30 eval)

### Research
- Anthropic engineering blog analysis (21 articles) — patterns applied to tool descriptions, contextual retrieval, and eval design

## v7.3.0 (2026-03-24)

### New Features
- Contextual metadata on notes — each note gets a context_summary combining type, date, tags, and first sentence for improved retrieval (+35-67% accuracy per Anthropic research)
- MCP tool descriptions rewritten with edge cases, examples, and usage guidance per Anthropic SWE-bench findings
- Schema versioning v2 with automatic migration

### Testing
- 30-test protocol adherence eval suite (search quality, capture quality, hook behavior, evolve mechanics, graph operations, protocol adherence)
- 202 total tests across 5 suites (52 core + 17 MCP + 85 CLI + 18 E2E + 30 eval)

### Research
- Full Anthropic engineering blog analysis (21 articles, 5 immediately actionable patterns)

## v7.2.0 (2026-03-23)

### New Features
- `zed search` CLI alias for `zed snippets`
- `zed vault-info` programmatic JSON endpoint
- `zed analytics` — knowledge growth tracking with daily graph
- Structured evolve features: `loop-decompose`, `loop-next`, `loop-complete`
- Enhanced PreCompact hook with unsaved work detection
- Auto-injected rules (zed-first, zed-capture, zed-verify)
- Improved onboarding with empty vault detection

### Infrastructure
- Schema versioning in SQLite database for future migrations
- Atomic file writes prevent note corruption
- Vault .gitignore protection from accidental commits
- Hardened evolve resume/stop flows
- Global vault visible in Light mode search

### Security
- Shell injection prevention in all hook scripts
- Path traversal check on promote subdir
- JSON escaping in stop hook output
- YAML title escaping in zed_decide

### Testing
- 18-step end-to-end lifecycle test
- 10 automated hook tests
- 500-note stress test script
- Error handling audit (10 edge cases)

### Documentation
- CONTRIBUTING.md — contributor guide
- docs/ARCHITECTURE.md — system architecture
- Graph visualizer: search filter, click-to-lock, reset view

## v7.1.0 (2026-03-23)

### New Features
- `zed analytics` — knowledge growth tracking (notes/day, type distribution, graph density, top tags)
- `zed loop-decompose` / `zed loop-next` / `zed loop-complete` — structured feature queue for evolve mode
- PreCompact hook — reminds to flush knowledge before context compression
- Global vault search in Light mode — cross-project patterns now visible automatically
- Search results include content snippets — halves vault lookup round trips
- Auto-injected rules (zed-first, zed-capture, zed-verify) via .claude/rules/
- Improved onboarding — auto-detects empty vault, suggests `zed scan`
- Protocol adherence tracking — session summary with capture ratio

### Security
- Fixed shell injection in all hook scripts (env vars via process.env, not interpolation)
- Fixed backup command injection (execFileSync with arg array)
- Fixed promote command path traversal on subdir parameter
- Fixed stop hook JSON output escaping
- Fixed YAML frontmatter title escaping in zed_decide

### Quality
- Error handling audit — 10 edge cases checked, 6 fixed
- 500-note stress test — all operations under 260ms
- CONTRIBUTING.md and docs/ARCHITECTURE.md added
- Graph visualizer: search filter, click-to-lock, keyboard reset
- Production install.sh with dependency checks + uninstall.sh
- 149 tests (49 core + 17 MCP + 83 CLI), all passing

## v7.0.0 (2026-03-23)

### Architecture
- Blocking Stop hook — agent cannot exit evolve loop without passing capture, handoff, and drift gates
- Phase-gate execution engine — 8 gates (retrieve, plan, research, execute, self-assess, test, capture, document)
- ZED Soul document — identity anchor loaded at every session start
- PreCompact hook — flushes knowledge before context compression

### New Agents
- `zed-planner` — read-only implementation planning (Sonnet)
- `zed-researcher` — fast web research (Haiku)

### New Skills
- `wall-breaker` — obstacle classification with 5 wall types and escalation ladder
- `execution-protocol` rewritten with full 8-gate phase-gate system
- `evolve-mode` rewritten with continuous auto-research and "Identify Next" protocol

### Fixes
- Plugin agents now use CLI via Bash (MCP tools unavailable to plugin agents — GitHub #21560)
- All scripts derive paths from script location (CLAUDE_PLUGIN_ROOT not set in SessionStart — GitHub #27145)
- Capture counter now works (MCP tools increment tracker)
- Daily note auto-created on session end
- Yesterday's "Next Session" items surface on session start
- Drift warning outputs to stdout (was invisible on stderr)
- Skill audit: deduplicated trigger tables, added missing frontmatter names
- Production-grade install.sh with dependency checks + uninstall.sh

### Research Captured to Vault
- Claude Code plugin architecture (26 hooks, skills loading, caching behavior)
- Competitor analysis (Aider, Cline, Cursor, Windsurf, Devin)
- Install UX best practices

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
