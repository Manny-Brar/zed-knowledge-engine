# Overnight Overhaul — Live Progress State

The autonomous loop reads and updates this file every iteration. Humans: this is the dashboard.

## Counters

- iteration: 6
- maxIterations: 30
- failStreak: 0
- failStreakLimit: 3
- branch: zed-overnight-overhaul
- baselineOrphanCount: 42
- currentOrphanCount: 42
- cronJobId: e13726c4
- status: running

## Task status (mirror of PLAN; loop keeps in sync)

- T1 injectRelatedSection: done
- T2 findRelatedByContent: done
- T3 computeRelatedForNote + MCP wiring: done
- T4 zed tend stitch: done (capability + dry-run; --apply to real vault gated on X4 canonical-vault choice)
- T5 zed tend moc: todo
- T6 recency ranking + drop backlink boost: todo
- T7 title-normalization surfacing: todo
- T8 Codex Gate-3/5/6 wiring: todo
- T9 Codex trigger row + NON-GOAL note: todo
- T10 Codex circuit-breaker + telemetry: todo
- T11 zed tend distill (deterministic): todo
- T12 Obsidian integration: DONE. T12a (config resolver + ZED_VAULT_DIR). T12b (resolveWritePath per-project subfolders wired into MCP write/decide + tests; .obsidian config seeded into NELSON). Layout: ONE NELSON vault, per-project folders, one graph. REMAINING ACTIVATION (X4, with user): flip default ZED_VAULT_ROOT in settings.json + migrate existing notes + stitch --apply.
- X4 Canonicalize vault + migrate ~74 notes into NELSON: review (interactive, with user)
- T13 fix ${CLAUDE_PLUGIN_DATA} stray-vault bug: todo

## Log

(append `iterN | taskID | done|failed | orphanCount=NN edges/node=N.NN | summary` per iteration)

iter1 | T1 | done | orphanCount=42 (primitive, not yet applied to vault) edges/node=0.78 | autolink.injectRelatedSection + 8 tests; autolink suite 17→25 green, core 52 green
iter2 | T2 | done | orphanCount=42 (matcher; applies via T3/T4) edges/node=0.78 | SearchLayer.findRelatedByContent (FTS+tag) + _keyTerms + 4 tests; core 52→56 green, autolink 25 green. Driven live (cron did not self-fire overnight).
iter3 | T3 | done | orphanCount=42 (new-note connect; T4 stitch applies to existing) edges/node=0.78 | engine.connectNote + 2 tests; wired into zed_write_note + zed_decide (semantic Related fallback when literal autolink finds nothing). core 56→58 green, mcp syntax OK.
iter4 | T4 | done | orphanCount=42 (dry-run: ALL 42 would connect; not applied — gated on X4) edges/node=0.78 | core/tend.cjs stitchOrphans + zed tend stitch CLI (dry-run default, --apply, --limit) + 2 tests; fixed findRelatedByContent self-normalization bug (self-note was deflating match scores to ~0). core 58→60 green. NOTE: `zed` in PATH is the INSTALLED plugin, not this tree — run `node bin/zed` to exercise edits.
iter5 | T12a | done | orphanCount=42 (config feature; no vault change) edges/node=0.78 | core/config.cjs (resolveDataDir/VaultDir/DbPath/ProjectSlug) + ZED_VAULT_DIR override; bin/zed + mcp-server wired; +6 tests; verified override redirects vault (temp dir -> Empty), default preserved (76 notes). core 60→65 green. User chose ONE NELSON vault + per-project folders.
iter6 | T12b | done | orphanCount=42 (config feature) edges/node=0.78 | config.resolveWritePath (per-project subfolder prefixing, _global shared, no double-prefix) + projectModeOn; wired into MCP zed_write_note + zed_decide (notePath + selfPath); +3 tests; seeded NELSON/.obsidian config (graph/daily-notes/templates). core 65→68 green. Activation (flip default + migrate) deferred to X4.
