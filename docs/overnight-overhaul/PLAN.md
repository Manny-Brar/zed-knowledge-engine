# Overnight Overhaul — Multi-Phase Execution Plan (task queue)

Objective: peak-performance ZED — full Obsidian system + Codex built-in + the transferable
Fable-5 levers — executed as scope-locked, test-gated iterations. Derived from the stress-tested
strategic plan (`projects/...strategic-plan.md` in the vault) and the baseline
(`docs/brain-upgrade-baseline-2026-06-23.md`: D/56, 42/74 orphans).

**Global scope set** (files iterations may touch): `core/autolink.cjs`, `core/search-layer.cjs`,
`core/wiki-layer.cjs`, `core/graph-layer.cjs`, `core/metrics.cjs`, `core/event-log.cjs`, `bin/zed`,
`server/mcp-server.mjs`, `templates/**`, `skills/execution-protocol.md`, `skills/wall-breaker.md`,
their `core/test-*.cjs`, and `docs/**`. Anything else → mark task `blocked`.

**Objective measure**: drive frozen `orphanCount` below baseline 42 (Phase 2), with all tests green.

## Phase 2 — Connectivity (orphan killers)

| ID | Task | File set | Status |
|----|------|----------|--------|
| T1 | `autolink.injectRelatedSection(content, related, opts)` — append a `## Related` block of `[[links]]` for related notes not already linked inline. Pure fn. | core/autolink.cjs, core/test-autolink.cjs | todo |
| T2 | `SearchLayer.findRelatedByContent({text, tags, limit, excludePath, minScore})` — FTS-top-hits + tag co-occurrence, ranked, thresholded, self-excluded. | core/search-layer.cjs, core/test-*.cjs | todo |
| T3 | Testable orchestration `computeRelatedForNote(engine, note, opts)` (in autolink or a small module) that combines T2+T1; wire into mcp `zed_write_note`+`zed_decide` to append Related when a note would be orphaned. | core/autolink.cjs, server/mcp-server.mjs, core/test-autolink.cjs | todo |
| T4 | `zed tend stitch` — dry-run by default; `--apply` (+ git-clean check) bulk-runs T3 over existing orphan notes to de-orphan them. | bin/zed, core/autolink.cjs, core/test-*.cjs | todo |
| T5 | `zed tend moc` — MOC/hub generation as a function in wiki-layer (bucket orphans by cluster/tag, cap members>=2, inject `[[links]]`) + `templates/moc.md`. | core/wiki-layer.cjs, bin/zed, templates/, core/test-wiki.cjs | todo |
| T6 | Recency multiplier in `SearchLayer.search` boostedScore; drop backlink boost in suggest-links/find-related paths so orphans surface. | core/search-layer.cjs, core/test-*.cjs | todo |
| T7 | Title-normalization surfacing: flag date-only/non-atomic titled notes that no matcher can hub (report only, no rename). | core/wiki-layer.cjs, bin/zed, core/test-wiki.cjs | todo |

## Phase C — Codex integration (test-gated wiring; small additive doc edits only)

| ID | Task | File set | Status |
|----|------|----------|--------|
| T8 | execution-protocol: add the OPTIONAL Gate-3 delegation sentence + Gate-5/6 HARD-BLOCKER verifier language for Codex `--write` diffs (test-gate + intent check before capture). | skills/execution-protocol.md | todo |
| T9 | behavior-controller: add one `codex-delegation` trigger row (codex:codex-rescue subagent only) + the multi-agent NON-GOAL note. | skills/behavior-controller.md | todo |
| T10 | Codex cost circuit-breaker + telemetry: per-session invocation cap + log invoked/read-vs-write/model-returned/cost in metrics+event-log. | core/metrics.cjs, core/event-log.cjs, core/test-*.cjs | todo |

## Phase 3 — Deterministic + Obsidian + bug-fix

| ID | Task | File set | Status |
|----|------|----------|--------|
| T11 | `zed tend distill` — deterministic-first: compile uncompiled raw via wiki-layer, autolink orphans, rebuild graph, append log. NO unsupervised LLM merge. | bin/zed, core/wiki-layer.cjs, core/test-*.cjs | todo |
| T12 | Obsidian system integration: point ZED at the real iCloud Obsidian vault + seed `.obsidian` config from `templates/obsidian/`. | bin/zed, templates/obsidian/ | blocked (need vault path from user) |
| T13 | Fix the `${CLAUDE_PLUGIN_DATA}` unexpanded-env-var bug that creates a stray in-repo vault dir. | scripts/**, bin/zed | todo |

## EXCLUDED from unattended execution (human review required)

| ID | Task | Why excluded |
|----|------|--------------|
| X1 | Aggressive MUST 31→<10 cut + Skill-Trigger-Table collapse + 5-level ULTRATHINK rewrite | No automated test net; high blast radius on core operating contract. |
| X2 | Optional local semantic layer (sqlite-vec + transformers.js) | Adds dependencies; gate on telemetry + explicit user OK. |
| X3 | Deeper Fable-5 prompt changes beyond the safe subset already shipped | Prompt-semantic, untestable; review interactively. |
