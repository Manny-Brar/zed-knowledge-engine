# Brain Upgrade — Frozen Baseline (2026-06-23)

This is the falsifiable BEFORE snapshot for the ZED performance + system-brain upgrade.
Every later phase is measured against these raw, formula-independent numbers. Any feature
whose telemetry does not move the frozen orphan/edge metric within its window gets cut.

See: `projects/zed-performance-and-brain-upgrade-strategic-plan.md` (vault) and the ADR
`decisions/2026-06-24-brain-first-zed-upgrade-...md`.

## Vault state (raw, frozen)

| Metric | Baseline |
|---|---|
| Notes (nodeCount) | 74 |
| Connections (edgeCount) | 58 |
| Orphans (orphanCount) | 42 |
| Orphan ratio | 0.57 (57%) |
| Edges/node | 0.78 |
| Clusters | 47 (largest: 17) |
| Hub notes (3+ links) | 9 |
| Health grade (graph) | D (56/100) |
| Effectiveness score | C (62/100) |
| Stale notes (>30d) | 16 |

Raw counters are now persisted on every `zed metrics` run in `metrics-history.jsonl`
(fields: nodeCount, edgeCount, orphanCount, clusterCount) so deltas stay comparable
even if the grade formula changes later.

## Test baseline (green before changes)

- core suite: 52 passed / 0 failed
- metrics: 18 passed
- autolink: 17 passed
- wiki: 26 passed
- MCP stdio test (`server/test-mcp.cjs`): cannot run in this sandbox — `Timeout: initialize`
  reproduces against clean HEAD, i.e. it is an environmental harness limitation, not a regression.

## Targets

- Reliable D → C on the graph health grade; plausibly D → B.
- orphanCount materially down from 42 (orphan ratio well below 0.57).
- Prompt thrust governed on its OWN axis (tokens/session + % captures landing with ≥1 link),
  NOT orphanRatio.

## Phase 0 + Phase 1 quick-win changes landed in this session

- Extracted canonical `computeHealthScore` to `core/metrics.cjs`; `bin/zed` now imports it
  (single source of truth; behavior-preserving — `zed health` unchanged).
- Froze raw counters in `appendHistory` (`core/metrics.cjs`).
- `zed_decide` now auto-injects `[[wikilinks]]` before writing (parity with `zed_write_note`)
  in `server/mcp-server.mjs` — decisions are no longer born orphaned.
- (in progress) stop-hook grade no longer rewards orphan captures; prompt subtraction.
