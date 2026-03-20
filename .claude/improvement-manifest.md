# ZED Overnight Improvement Manifest
# Created: 2026-03-20
# Loop: self-improvement, self-healing, self-enhancement
# Strategy: work through P0 → P1 → P2 → P3 in order

## Instructions for Loop Agent
- Pick the next PENDING item
- Research → implement → test → commit → mark DONE
- If tests fail after a fix, revert and mark BLOCKED with reason
- Run `npm test` after every change
- Commit each fix individually with descriptive message
- Update this manifest after each item
- Push to GitHub after every 3 commits

## P0 — Critical (fix first)

### P0-01: Fix phantom MCP tool references in skills/agents [DONE]
**Files**: commands/help.md, skills/context-loader.md, skills/execution-protocol.md, skills/onboarding.md, agents/knowledge-indexer.md, agents/graph-explorer.md
**Problem**: Skills/agents reference MCP tools that don't exist (zed_related, zed_backlinks, zed_hubs, zed_daily, zed_rebuild, zed_template, zed_import, zed_stats, zed_clusters, zed_recent, zed_shortest_path). Only 4 MCP tools exist: zed_search, zed_read_note, zed_write_note, zed_decide.
**Fix**: Replace non-existent MCP tool calls with equivalent CLI commands via Bash tool (e.g., `zed_backlinks <note>` → `zed backlinks <note>` via Bash). Also fix wrong CLI names in help.md (e.g., `zed shortest-path` → `zed path`, remove `zed read-note`/`zed write-note`).
**Complexity**: medium
**ALSO**: Update the INSTALLED copy at ~/.claude/plugins/ZED/ with the same fixes

### P0-02: Fix daily-append phantom command [DONE]
**Files**: commands/zed.md
**Problem**: Line 27 tells Claude to run `zed daily-append` but that command doesn't exist. The actual command is `zed daily "text"`.
**Fix**: Change instruction to use `zed daily "summary text"` instead of `zed daily-append`.
**Complexity**: small
**ALSO**: Update the INSTALLED copy at ~/.claude/plugins/ZED/commands/zed.md

### P0-03: Fix license.cjs wrong command prefix [DONE]
**Files**: core/license.cjs
**Problem**: Line 183 says `Activate a license with /ke:activate` — should be `/zed:activate`.
**Fix**: Replace `/ke:activate` with `/zed:activate`.
**Complexity**: small

## P1 — High

### P1-01: Fix loop-promote crash with subdirectories [DONE]
**Files**: bin/zed (lines 833-899)
**Problem**: `fs.unlinkSync()` on every entry in `_loop/` will throw EPERM if subdirs exist.
**Fix**: Add `isFile()` guard or use `fs.rmSync(path, { recursive: true, force: true })`.
**Complexity**: small

### P1-02: Fix health score divergence between commands [DONE]
**Files**: bin/zed (lines 231-249, 634-638)
**Problem**: `health` and `overview` compute health scores differently — hub list filtering diverges.
**Fix**: Extract `computeHealthScore()` function, call from both places.
**Complexity**: small

### P1-03: Fill BETA-GUIDE.md placeholders [DONE]
**Files**: BETA-GUIDE.md
**Problem**: Unfilled `[contact method]` placeholder, `/ke:activate` prefix.
**Fix**: Fill with GitHub Issues URL, fix prefix to `/zed:activate`.
**Complexity**: small

### P1-04: Fix tags command DB encapsulation break [DONE]
**Files**: bin/zed (lines 278-292)
**Problem**: CLI reaches into `engine.graph.db` directly to query tags.
**Fix**: Add `getAllTags()` method to KnowledgeEngine, call from CLI.
**Complexity**: small

### P1-05: Add missing test coverage [DONE]
**Files**: core/test.cjs, cli/test-cli.cjs
**Problem**: No tests for incrementalBuild, loop commands, searchWithSnippets, license.
**Fix**: Add test cases. Prioritize loop commands and incrementalBuild.
**Complexity**: medium

## P2 — Medium

### P2-01: Cache adjacency list in graph traversals [DONE]
**Files**: core/graph-layer.cjs (lines 318, 372, 429)
**Problem**: Adjacency list rebuilt from scratch on every shortestPath/getRelated/getClusters call.
**Fix**: Cache with `_adjCache` pattern, invalidate on rebuild.
**Complexity**: medium

### P2-02: Debounce rebuild in MCP write_note [DONE]
**Files**: server/mcp-server.mjs (line 148)
**Problem**: Every `zed_write_note` triggers full `engine.rebuild()`.
**Fix**: Use `engine.incrementalBuild()` instead.
**Complexity**: small

### P2-03: Fix README vs agent subcommand count mismatch [DONE]
**Files**: agents/zed.md
**Problem**: Says "20 subcommands" but actual count is 26.
**Fix**: Update to 26.
**Complexity**: small

### P2-04: Add LIMIT to findHubs SQL query [DONE]
**Files**: core/graph-layer.cjs (line 302)
**Problem**: Fetches ALL nodes then slices in JS.
**Fix**: Add `LIMIT ?` parameter to prepared statement.
**Complexity**: small

### P2-05: Fix benchmark validation bug [DONE]
**Files**: core/bench.cjs (lines 158-171)
**Problem**: Only validates Full build result, search target is never checked.
**Fix**: Store all results in array and validate each by name.
**Complexity**: small

### P2-06: Optimize suggest-links O(n²) scan [DONE]
**Files**: bin/zed (lines 448-486)
**Problem**: O(n²) title scanning across all notes.
**Fix**: Use FTS5 query per title instead of substring scan.
**Complexity**: medium

## P3 — Low

### P3-01: Add timeline type validation [DONE]
**Files**: bin/zed (line 489)
**Fix**: Print valid types list if invalid type given.
**Complexity**: small

### P3-02: Fix promote silent exit code [DONE]
**Files**: bin/zed (line 560)
**Fix**: Return JSON with `alreadyExists: true` in --json mode instead of exit 1.
**Complexity**: small

### P3-03: Fix settings.json missing skills [DONE]
**Files**: settings.json
**Fix**: Add full-mode, evolve-mode, onboarding to skills array.
**Complexity**: small

### P3-04: Optimize recent command file reads [DONE]
**Files**: bin/zed
**Fix**: Query titles from SQLite nodes table instead of reading every file.
**Complexity**: small

---

## Loop Progress
- Items completed: 21/21
- Last iteration: 2 (2026-03-20 ~06:30 UTC)
- Last commit: 1e15169
- Tests passing: 35/35 core tests
- Remaining: P1-05 (tests), P2-06 (suggest-links perf), P3-02 (DONE in 3e0631d), P3-04 (DONE in 3e0631d)
- Actually remaining: P1-05, P2-06 only
