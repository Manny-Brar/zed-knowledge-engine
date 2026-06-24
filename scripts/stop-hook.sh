#!/bin/bash
# stop-hook.sh — Blocking Stop hook for ZED evolve mode
#
# When an evolve loop is active, enforces protocol compliance:
# - Gate 1: Knowledge capture required (if >5 edits with zero captures)
# - Gate 2: Handoff file required (if >3 edits)
# - Gate 3: Drift circuit breaker (score >= 7/10)
# - Gate 4: Loop continuation (if max_iterations not reached)
#
# Returns JSON: {"decision": "block", "reason": "..."} to prevent stop
# Returns nothing or exits cleanly to allow stop

set -euo pipefail
trap 'echo "ZED hook error: $BASH_COMMAND failed" >&2' ERR

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_ROOT="${SCRIPT_DIR}/.."
# Canonical paths via config.cjs (honors ZED_VAULT_ROOT). Inline fallback if the
# resolver file is ever absent; the resolver itself falls back on node errors.
. "${SCRIPT_DIR}/_zed-paths.sh" 2>/dev/null || { DATA_DIR="${CLAUDE_PLUGIN_DATA:-$HOME/.zed-data}"; VAULT_DIR="$DATA_DIR/vault"; DB_PATH="$DATA_DIR/knowledge.db"; LOOP_DIR="$DATA_DIR/loops/_default"; }
TRACKER="$DATA_DIR/edit-tracker.json"

