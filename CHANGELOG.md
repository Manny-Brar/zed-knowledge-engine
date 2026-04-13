# Changelog

## v8.2.0 (2026-04-13)

### Effectiveness enforcement — ZED now enforces its own rules

The strategic plan "Enforce Before Expand" — no new features until the
system proves it compounds knowledge. Four phases shipped:

#### Phase 1: MCP Event Logging (telemetry foundation)

- **`core/event-log.cjs`** — append-only JSONL log of every MCP tool
  invocation. Records: tool name, timestamp, result count, duration,
  session ID. Never logs argument values (privacy).
- **Auto-instrumented**: monkey-patches `server.tool()` so all 8 MCP
  tools are wrapped automatically — zero per-tool edits.
- **Aggregation**: `aggregateToolUsage()` (per-tool call counts, avg per
  session) and `aggregateProtocolAdherence()` (search-before-write rate,
  search hit rate).
- **Auto-prune**: keeps last 30 days of events.
- 12 new tests in `core/test-event-log.cjs`.

#### Phase 2: Auto-Wikilink Injection (connectivity)

- **`core/autolink.cjs`** — `injectWikilinks(content, titleList, opts)`
  scans note body for mentions of existing note titles and wraps them
  in `[[wikilinks]]` before writing. Replaces the old "suggest only"
  approach that reported links but never applied them.
- **Longest-first matching** prevents "Auth Strategy" → "[[Auth]] Strategy".
- **Skip rules**: titles ≤3 chars, code blocks (fenced + inline),
  existing wikilinks, markdown links, URLs, frontmatter.
- **Whole-word boundaries** via `(?<!\w)..(?!\w)` lookaround (not `\b`)
  so titles with special chars like "C++ Design Patterns" work.
- **Wired into `zed_write_note`**: every note written via MCP gets
  auto-linked against the current knowledge graph. Response includes
  "Auto-linked: [[X]], [[Y]]".
- Configurable: `ZED_AUTOLINK=0` disables.
- 17 new tests in `core/test-autolink.cjs`.

#### Phase 3: Metric History + Trends

- Each `zed metrics` run auto-persists to `metrics-history.jsonl`.
- **Trend display**: "66/100 (C) ↑ +6 from last run (improving)".
- `computeTrends()` compares vs. last run and vs. 7 days ago.
- Direction: 'improving' / 'stable' / 'declining' based on last 3 scores.
- Auto-dedup (within 60s) and auto-prune (365 entries max).

#### Phase 4: Protocol Enforcement

- **Session grading** in `scripts/stop-hook.sh`: reads the MCP event log
  for the current session and grades it:
  - A: searched vault AND captured knowledge
  - B: searched OR captured
  - C: few tool calls (neutral)
  - D: many edits, no search, no capture
  Reports tool calls, searches, captures, and search-before-write rate.
- **Pre-tool search suggestion** in `scripts/pre-tool-hook.sh`: fires
  ONCE per session (flag-file gated) if no `zed_search` has been called
  before the first Edit/Write. Non-blocking, informational.
- **Session-start cleanup**: resets the search-reminded flag each session.

#### `zed metrics` upgraded output

```
ZED Effectiveness: 72/100 (B) ↑ +6 from last run (improving)

── Growth ──
── Connectivity ──
── Wiki Compile ──
── Capture Ratio ──
── Freshness ──
── Tool Usage ──        ← NEW: per-tool call counts, avg/session
── Protocol Adherence ──← NEW: search-before-write %, search hit rate
── Evolve Loops ──
```

#### Bug fix: settings.json missing new skills

`settings.json` was only listing 7 of 11 skills. The v8.0 skills
(`wiki-compiler`, `clip-ingestion`, `llm-council`) and `wall-breaker`
were on disk but not registered. Fixed — all 11 skills now listed.

#### Testing

407 → **436 tests** (+29), all passing:

| Suite | v8.1 | v8.2 |
|---|---|---|
| core | 52 | 52 |
| ingest | 42 | 42 |
| template | 69 | 69 |
| wiki | 26 | 26 |
| council | 23 | 23 |
| metrics | 18 | 18 |
| event-log | — | **12** |
| autolink | — | **17** |
| MCP | 19 | 19 |
| CLI | 110 | 110 |
| E2E | 18 | 18 |
| Eval | 30 | 30 |

