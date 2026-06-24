#!/bin/bash
# session-start.sh — Run on SessionStart hook
#
# Rebuilds the knowledge graph, outputs vault stats, and reminds of ZED-First Principle.

set -euo pipefail
trap 'echo "ZED hook error: $BASH_COMMAND failed" >&2' ERR

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_ROOT="${SCRIPT_DIR}/.."
# Canonical paths via config.cjs (honors ZED_VAULT_ROOT). Inline fallback if the
# resolver file is ever absent; the resolver itself falls back on node errors.
. "${SCRIPT_DIR}/_zed-paths.sh" 2>/dev/null || { DATA_DIR="${CLAUDE_PLUGIN_DATA:-$HOME/.zed-data}"; VAULT_DIR="$DATA_DIR/vault"; DB_PATH="$DATA_DIR/knowledge.db"; }

# Skip if vault doesn't exist yet
if [ ! -d "$VAULT_DIR" ]; then
  exit 0
fi

export ZED_DATA_DIR="$DATA_DIR"

# Output vault stats so Claude sees them at session start. `overview` builds +
# persists the graph/index in-process, so a separate `rebuild` spawn here is
# redundant — dropping it removes one full vault walk + node cold-start per session.
echo "=== ZED Session Start ==="
node "$PLUGIN_ROOT/bin/zed" overview 2>/dev/null || echo "Vault: present (stats unavailable)"

# Check if vault is nearly empty — trigger onboarding
NOTE_COUNT=$(find "$VAULT_DIR" -name "*.md" -not -path "*/_loop/*" 2>/dev/null | wc -l | tr -d ' ')
if [ "$NOTE_COUNT" -lt 3 ]; then
  echo ""
  echo "=== ZED: New vault detected ==="
  echo "Your knowledge vault is empty. ZED will auto-scan your project on the first task."
  echo "Or run: zed scan . (to scan now)"
  echo "==============================="
fi

# Load soul document (first 30 lines)
SOUL="$PLUGIN_ROOT/memory/ZED_SOUL.md"
if [ -f "$SOUL" ]; then
  echo ""
  head -32 "$SOUL" 2>/dev/null || echo "ZED: Soul document exists but could not be read."
fi

# ZED-First Principle reminder
echo ""
echo "ZED-First Principle: Before executing any task, check if the vault has relevant context. Before finishing any task, evaluate if something should be captured."

# Cross-session continuity: surface yesterday's "Next Session" items
YESTERDAY=$(date -v-1d +%Y-%m-%d 2>/dev/null || date -d "yesterday" +%Y-%m-%d 2>/dev/null)
YESTERDAY_NOTE="$VAULT_DIR/sessions/$YESTERDAY.md"
if [ -f "$YESTERDAY_NOTE" ]; then
  # Extract content after "## Next Session" header
  NEXT_SESSION=$(sed -n '/^## Next Session/,/^## /{ /^## Next Session/d; /^## /d; p; }' "$YESTERDAY_NOTE" | head -10)
  if [ -n "$NEXT_SESSION" ] && [ "$(echo "$NEXT_SESSION" | tr -d '[:space:]')" != "" ]; then
    echo ""
    echo "=== From yesterday's session ==="
    echo "$NEXT_SESSION"
    echo "================================"
  fi
fi

# Check for active evolve loops
LOOP_OBJ="$VAULT_DIR/_loop/objective.md"
if [ -f "$LOOP_OBJ" ]; then
  if ! grep -q "completed: true" "$LOOP_OBJ" 2>/dev/null; then
    echo ""
    echo "ZED: Evolve loop active — run '/evolve --status' or '/evolve --resume' to continue."
  fi
fi

# v8.3: Goal stack injection (Standard 11 — Goal Awareness)
# Reads CLAUDE.md (project) + active-goal.json (session) and renders a stack
# block so Claude sees the effective goal on every session start.
GOAL_STACK=$(node "$PLUGIN_ROOT/bin/zed" goal-get 2>/dev/null || true)
if [ -n "$GOAL_STACK" ] && [ "$GOAL_STACK" != "No goal set. Run: zed goal-pin \"title\" --criteria \"...\" (project) or zed goal-set \"title\" (session)." ]; then
  echo ""
  echo "$GOAL_STACK"
  # If clarity is not "clear", nudge once.
  CLARITY=$(node "$PLUGIN_ROOT/bin/zed" goal-clarity --json 2>/dev/null || echo '{}')
  CLARITY_VAL=$(node -e "try{const j=JSON.parse(process.argv[1]||'{}');console.log(j.clarity||'')}catch(e){console.log('')}" "$CLARITY")
  if [ -n "$CLARITY_VAL" ] && [ "$CLARITY_VAL" != "clear" ]; then
    echo "ZED Goal: clarity=$CLARITY_VAL. The goal-awareness skill will interrogate before non-trivial work."
  fi
else
  # No goal at all — flag it so goal-awareness skill triggers Branch B on /zed
  echo ""
  echo "ZED Goal: no goal declared. /zed activation will prompt for one."
fi

# v8.0: surface the schema.md contract (first 30 lines) if present. This is
# Karpathy's "schema doc" — the agent-facing description of how the vault is
# organised. Showing it at session start grounds Claude in the conventions.
SCHEMA="$VAULT_DIR/schema.md"
if [ -f "$SCHEMA" ]; then
  echo ""
  echo "=== ZED Vault Schema (first 30 lines) ==="
  head -30 "$SCHEMA" 2>/dev/null
  echo "========================================="
fi

# v8.0: surface uncompiled raw/ sources (Karpathy compile pass)
RAW_DIR="$VAULT_DIR/raw"
WIKI_DIR="$VAULT_DIR/wiki"
if [ -d "$RAW_DIR" ]; then
  RAW_COUNT=$(find "$RAW_DIR" -name "*.md" 2>/dev/null | wc -l | tr -d ' ')
  if [ "$RAW_COUNT" -gt 0 ]; then
    WIKI_COUNT=0
    if [ -d "$WIKI_DIR" ]; then
      WIKI_COUNT=$(find "$WIKI_DIR" -name "*.md" -not -name "index.md" -not -name "log.md" 2>/dev/null | wc -l | tr -d ' ')
    fi
    # Use zed compile --json to get the uncompiled count accurately
    UNCOMPILED=$(node "$PLUGIN_ROOT/bin/zed" compile --json 2>/dev/null | node -e "
      let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{
        try{const j=JSON.parse(d);console.log((j.plan&&j.plan.uncompiled||[]).length)}catch(e){console.log(0)}
      });
    " 2>/dev/null || echo 0)
    if [ "$UNCOMPILED" -gt 0 ]; then
      echo ""
      echo "=== ZED v8.0: Uncompiled raw sources ==="
      echo "  $UNCOMPILED raw source(s) in \`raw/\` not yet in \`wiki/\`."
      echo "  Run \`zed compile\` to see the plan, or read the wiki-compiler skill."
      echo "========================================="
    fi
  fi
fi

# Reset edit tracker for new session
TRACKER="$DATA_DIR/edit-tracker.json"
echo '{"edit_count":0,"files":[],"started":"'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'","captures":0}' > "$TRACKER"

# v8.1: Reset the search-reminded flag so the pre-tool hook can fire once
rm -f "$DATA_DIR/.search-reminded"

# v8.3: Reset goal-surfaced flags so the scope-hard-lock reminder fires once per goal per session
rm -f "$DATA_DIR"/.goal-surfaced-* 2>/dev/null || true

echo "========================="