# v8.1 + v8.3: Session grading — read MCP event log and report session
# quality before allowing stop (informational, never blocks). v8.3 adds
# a "G" dimension for goal alignment alongside the existing A/B/C/D scale,
# and emits an ambient suggestion when heavy work happened without a goal.
SESSION_GRADE=$(ZED_DATA="$DATA_DIR" node -e "
  try {
    const el = require('$PLUGIN_ROOT/core/event-log.cjs');
    const G = require('$PLUGIN_ROOT/core/goal-layer.cjs');
    const sid = el.getSessionId({ dataDir: '$DATA_DIR' });
    if (!sid) { process.exit(0); }
    const events = el.readEvents({ dataDir: '$DATA_DIR', sessionId: sid });
    if (events.length === 0) { process.exit(0); }
    const agg = el.aggregateToolUsage(events);
    const adh = el.aggregateProtocolAdherence(events);
    let grade = 'C';
    const searched = (agg.byTool.zed_search || 0) > 0;
    const captures = (agg.byTool.zed_write_note || 0) + (agg.byTool.zed_decide || 0);

    // Brain upgrade: connectivity-aware grading. An orphan capture must NOT
    // earn the top grade (the old rule rewarded ANY write, manufacturing
    // orphans). Best-effort: builds a throwaway in-memory graph and checks
    // whether this session's recent captures actually connected. On ANY
    // failure recentConnected stays null and we fall back to the old signal,
    // so the hook never breaks.
    let recentConnected = null;
    if (captures > 0) {
      try {
        const p = require('path');
        const fsx = require('fs');
        const KE = require('$PLUGIN_ROOT/core/engine.cjs');
        const eng = new KE({ vaultPath: '$VAULT_DIR' });
        eng.graph.buildGraph(eng.vaultPath, eng.ignoreOpts);
        const orphanSet = new Set(eng.graph.getOrphans().map((o) => p.resolve(o.path)));
        const acc = [];
        const walk = (dir) => {
          for (const ent of fsx.readdirSync(dir, { withFileTypes: true })) {
            if (ent.name.startsWith('.')) continue;
            const fp = p.join(dir, ent.name);
            if (ent.isDirectory()) walk(fp);
            else if (ent.name.endsWith('.md')) { try { acc.push([fp, fsx.statSync(fp).mtimeMs]); } catch (e) {} }
          }
        };
        walk('$VAULT_DIR');
        const recent = acc.sort((a, b) => b[1] - a[1]).slice(0, captures);
        recentConnected = recent.filter((r) => !orphanSet.has(p.resolve(r[0]))).length;
      } catch (e) { recentConnected = null; }
    }

    if (searched && captures > 0 && recentConnected !== 0) grade = 'A';
    else if (searched && captures > 0 && recentConnected === 0) grade = 'B';
    else if (searched || captures > 0) grade = 'B';
    else if (agg.totalCalls <= 3) grade = 'C';
    else grade = 'D';

    // v8.3: goal-alignment sub-grade (G dimension)
    const writeLike = new Set(['zed_write_note','zed_decide','zed_clip','zed_wiki_compile']);
    let wTotal = 0, wWithGoal = 0;
    for (const e of events) {
      if (!writeLike.has(e.tool)) continue;
      wTotal++;
      if (e.gid) wWithGoal++;
    }
    let goalGrade = null;
    if (wTotal > 0) {
      const align = wWithGoal / wTotal;
      if (align >= 0.9) goalGrade = 'A';
      else if (align >= 0.6) goalGrade = 'B';
      else if (align >= 0.3) goalGrade = 'C';
      else goalGrade = 'D';
    }

    const parts = ['Session grade: ' + grade];
    if (goalGrade) parts.push('Goal: ' + goalGrade + ' (' + Math.round((wWithGoal/wTotal)*100) + '% aligned)');
    parts.push(agg.totalCalls + ' tool calls');
    parts.push((agg.byTool.zed_search || 0) + ' searches');
    parts.push(captures + ' captures');
    if (adh.searchBeforeWriteRate !== null) {
      parts.push(adh.searchBeforeWriteRate + '% search-before-write');
    }
    console.log('ZED: ' + parts.join(', '));

    // v8.3: ambient suggestion — heavy work, no goal declared
    const { effective } = G.resolveEffectiveGoal({ dataDir: '$DATA_DIR' });
    const heavyEdits = (agg.byTool.Edit || 0) + (agg.byTool.Write || 0) + (agg.byTool.MultiEdit || 0);
    if (!effective && (heavyEdits >= 5 || wTotal >= 3)) {
      console.log('ZED Goal: ' + (heavyEdits + wTotal) + ' write actions this session with no declared goal. Consider: zed goal-pin \"title\" --criteria \"...\" (project) or zed goal-set \"title\" (session).');
    }
  } catch(e) {}
" 2>/dev/null || true)
if [ -n "$SESSION_GRADE" ]; then
  echo "$SESSION_GRADE"
fi

# If no active evolve loop, allow stop
OBJECTIVE="$LOOP_DIR/objective.md"
if [ ! -f "$OBJECTIVE" ]; then
  # Run session-end cleanup before allowing stop
  "$PLUGIN_ROOT/scripts/session-end.sh" 2>/dev/null || true
  exit 0
fi

# Check if loop is already completed
if grep -q "completed: true" "$OBJECTIVE" 2>/dev/null; then
  # Run session-end cleanup before allowing stop
  "$PLUGIN_ROOT/scripts/session-end.sh" 2>/dev/null || true
  exit 0
fi

# Read tracker state
EDIT_COUNT=0
CAPTURES=0
FILE_COUNT=0
if [ -f "$TRACKER" ]; then
  EDIT_COUNT=$(ZED_TRACKER="$TRACKER" node -e "try{const t=JSON.parse(require('fs').readFileSync(process.env.ZED_TRACKER,'utf8'));console.log(t.edit_count||0)}catch(e){console.log(0)}")
  CAPTURES=$(ZED_TRACKER="$TRACKER" node -e "try{const t=JSON.parse(require('fs').readFileSync(process.env.ZED_TRACKER,'utf8'));console.log(t.captures||0)}catch(e){console.log(0)}")
  FILE_COUNT=$(ZED_TRACKER="$TRACKER" node -e "try{const t=JSON.parse(require('fs').readFileSync(process.env.ZED_TRACKER,'utf8'));console.log((t.files||[]).length)}catch(e){console.log(0)}")
fi

# Read current iteration from progress
ITERATION=0
PROGRESS="$LOOP_DIR/progress.md"
if [ -f "$PROGRESS" ]; then
  ITERATION=$(ZED_PROGRESS="$PROGRESS" node -e "try{const c=require('fs').readFileSync(process.env.ZED_PROGRESS,'utf8');const m=c.match(/^iteration:\\s*(\\d+)/m);console.log(m?m[1]:0)}catch(e){console.log(0)}")
fi

# Read max iterations from objective
MAX_ITERATIONS=0
if [ -f "$OBJECTIVE" ]; then
  MAX_ITERATIONS=$(ZED_OBJECTIVE="$OBJECTIVE" node -e "try{const c=require('fs').readFileSync(process.env.ZED_OBJECTIVE,'utf8');const m=c.match(/^max_iterations:\\s*(\\d+)/m);console.log(m?m[1]:0)}catch(e){console.log(0)}")
fi

# Calculate drift score (0-10)
DRIFT=0
if [ "$EDIT_COUNT" -gt 30 ]; then DRIFT=$((DRIFT + 2))
elif [ "$EDIT_COUNT" -gt 20 ]; then DRIFT=$((DRIFT + 1)); fi
if [ "$FILE_COUNT" -gt 8 ]; then DRIFT=$((DRIFT + 2))
elif [ "$FILE_COUNT" -gt 5 ]; then DRIFT=$((DRIFT + 1)); fi
if [ "$ITERATION" -gt 10 ]; then DRIFT=$((DRIFT + 2))
elif [ "$ITERATION" -gt 5 ]; then DRIFT=$((DRIFT + 1)); fi

# Build blocking reasons
REASONS=""

# Gate 1: If significant work done but zero captures, block
if [ "$EDIT_COUNT" -gt 5 ] && [ "$CAPTURES" -eq 0 ]; then
  REASONS="${REASONS}CAPTURE REQUIRED: You made $EDIT_COUNT edits but captured zero knowledge. Before stopping, save at least one decision ('zed template decision <title>' via Bash) or pattern ('zed template pattern <title>' via Bash) to the vault. "
fi

# Gate 2: Check if handoff was written this iteration
HANDOFF="$LOOP_DIR/handoff.md"
if [ "$EDIT_COUNT" -gt 3 ] && [ ! -f "$HANDOFF" ]; then
  REASONS="${REASONS}HANDOFF REQUIRED: Write a structured handoff to $LOOP_DIR/handoff.md with: (1) what was accomplished with file:line refs, (2) current state (tests/build), (3) immediate next action, (4) what was captured to vault. "
fi

# Gate 3: Drift circuit breaker
if [ "$DRIFT" -ge 7 ]; then
  REASONS="${REASONS}DRIFT DETECTED (score $DRIFT/10): You are drifting. Re-read the objective at $OBJECTIVE. Confirm your current work directly serves it. If not, course-correct before continuing. "
fi

# Check cron mode state
CRON_STATE="$LOOP_DIR/cron-state.json"
CRON_ACTIVE="false"
if [ -f "$CRON_STATE" ]; then
  CRON_ACTIVE=$(ZED_CRON="$CRON_STATE" node -e "try{const s=JSON.parse(require('fs').readFileSync(process.env.ZED_CRON,'utf8'));console.log(s.active?'true':'false')}catch(e){console.log('false')}")
fi

# Read scope boundary for enforcement
SCOPE_BOUNDARY="$LOOP_DIR/scope-boundary.md"
SCOPE_VIOLATION=""
if [ -f "$SCOPE_BOUNDARY" ] && [ -f "$TRACKER" ]; then
  # Check if any edited files are outside scope boundary
  SCOPE_VIOLATION=$(ZED_TRACKER="$TRACKER" ZED_SCOPE="$SCOPE_BOUNDARY" node -e "
    try {
      const t = JSON.parse(require('fs').readFileSync(process.env.ZED_TRACKER, 'utf8'));
      const scope = require('fs').readFileSync(process.env.ZED_SCOPE, 'utf8');
      const files = t.files || [];
      const outOfScope = files.filter(f => !scope.includes(f));
      if (outOfScope.length > 0) {
        console.log('OUT_OF_SCOPE: ' + outOfScope.join(', '));
      }
    } catch(e) {}
  ")
fi

# Gate 4a: Scope violation check
if [ -n "$SCOPE_VIOLATION" ]; then
  REASONS="${REASONS}SCOPE VIOLATION: Files edited outside scope-boundary.md: $SCOPE_VIOLATION. Re-read the objective and scope boundary. Revert out-of-scope changes or justify adding these files to scope-boundary.md. "
  DRIFT=$((DRIFT + 3))
fi

# Gate 4: If max iterations not reached OR cron mode active, inject next iteration prompt
SHOULD_CONTINUE="false"
if [ "$MAX_ITERATIONS" -gt 0 ] && [ "$ITERATION" -lt "$MAX_ITERATIONS" ]; then
  SHOULD_CONTINUE="true"
elif [ "$MAX_ITERATIONS" -eq 0 ]; then
  # Unlimited iterations — always continue unless objective completed
  SHOULD_CONTINUE="true"
fi

if [ "$SHOULD_CONTINUE" = "true" ]; then
  if [ -z "$REASONS" ]; then
    # No blocking reasons, but loop isn't done — inject next iteration
    # Read objective for re-anchoring
    OBJ_TITLE=$(ZED_OBJECTIVE="$OBJECTIVE" node -e "try{const c=require('fs').readFileSync(process.env.ZED_OBJECTIVE,'utf8');const m=c.match(/^title:\\s*[\"']?(.+?)[\"']?$/m);console.log(m?m[1]:'(unknown)')}catch(e){console.log('(unknown)')}")

    if [ "$CRON_ACTIVE" = "true" ]; then
      REASONS="EVOLVE CRON LOOP ACTIVE (iteration $ITERATION). Continue working toward: $OBJ_TITLE. CRON MODE: After completing this iteration, sleep 180 seconds, then start next iteration. Steps: (1) Re-read objective at $OBJECTIVE, (2) Re-read scope boundary at $SCOPE_BOUNDARY, (3) Use 5-Level ULTRATHINK to select highest-impact next task within scope, (4) Verify task passes scope-lock sentence: 'This action achieves [objective] by [mechanism]', (5) Execute one unit of work (IMPLEMENT/FIX/TEST/HARDEN/OPTIMIZE/DOCUMENT only), (6) Run tests, (7) Capture knowledge, (8) Write handoff, (9) Run 'zed loop-tick' to advance iteration, (10) Run evolve-cron.sh tick, (11) Sleep 180 seconds, (12) Check cron-state.json — if still active, begin next iteration. "
    else
      REASONS="EVOLVE LOOP ACTIVE (iteration $ITERATION$([ "$MAX_ITERATIONS" -gt 0 ] && echo "/$MAX_ITERATIONS")). Continue working toward: $OBJ_TITLE. Steps: (1) Re-read objective at $OBJECTIVE, (2) Re-read scope boundary at $SCOPE_BOUNDARY, (3) Use 5-Level ULTRATHINK to select highest-impact next task within scope, (4) Verify task passes scope-lock sentence: 'This action achieves [objective] by [mechanism]', (5) Execute one unit of work (IMPLEMENT/FIX/TEST/HARDEN/OPTIMIZE/DOCUMENT only), (6) Run tests, (7) Capture knowledge, (8) Write handoff, (9) Run 'zed loop-tick' to advance iteration. "
    fi
  fi
fi

# If we have blocking reasons, block
if [ -n "$REASONS" ]; then
  # Use node for safe JSON construction (handles special characters)
  ZED_REASONS="$REASONS" node -e "console.log(JSON.stringify({decision:'block',reason:process.env.ZED_REASONS}))"
  exit 0
fi

# All gates passed — allow stop
# Run session-end cleanup before allowing stop
"$PLUGIN_ROOT/scripts/session-end.sh" 2>/dev/null || true
exit 0