## v8.1.0 (2026-04-10)

Quality and coverage pass on top of v8.0.0. **385 tests (+29)**, all passing.

### Defuddle extraction fixed

`extractFromHtml()` was silently falling through to the Readability + Turndown
fallback for every clip because:

1. The browser-sync Defuddle class was being instantiated with a JSDOM
   *wrapper* instead of the Document instance — defuddle does nothing silently
   when passed the wrong type.
2. The `markdown: true` option only takes effect in `defuddle/node` (ESM-only
   async variant), not the sync `defuddle` main export, so even when defuddle
   returned content it was HTML, not markdown.

Fixed both:
- Pass `dom.window.document` (the Document instance) into `new Defuddle()`.
- Pipe Defuddle's cleaned HTML through Turndown for the markdown conversion.
- Suppress Defuddle's unconditional `console.log("Initial parse returned very
  little content")` noise around the call site (can be re-enabled with
  `ZED_DEBUG_EXTRACTOR=1`).

End-to-end verification: clipping produces `Strategy: fetch / defuddle` with
proper code-fence language hints, `[text](url)` link preservation, and clean
list rendering. A new regression test asserts defuddle is the active
extractor when the dep is installed.

### New: `zed ingest-pdf`

PDF ingestion for `raw/papers/`. Strategy:

1. **`pdftotext`** (poppler) if on PATH → full text extraction
2. **Stub fallback** otherwise → metadata-only note pointing at the PDF,
   with instructions for Claude to read the file directly via its native
   PDF support

Supports both local file paths and `http(s)://` URLs (downloads to tmp,
extracts, cleans up). Writes source metadata (`source`, `source_path`,
`extractor`) so `wiki-health` can track provenance.

CLI: `zed ingest-pdf <path|url> [--tag a,b]`.
Export: `ingestLayer.ingestPdf(pathOrUrl, opts)`.
4 new tests in `core/test-ingest.cjs` (stub path + poppler path when available).

### New: LLM interpreter wired into `zed clip`

