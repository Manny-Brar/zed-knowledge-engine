/**
 * event-log.cjs — ZED v8.1 MCP Tool Invocation Telemetry
 *
 * Append-only JSON-lines log of every MCP tool call. Used by metrics.cjs
 * to compute search hit rates, protocol adherence, tool usage patterns,
 * and session productivity.
 *
 * Privacy: NEVER logs argument values (URLs, note content, queries).
 * Only structural metadata: tool name, timestamp, result count, duration,
 * session ID.
 *
 * Storage: <data-dir>/mcp-events.jsonl
 * Auto-prune: keeps last 30 days on each prune() call.
 *
 * Public API:
 *   logEvent(event, opts)     — append one event
 *   readEvents(opts)          — read all events (optionally filtered)
 *   pruneEvents(opts)         — remove events older than N days
 *   getSessionId(opts)        — derive session ID from edit-tracker
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

function getDataDir() {
  return (
    process.env.CLAUDE_PLUGIN_DATA ||
    process.env.ZED_DATA_DIR ||
    path.join(os.homedir(), '.zed-data')
  );
}

function getLogPath(opts) {
  const dataDir = (opts && opts.dataDir) || getDataDir();
  return path.join(dataDir, 'mcp-events.jsonl');
}

// ---------------------------------------------------------------------------
// Session ID — derived from edit-tracker's `started` timestamp
// ---------------------------------------------------------------------------

function getSessionId(opts) {
  const dataDir = (opts && opts.dataDir) || getDataDir();
  const trackerPath = path.join(dataDir, 'edit-tracker.json');
  try {
    const tracker = JSON.parse(fs.readFileSync(trackerPath, 'utf-8'));
    return tracker.started || null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// logEvent — append one event line
// ---------------------------------------------------------------------------

/**
 * Append a single event to the log. Non-blocking best-effort — never
 * throws, never blocks the MCP tool handler.
 *
 * @param {Object} event
 * @param {string} event.tool       — MCP tool name (e.g. 'zed_search')
 * @param {number} [event.resultCount] — number of results returned (0 for writes)
 * @param {number} [event.durationMs]  — wall time of the tool call
 * @param {boolean} [event.isError]    — true if the tool returned an error
 * @param {string} [event.note]        — brief structural note (e.g. 'clip:defuddle')
 * @param {Object} [opts]
 * @param {string} [opts.dataDir]
 */
function logEvent(event, opts) {
  try {
    const logPath = getLogPath(opts);
    const dir = path.dirname(logPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const entry = {
      ts: new Date().toISOString(),
      sid: getSessionId(opts),
      tool: event.tool || 'unknown',
      resultCount: event.resultCount !== undefined ? event.resultCount : null,
      durationMs: event.durationMs !== undefined ? event.durationMs : null,
      isError: event.isError || false,
      note: event.note || null,
    };

    // Atomic-ish append: open in append mode, write one line, close.
    // Not perfectly thread-safe but acceptable for our use case (one
    // MCP server process, sequential tool calls).
    fs.appendFileSync(logPath, JSON.stringify(entry) + '\n', 'utf-8');
  } catch (e) {
    // Best-effort — never fail the tool call because of logging
  }
}

// ---------------------------------------------------------------------------
// readEvents — read events from the log
// ---------------------------------------------------------------------------

/**
 * Read all events, optionally filtered by time window or session.
 *
 * @param {Object} [opts]
 * @param {string} [opts.dataDir]
 * @param {number} [opts.sinceDays]    — only events from last N days
 * @param {string} [opts.sessionId]    — filter to a specific session
 * @returns {Array.<Object>}
 */
function readEvents(opts) {
  const logPath = getLogPath(opts);
  if (!fs.existsSync(logPath)) return [];

  const now = Date.now();
  const sinceDays = (opts && opts.sinceDays) || null;
  const sinceMs = sinceDays ? now - sinceDays * 24 * 3600 * 1000 : null;
  const sessionId = (opts && opts.sessionId) || null;

  const events = [];
  const lines = fs.readFileSync(logPath, 'utf-8').split('\n');
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line);
      if (sinceMs) {
        const ts = Date.parse(entry.ts);
        if (Number.isFinite(ts) && ts < sinceMs) continue;
      }
      if (sessionId && entry.sid !== sessionId) continue;
      events.push(entry);
    } catch {
      // Skip malformed lines
    }
  }
  return events;
}

