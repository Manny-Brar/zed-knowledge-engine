#!/bin/bash
# evolve-cron.sh — Manages cron loop state for ZED evolve mode
#
# Usage:
#   evolve-cron.sh start "objective"   — Activate cron mode
#   evolve-cron.sh stop                — Deactivate cron mode
#   evolve-cron.sh status              — Check cron state
#   evolve-cron.sh check               — Exit 0 if active, 1 if not
#
# State is stored in ~/.zed-data/vault/_loop/cron-state.json

set -euo pipefail
trap 'echo "ZED cron hook error: $BASH_COMMAND failed" >&2' ERR

DATA_DIR="${CLAUDE_PLUGIN_DATA:-$HOME/.zed-data}"
VAULT_DIR="$DATA_DIR/vault"
LOOP_DIR="$VAULT_DIR/_loop"
CRON_STATE="$LOOP_DIR/cron-state.json"

mkdir -p "$LOOP_DIR"

ACTION="${1:-status}"
shift || true

case "$ACTION" in
  start)
    OBJECTIVE="${1:-}"
    if [ -z "$OBJECTIVE" ]; then
      echo "Error: objective required for cron start" >&2
      exit 1
    fi

    # Write cron state
    node -e "
      const state = {
        active: true,
        objective: process.argv[1],
        interval_seconds: 180,
        started_at: new Date().toISOString(),
        last_iteration_at: null,
        iterations_completed: 0,
        stop_requested: false
      };
      require('fs').writeFileSync(
        process.env.CRON_STATE,
        JSON.stringify(state, null, 2)
      );
      console.log(JSON.stringify({ status: 'activated', interval: '3 minutes', objective: state.objective }));
    " "$OBJECTIVE"
    ;;

  stop)
    if [ -f "$CRON_STATE" ]; then
      node -e "
        const fs = require('fs');
        try {
          const state = JSON.parse(fs.readFileSync(process.env.CRON_STATE, 'utf8'));
          state.active = false;
          state.stop_requested = true;
          state.stopped_at = new Date().toISOString();
          fs.writeFileSync(process.env.CRON_STATE, JSON.stringify(state, null, 2));
          console.log(JSON.stringify({
            status: 'deactivated',
            iterations_completed: state.iterations_completed,
            ran_for: state.started_at + ' to ' + state.stopped_at
          }));
        } catch(e) {
          console.log(JSON.stringify({ status: 'already_inactive' }));
        }
      "
    else
      echo '{"status": "no_cron_state"}'
    fi
    ;;

  status)
    if [ -f "$CRON_STATE" ]; then
      cat "$CRON_STATE"
    else
      echo '{"active": false, "reason": "no cron state file"}'
    fi
    ;;

  check)
    if [ -f "$CRON_STATE" ]; then
      ACTIVE=$(node -e "
        try {
          const s = JSON.parse(require('fs').readFileSync(process.env.CRON_STATE, 'utf8'));
          console.log(s.active ? 'true' : 'false');
        } catch(e) { console.log('false'); }
      ")
      if [ "$ACTIVE" = "true" ]; then
        exit 0
      else
        exit 1
      fi
    else
      exit 1
    fi
    ;;

  tick)
    # Called after each iteration to update cron state
    if [ -f "$CRON_STATE" ]; then
      node -e "
        const fs = require('fs');
        try {
          const state = JSON.parse(fs.readFileSync(process.env.CRON_STATE, 'utf8'));
          state.last_iteration_at = new Date().toISOString();
          state.iterations_completed = (state.iterations_completed || 0) + 1;
          fs.writeFileSync(process.env.CRON_STATE, JSON.stringify(state, null, 2));
          console.log(JSON.stringify({
            status: 'ticked',
            iteration: state.iterations_completed,
            next_run_in: state.interval_seconds + ' seconds'
          }));
        } catch(e) {
          console.error('Tick failed: ' + e.message);
          process.exit(1);
        }
      "
    fi
    ;;

  *)
    echo "Usage: evolve-cron.sh {start|stop|status|check|tick} [objective]" >&2
    exit 1
    ;;
esac