Templates that use `{{"prompt text"}}` Interpreter variables (Obsidian Web
Clipper's batch-prompt feature) now actually call an LLM. Auto-detection:

- If `ANTHROPIC_API_KEY` is set → claude-haiku for cost
- Else if `OPENROUTER_API_KEY` is set → `anthropic/claude-haiku` via OR
- Else → returns empty strings (templates degrade gracefully)

Disabled by `--no-interpret` on the CLI or `interpret: false` in opts.
Tested in `core/test-ingest.cjs` (3 new tests) — verifies the auto-wire
logic without making real API calls.

New export: `ingestLayer.buildInterpreter(opts)`.

### New: `ZED_COUNCIL_BUDGET` enforcement

The `llm-council` skill promised a budget cap; now it actually enforces one.

**Ledger**: `<data-dir>/council-budget.json` tracks `{spent, calls, reset_at}`
across invocations. `estimateCost()` uses rough USD-per-million-token prices
per provider (conservative — the cap is a safety rail, not billing).

**Pre-check**: if `ZED_COUNCIL_BUDGET` is set and `ledger.spent >= cap`, the
council refuses to start and returns a structured failure note. `result.budget`
reports `{cap, spent, remaining, calls}`.

**Mid-run check**: after stage 2 (rankings), if the budget is now exceeded,
stage 3 (chairman synthesis) is skipped and an error is recorded at
`{stage: 3, error: "budget cap reached"}`. Stages 1+2 still return.

**CLI**:
- `zed council --budget-status` → show current spend / cap / remaining
- `zed council --reset-budget` → zero the ledger

**Tests**: 4 new tests in `core/test-council.cjs` covering pre-check,
mid-run skip, ledger tracking, and reset.

### Wiki temporal metadata (Graphiti-style)

`listWikiFiles()` now surfaces optional frontmatter fields:

- `created` — when the entry was first authored
- `updated` — last semantic update
- `expires_at` — when the knowledge becomes stale
- `superseded_by` — wikilink to a replacement entry

`healthCheck()` uses these:

- `h.expired` — entries whose `expires_at` is in the past (score penalty)
- `h.superseded` — entries with `superseded_by`, plus a `replacement_found` flag
- `h.wikiCount` — now correctly **excludes `index.md` and `log.md`** (they're
  scaffolding, not knowledge)

3 new wiki tests + 1 updated wikiCount test. Skill updates
([skills/wiki-compiler.md](skills/wiki-compiler.md)) document the fields.

### Session-start shows the schema

[scripts/session-start.sh](scripts/session-start.sh) now prints the first 30
lines of `vault/schema.md` at session start, grounding Claude in the Karpathy
vault contract before any work happens.

### New CLI integration tests

13 new tests in [cli/test-cli.cjs](cli/test-cli.cjs) covering the v8.0 surface:

- `compile` (plain + `--json` + schema creation + index/log creation)
- `compile --synthesize --since --label`
- `wiki-health` (plain + `--json`)
- `council --budget-status` (plain + `--json`)
- `council --reset-budget`
- `clip` URL validation (invalid + ftp)
- `ingest-pdf` missing-file error

### Test totals

**356 → 385 (+29), all passing**:

| Suite | v8.0 | v8.1 |
|---|---|---|
| core | 52 | 52 |
| ingest | 34 | **42** (+8) |
| template | 69 | 69 |
| wiki | 21 | **25** (+4) |
| council | 19 | **23** (+4) |
| MCP | 19 | 19 |
| CLI | 94 | **107** (+13) |
| E2E | 18 | 18 |
| Eval | 30 | 30 |

## v8.0.0 (2026-04-10)

### Wiki Engine — Karpathy-style raw/wiki/schema architecture

A major release that turns ZED from a capture-first knowledge graph into a
full **ingest → compile → compound** engine based on Andrej Karpathy's
[LLM wiki pattern](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)
and his
[llm-council](https://github.com/karpathy/llm-council) multi-model review
pattern.

### New vault layout

```
vault/
├── raw/                # IMMUTABLE external sources
│   ├── clips/          #   web clips (zed clip)
│   ├── repos/          #   repomix dumps (zed ingest-repo)
│   ├── papers/         #   PDFs
│   └── transcripts/    #   YouTube + other transcripts (zed ingest-yt)
├── wiki/               # LLM-compiled knowledge artifact
│   ├── index.md        #   auto-maintained TOC
│   ├── log.md          #   append-only change log
│   ├── concepts/
│   ├── entities/
│   └── syntheses/      #   cross-source + pre-compact snapshots
├── _templates/         # user-override clip templates (Web Clipper JSON format)
└── schema.md           # the agent-facing contract for the whole vault
```

### New core modules

- **`core/ingest-layer.cjs`** — `clipUrl()`, `ingestYouTube()`, `ingestRepo()`,
  `htmlToNote()`, `extractFromHtml()`, `emitFrontmatter()`, `slugify()`,
  `fetchHtml()`. Lazy-loads Playwright, Defuddle, Readability, Turndown, jsdom.
  Graceful degradation: Defuddle → Readability+Turndown → naive HTML strip.
- **`core/template-engine.cjs`** — Web-Clipper-compatible template DSL.
  Variable resolver for `{{preset}}`, `{{meta:name:X}}`, `{{selector:.css}}`,
  `{{selectorHtml:...}}`, `{{schema:@Type:field}}`, and `{{"prompt"}}`
  interpreter slots. **28+ filters** (trim, lower, upper, capitalize,
  title_case, reverse, length, strip_md, slice, replace, default, split,
  join, first, last, unique, map, safe_name, safe_filename, date, markdown,
  blockquote, callout, link, wikilink, image, list, number, safe). Supports
  both `,` and `:` as filter-argument separators. Sync `render()` and
  async `renderAsync()` that batches interpreter prompts.
- **`core/wiki-layer.cjs`** — Deterministic Karpathy compile loop:
  `planCompile({since})`, `updateIndex()`, `appendLog()`, `healthCheck()`,
  `writeSessionSynthesis({since, label})`, `ensureSchema()`. Never calls an
  LLM — the compile plan is a structured task list that Claude (in the
  user's current session) is expected to act on via `zed_read_note` +
  `zed_write_note`.
- **`core/council.cjs`** — Three-stage LLM council:
  1. **Stage 1** — dispatch the question to N models in parallel
  2. **Stage 2** — anonymous peer ranking + 1-sentence critique
  3. **Stage 3** — chairman synthesis with consensus + dissent
  Native `fetch` to Anthropic and OpenRouter — no new SDK dependencies.
  Injected `providers` registry makes the three-stage flow fully
  unit-testable with zero real API calls.

### New CLI commands

- `zed clip <url> [--tag a,b] [--auth file] [--strategy auto|playwright|fetch]`
- `zed ingest-yt <url>` — YouTube transcript via `youtube-transcript`
- `zed ingest-repo <git-url>` — repo dump via `npx repomix`
- `zed compile [--since <hours>] [--synthesize] [--label <name>]` — show
  the compile plan, rebuild `index.md`, append to `log.md`, or write a
  deterministic session synthesis
- `zed wiki-health` — 0-100 wiki quality score with breakdown: uncompiled
  raw, stale entries, orphan wiki, broken wikilinks, entries without
  provenance
- `zed council "<question>" [--models claude,gpt,gemini] [--chairman claude] [--save]`

### New MCP tools (8 total now)

| | Tool | Purpose |
|---|---|---|
| existing | `zed_search` | Graph-boosted FTS |
| existing | `zed_read_note` | Read a note |
| existing | `zed_write_note` | Create/update a note |
| existing | `zed_decide` | Create an ADR |
| **new** | `zed_clip` | Clip a URL into `raw/clips/` |
| **new** | `zed_wiki_compile` | Run the Karpathy compile plan |
| **new** | `zed_wiki_health` | Lint the wiki |
| **new** | `zed_council` | Multi-model consultation for Tier 3 decisions |

### New skills

- `skills/wiki-compiler.md` — how Claude should behave when the compile
  plan has uncompiled raw files (classify → read → write → cross-link)
- `skills/clip-ingestion.md` — when to use `zed_clip` vs specialized
  ingesters, template routing, dedup, auth handling
- `skills/llm-council.md` — when to fire the council, how to phrase
  questions, how to interpret verdicts, budget discipline

### Skill updates

- `skills/evolve-mode.md`: adds **Gate 2.5 (Ingest)** and **Gate 4.5
  (Council)** to the phase-gate engine. Auto-whitelists `raw/` and
  `wiki/` in scope-hard-lock so ingestion never counts as drift.
- `skills/execution-protocol.md`: adds **Gate 2.5 (Council)** for Tier 3
  hard-to-reverse decisions. Gate 2 (Research) now prefers the
  clip→compile flow over ad-hoc `research/` notes.

### Hook updates

- **Pre-compact hook rewritten**: now actively runs
  `zed compile --synthesize --since 4 --label pre-compact`, which writes
  a deterministic session snapshot to `wiki/syntheses/session-*.md`
  BEFORE context compaction. The snapshot is search-indexed and survives
  compaction — turning a destructive event into a durable artifact.
- **Session-start hook**: now reports uncompiled raw source count at
  session start so Claude notices work left behind.

### Bundled clip templates (`templates/clip-templates/`)

Ships with 6 starter templates (Obsidian Web Clipper-compatible JSON):
`article.json` (generic fallthrough), `anthropic-docs.json`,
`arxiv.json`, `github-readme.json`, `youtube.json`, `hackernews.json`.
User overrides go in `<vault>/_templates/`.

### Dependencies added

- `playwright` — JS-rendered page fetching (chromium postinstall,
  skip with `ZED_SKIP_PLAYWRIGHT=1`)
- `defuddle` — primary extractor (by the Obsidian Web Clipper author)
- `@mozilla/readability` + `turndown` + `jsdom` — fallback pipeline
- `youtube-transcript` — transcript ingestion

### Testing

Total tests: **213 → 356** (+143).

- `core/test-ingest.cjs`: **34 tests** — slugify, hostFromUrl,
  emitFrontmatter (round-trip through file-layer parser), extractFromHtml
  (HTML fixtures), htmlToNote, stubbed fetch-based clipUrl with template
  selection
- `core/test-template.cjs`: **69 tests** — every filter, tokenizer,
  variable parser, selector/meta/schema.org resolvers, async interpreter
  batching, template matching + loading
- `core/test-wiki.cjs`: **21 tests** — inventory, planCompile (uncompiled,
  stale, orphan, since-filter), updateIndex, appendLog, healthCheck,
  writeSessionSynthesis, ensureSchema
- `core/test-council.cjs`: **19 tests** — resolveAlias, parseRanking,
  prompt builders, full three-stage flow with mocked providers including
  parallel-dispatch verification and graceful degradation
- MCP server test updated to the v8.0 tool surface (8 tools)

### Bug fixes (pre-existing)

- `cli/test-cli.cjs`, `cli/test-e2e.cjs`, `cli/test-eval.cjs`: quoted the
  `bin/zed` path in `execSync` calls so spaces in the installed path
  (e.g. iCloud's `Mobile Documents`) no longer break the CLI test suite.

## v7.7.0 (2026-03-31)

### Evolve Mode — Cron Loop & ULTRATHINK
- **Cron mode** (`--cron` flag): 3-minute recurring cycle between iterations — runs autonomously until `--stop`
- **ULTRATHINK task selection**: Mandatory 5-level analysis (standard/deep/adversarial/meta/compound) after every iteration to select highest-impact next task
- **Scope-hard-lock enforcement**: 4 rules — action justification, file boundary, forbidden actions, task category lock (IMPLEMENT/FIX/TEST/HARDEN/OPTIMIZE/DOCUMENT)
- **Scope boundary file** (`scope-boundary.md`): Established in iteration 0, enforced by pre-tool hook and stop hook
- **Cron state management**: `evolve-cron.sh` script with start/stop/status/check/tick commands
- **Enhanced stop hook**: Scope violation detection, cron-aware continuation, unlimited iteration support

### Context Management
- **Auto-compact at 50%**: New protocol to trigger `/compact` before the "dumb zone" (60-70% context where Claude degrades)
- **Token overhead awareness**: Budget guidelines — Light <500 tokens, Full <3000 tokens context load, Evolve ~1000 tokens/iteration
- **Subagent context isolation**: Delegate research/validation to separate agents to keep main context clean

### Back-Pressure Mechanisms
- **Gate 5 (TEST) hard blocker**: Tests MUST pass before advancing — no exceptions, no "fix it later"
- **Evidence requirements**: Self-assessment (Gate 4) now requires explicit compliance evidence (not just "it works")
- **Back-pressure principle**: Documented in behavior-controller as core optimization philosophy

### Agent Updates
- `agents/zed.md`: ULTRATHINK planning references, context management section, back-pressure execution style
- Version bumped to v7.7

### Pre-Tool Hook Enhancement
- Scope boundary enforcement during evolve mode — warns on out-of-scope file edits
- Checks target file against `scope-boundary.md` before allowing edit

### Documentation
- README: Cron mode, ULTRATHINK, scope-hard-lock, peak performance tips table
- CHANGELOG: Full v7.7.0 release notes

## v7.6.0 (2026-04-01)

### Security & Hardening
- PreToolUse circuit breaker — blocks execution at extreme drift (>40 edits, >12 files)
- ERR traps on all 5 hook scripts
- Comprehensive input validation: truncation, empty checks, path validation
- Stop hook JSON output via node (immune to special characters)
- Session-start graceful degradation on rebuild failure

### Bug Fixes (Deep Gap Analysis — 21 findings)
- 5 CRITICAL: Atomic writes everywhere, incrementalBuild in decide, TypeError in related decisions
- 7 HIGH: Version sync, loop guards, wikilink perf (DB queries), git dir detection
- 6 MEDIUM: Code fence wikilinks, YAML comments, layer abstraction, empty vault rebuild
- 3 LOW: Wall-breaker hints, analytics optimization, merge YAML formatting
- Schema migration resilience (column existence check on every startup)

### Research
- Claude Code source leak analysis (512K lines, KAIROS daemon, 44 feature flags)
- Claude Code internals (37 system-reminders, 3-tier skill loading, PreToolUse patterns)

### Testing
- 213 total tests (52 core + 19 MCP + 94 CLI + 18 E2E + 30 eval)
- 5 new input validation edge case tests

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