// ---------------------------------------------------------------------------
// pruneEvents — remove old events
// ---------------------------------------------------------------------------

/**
 * Remove events older than maxAgeDays. Rewrites the file in place.
 *
 * @param {Object} [opts]
 * @param {string} [opts.dataDir]
 * @param {number} [opts.maxAgeDays=30]
 * @returns {{ kept: number, pruned: number }}
 */
function pruneEvents(opts) {
  const logPath = getLogPath(opts);
  if (!fs.existsSync(logPath)) return { kept: 0, pruned: 0 };

  const maxAgeDays = (opts && opts.maxAgeDays) || 30;
  const cutoff = Date.now() - maxAgeDays * 24 * 3600 * 1000;

  const lines = fs.readFileSync(logPath, 'utf-8').split('\n').filter((l) => l.trim());
  const kept = [];
  let pruned = 0;

  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      const ts = Date.parse(entry.ts);
      if (Number.isFinite(ts) && ts < cutoff) {
        pruned++;
      } else {
        kept.push(line);
      }
    } catch {
      // Drop malformed lines
      pruned++;
    }
  }

  // Atomic rewrite
  const tmpPath = logPath + '.tmp.' + process.pid;
  fs.writeFileSync(tmpPath, kept.join('\n') + (kept.length ? '\n' : ''), 'utf-8');
  fs.renameSync(tmpPath, logPath);

  return { kept: kept.length, pruned };
}

// ---------------------------------------------------------------------------
// Aggregation helpers (used by metrics.cjs)
// ---------------------------------------------------------------------------

/**
 * Aggregate events into tool usage stats.
 */
function aggregateToolUsage(events) {
  const byTool = {};
  let totalDuration = 0;
  let totalCalls = 0;
  const sessions = new Set();

  for (const e of events) {
    byTool[e.tool] = (byTool[e.tool] || 0) + 1;
    totalCalls++;
    if (e.durationMs) totalDuration += e.durationMs;
    if (e.sid) sessions.add(e.sid);
  }

  return {
    byTool,
    totalCalls,
    sessionCount: sessions.size,
    avgPerSession: sessions.size > 0 ? Math.round((totalCalls / sessions.size) * 10) / 10 : 0,
    avgDurationMs: totalCalls > 0 ? Math.round(totalDuration / totalCalls) : 0,
  };
}

/**
 * Compute protocol adherence: did searches happen before writes?
 */
function aggregateProtocolAdherence(events) {
  // Group events by session
  const sessions = new Map(); // sid → [{tool, ts}]
  for (const e of events) {
    const sid = e.sid || '__none__';
    if (!sessions.has(sid)) sessions.set(sid, []);
    sessions.get(sid).push({ tool: e.tool, ts: e.ts, resultCount: e.resultCount });
  }

  let writesTotal = 0;
  let writesWithPriorSearch = 0;
  let searchesTotal = 0;
  let searchHits = 0;

  for (const [sid, sessionEvents] of sessions) {
    let hasSearched = false;
    for (const ev of sessionEvents) {
      if (ev.tool === 'zed_search') {
        hasSearched = true;
        searchesTotal++;
        if (ev.resultCount !== null && ev.resultCount > 0) searchHits++;
      }
      if (ev.tool === 'zed_write_note' || ev.tool === 'zed_decide') {
        writesTotal++;
        if (hasSearched) writesWithPriorSearch++;
      }
    }
  }

  const searchBeforeWriteRate = writesTotal > 0
    ? Math.round((writesWithPriorSearch / writesTotal) * 100)
    : null;
  const searchHitRate = searchesTotal > 0
    ? Math.round((searchHits / searchesTotal) * 100)
    : null;

  return {
    searchBeforeWriteRate,
    searchHitRate,
    searchesTotal,
    searchHits,
    writesTotal,
    writesWithPriorSearch,
    sessionCount: sessions.size,
  };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  logEvent,
  readEvents,
  pruneEvents,
  getSessionId,
  getLogPath,
  aggregateToolUsage,
  aggregateProtocolAdherence,
};
