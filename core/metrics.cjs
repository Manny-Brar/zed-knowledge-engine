/**
 * metrics.cjs — ZED v8.1 Effectiveness Dashboard
 *
 * Answers the question: "Is ZED actually helping?"
 *
 * Unlike analytics (what's in the vault) and health (is the vault well-formed),
 * metrics measures *effectiveness*: is knowledge compounding? Is search useful?
 * Is the protocol being followed? Are sessions producing durable artifacts?
 *
 * All metrics are computed from the vault + log files + edit-tracker — no
 * external telemetry, no network calls, no LLM involvement. Everything is
 * deterministic and reproducible.
 *
 * Public API:
 *   computeMetrics(opts)   — full dashboard, returns structured object
 *   computeGrowth(opts)    — vault growth rate + trajectory
 *   computeConnectivity(opts) — graph health (edges/node, orphan %, clusters)
 *   computeCompileRate(opts) — raw→wiki conversion rate
 *   computeSearchUtility(opts) — log-based search hit analysis
 *   computeCaptureRatio(opts) — sessions vs captures
 *   computeEvolveEfficiency(opts) — loop convergence metrics
 *   computeKnowledgeAge(opts) — how fresh is the knowledge?
 */

'use strict';

const fs = require('fs');
const path = require('path');
const fileLayer = require('./file-layer.cjs');

// ---------------------------------------------------------------------------
// Growth — is knowledge accumulating?
// ---------------------------------------------------------------------------

/**
 * Compute vault growth rate by scanning file creation dates.
 *
 * @param {Object} opts
 * @param {string} opts.vaultPath
 * @param {number} [opts.windowDays=30]
 * @returns {{
 *   total: number,
 *   inWindow: number,
 *   perWeek: number,
 *   byType: Object.<string, number>,
 *   byWeek: Array.<{week: string, count: number}>,
 *   trajectory: 'growing'|'stable'|'stagnant'|'empty'
 * }}
 */
function computeGrowth(opts) {
  const { vaultPath, windowDays = 30 } = opts;
  const notes = fileLayer.listNotes(vaultPath);
  const now = Date.now();
  const windowMs = windowDays * 24 * 3600 * 1000;
  const cutoff = now - windowMs;

  let inWindow = 0;
  const byType = {};
  const byWeekMap = {};

  for (const notePath of notes) {
    try {
      const stat = fs.statSync(notePath);
      const note = fileLayer.readNote(notePath);
      const type = (note.frontmatter && note.frontmatter.type) || 'note';
      byType[type] = (byType[type] || 0) + 1;

      // Use the earlier of ctime (creation) and mtime
      const created = Math.min(stat.ctimeMs, stat.mtimeMs);
      if (created >= cutoff) {
        inWindow++;
        const weekKey = new Date(created).toISOString().slice(0, 10);
        // Group by ISO week start (Monday)
        const d = new Date(created);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        d.setDate(diff);
        const wk = d.toISOString().slice(0, 10);
        byWeekMap[wk] = (byWeekMap[wk] || 0) + 1;
      }
    } catch (e) { /* skip unreadable */ }
  }

  const weeks = windowDays / 7;
  const perWeek = weeks > 0 ? Math.round((inWindow / weeks) * 10) / 10 : 0;

  const byWeek = Object.entries(byWeekMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, count]) => ({ week, count }));

  // Trajectory: compare first half vs second half of the window
  let trajectory = 'empty';
  if (notes.length > 0) {
    const midpoint = now - windowMs / 2;
    let firstHalf = 0;
    let secondHalf = 0;
    for (const notePath of notes) {
      try {
        const stat = fs.statSync(notePath);
        const created = Math.min(stat.ctimeMs, stat.mtimeMs);
        if (created >= cutoff && created < midpoint) firstHalf++;
        else if (created >= midpoint) secondHalf++;
      } catch (e) { /* skip */ }
    }
    if (secondHalf > firstHalf * 1.3) trajectory = 'growing';
    else if (firstHalf > secondHalf * 1.3) trajectory = 'stagnant';
    else trajectory = 'stable';
  }

  return {
    total: notes.length,
    inWindow,
    windowDays,
    perWeek,
    byType,
    byWeek,
    trajectory,
  };
}

// ---------------------------------------------------------------------------
// Connectivity — is knowledge linked, not siloed?
// ---------------------------------------------------------------------------

/**
 * @param {Object} opts
 * @param {Object} opts.engine — a KnowledgeEngine instance (already built)
 * @returns {{
 *   edgesPerNode: number,
 *   orphanRatio: number,
 *   orphanCount: number,
 *   clusterCount: number,
 *   largestCluster: number,
 *   hubCount: number,
 *   verdict: 'well-connected'|'moderately-connected'|'fragmented'|'isolated'
 * }}
 */
function computeConnectivity(opts) {
  const { engine } = opts;
  const stats = engine.getStats();
  const clusters = engine.getClusters();
  const hubs = engine.findHubs(100);

  const edgesPerNode = stats.nodeCount > 0
    ? Math.round((stats.edgeCount / stats.nodeCount) * 100) / 100
    : 0;
  const orphanRatio = stats.nodeCount > 0
    ? Math.round((stats.orphanCount / stats.nodeCount) * 100) / 100
    : 0;
  const largestCluster = clusters.length > 0
    ? Math.max(...clusters.map((c) => c.length))
    : 0;
  const hubCount = hubs.filter((h) => h.backlink_count >= 3).length;

  let verdict = 'isolated';
  if (edgesPerNode >= 2 && orphanRatio < 0.1) verdict = 'well-connected';
  else if (edgesPerNode >= 1 && orphanRatio < 0.25) verdict = 'moderately-connected';
  else if (stats.nodeCount > 0 && edgesPerNode > 0) verdict = 'fragmented';

  return {
    nodeCount: stats.nodeCount,
    edgeCount: stats.edgeCount,
    edgesPerNode,
    orphanRatio,
    orphanCount: stats.orphanCount,
    clusterCount: clusters.length,
    largestCluster,
    hubCount,
    verdict,
  };
}

// ---------------------------------------------------------------------------
// Compile rate — is raw/ being processed into wiki/?
// ---------------------------------------------------------------------------

function computeCompileRate(opts) {
  const wikiLayer = require('./wiki-layer.cjs');
  const { vaultPath } = opts;
  const rawFiles = wikiLayer.listRawFiles(vaultPath);
  const wikiFiles = wikiLayer.listWikiFiles(vaultPath).filter((w) => {
    const base = path.basename(w.path);
    return base !== 'index.md' && base !== 'log.md';
  });

  const rawCount = rawFiles.length;
  const wikiCount = wikiFiles.length;
  const rate = rawCount > 0 ? Math.round((wikiCount / rawCount) * 100) : null;

  // Count sources actually referenced by wiki entries
  const referencedRawPaths = new Set();
  for (const w of wikiFiles) {
    for (const sp of w.sources || []) {
      referencedRawPaths.add(sp);
    }
  }
  const compiledRawCount = rawFiles.filter((r) => referencedRawPaths.has(r.relPath)).length;

  // How many raw files per category are uncompiled?
  const uncompiledByCategory = {};
  for (const r of rawFiles) {
    if (!referencedRawPaths.has(r.relPath)) {
      uncompiledByCategory[r.category] = (uncompiledByCategory[r.category] || 0) + 1;
    }
  }

  let verdict = 'no-raw';
  if (rawCount === 0) verdict = 'no-raw';
  else if (compiledRawCount === rawCount) verdict = 'fully-compiled';
  else if (compiledRawCount / rawCount >= 0.5) verdict = 'partially-compiled';
  else verdict = 'backlog';

  return {
    rawCount,
    wikiCount,
    compiledRawCount,
    uncompiledCount: rawCount - compiledRawCount,
    rate,
    uncompiledByCategory,
    verdict,
  };
}

// ---------------------------------------------------------------------------
// Search utility — are searches finding results?
// ---------------------------------------------------------------------------

/**
 * Parses wiki/log.md for compile and search activity. The log is our
 * only persistent record of MCP tool invocations. It's not a full
 * telemetry stream — just compile events. For richer data we'd need
 * to instrument the MCP server, which is a future improvement.
 *
 * For now, we derive utility from what we CAN observe:
 *   - How many compile passes have been run?
 *   - How many session syntheses have been written?
 *   - How many wiki entries reference raw sources?
 */
function computeSearchUtility(opts) {
  const { vaultPath } = opts;
  const logPath = path.join(vaultPath, 'wiki', 'log.md');
  let compileCount = 0;
  let synthCount = 0;

  if (fs.existsSync(logPath)) {
    const content = fs.readFileSync(logPath, 'utf-8');
    const lines = content.split('\n');
    for (const line of lines) {
      if (/compile:/.test(line)) compileCount++;
      if (/session-synthesis/.test(line)) synthCount++;
    }
  }

  // Count session notes (proxy for how many sessions have used ZED)
  const sessionsDir = path.join(vaultPath, 'sessions');
  let sessionCount = 0;
  if (fs.existsSync(sessionsDir)) {
    sessionCount = fs.readdirSync(sessionsDir).filter((f) => f.endsWith('.md')).length;
  }

  return {
    compilePasses: compileCount,
    sessionSyntheses: synthCount,
    sessionNotes: sessionCount,
    // Future: instrument MCP server to track search invocations, hit rates
    note: 'Full search telemetry requires MCP instrumentation (future work)',
  };
}

// ---------------------------------------------------------------------------
// Capture ratio — are sessions producing knowledge?
// ---------------------------------------------------------------------------

/**
 * Ratio of knowledge artifacts (decisions, patterns, wiki entries) to
 * session count. A healthy vault produces >1 capture per session.
 */
function computeCaptureRatio(opts) {
  const { vaultPath } = opts;
  const notes = fileLayer.listNotes(vaultPath);

  let decisions = 0;
  let patterns = 0;
  let wikiEntries = 0;
  let clips = 0;
  let sessions = 0;

  for (const notePath of notes) {
    try {
      const note = fileLayer.readNote(notePath);
      const type = (note.frontmatter && note.frontmatter.type) || '';
      if (type === 'decision') decisions++;
      else if (type === 'pattern' || type === 'anti-pattern') patterns++;
      else if (type.startsWith('wiki-')) wikiEntries++;
      else if (type === 'clip' || type === 'paper' || type === 'transcript' || type === 'repo-dump') clips++;
      else if (type === 'daily') sessions++;
    } catch (e) { /* skip */ }
  }

  const captures = decisions + patterns + wikiEntries;
  const ratio = sessions > 0 ? Math.round((captures / sessions) * 10) / 10 : null;

  let verdict = 'no-sessions';
  if (sessions === 0) verdict = 'no-sessions';
  else if (ratio >= 2) verdict = 'excellent';
  else if (ratio >= 1) verdict = 'healthy';
  else if (ratio >= 0.3) verdict = 'low';
  else verdict = 'negligible';

  return {
    decisions,
    patterns,
    wikiEntries,
    clips,
    sessions,
    captures,
    ratio,
    verdict,
  };
}

// ---------------------------------------------------------------------------
// Evolve efficiency — do loops converge?
// ---------------------------------------------------------------------------

function computeEvolveEfficiency(opts) {
  const { vaultPath } = opts;
  const loopDir = path.join(vaultPath, '_loop');
  const results = {
    activeLoop: false,
    completedIterations: 0,
    objectiveTitle: null,
    assessments: [],
    verdict: 'no-loops',
  };

  if (!fs.existsSync(loopDir)) return results;

  // Read objective
  const objPath = path.join(loopDir, 'objective.md');
  if (fs.existsSync(objPath)) {
    results.activeLoop = true;
    try {
      const obj = fileLayer.readNote(objPath);
      results.objectiveTitle = obj.title || null;
      if (obj.frontmatter && obj.frontmatter.completed) {
        results.activeLoop = false;
      }
    } catch (e) { /* skip */ }
  }

  // Read progress — count lines starting with "- " that mention iterations,
  // or just count all bullet items as a proxy for iteration ticks
  const progPath = path.join(loopDir, 'progress.md');
  if (fs.existsSync(progPath)) {
    try {
      const content = fs.readFileSync(progPath, 'utf-8');
      // Count all bullet-point lines (each `zed loop-tick` adds one)
      const bulletLines = content.match(/^- .+/gm) || [];
      results.completedIterations = bulletLines.length;
    } catch (e) { /* skip */ }
  }

  // Read assessments
  try {
    const files = fs.readdirSync(loopDir).filter((f) => f.startsWith('assessment-'));
    for (const f of files) {
      try {
        const note = fileLayer.readNote(path.join(loopDir, f));
        results.assessments.push({
          file: f,
          title: note.title,
          percentage: note.frontmatter && note.frontmatter.completion_pct
            ? parseInt(note.frontmatter.completion_pct, 10)
            : null,
        });
      } catch (e) { /* skip */ }
    }
  } catch (e) { /* skip */ }

  if (results.completedIterations > 0) {
    results.verdict = results.activeLoop ? 'in-progress' : 'completed';
  }

  return results;
}

// ---------------------------------------------------------------------------
// Knowledge age — how fresh is the vault?
// ---------------------------------------------------------------------------

function computeKnowledgeAge(opts) {
  const { vaultPath, windowDays = 30 } = opts;
  const notes = fileLayer.listNotes(vaultPath);
  const now = Date.now();
  const cutoff = now - windowDays * 24 * 3600 * 1000;

  let fresh = 0;
  let stale = 0;
  let totalAgeDays = 0;
  const oldestNotes = [];

  for (const notePath of notes) {
    try {
      const stat = fs.statSync(notePath);
      const ageDays = Math.floor((now - stat.mtimeMs) / (24 * 3600 * 1000));
      totalAgeDays += ageDays;

      if (stat.mtimeMs >= cutoff) {
        fresh++;
      } else {
        stale++;
        oldestNotes.push({ path: path.basename(notePath, '.md'), ageDays });
      }
    } catch (e) { /* skip */ }
  }

  oldestNotes.sort((a, b) => b.ageDays - a.ageDays);

  const avgAgeDays = notes.length > 0 ? Math.round(totalAgeDays / notes.length) : 0;
  const freshRatio = notes.length > 0 ? Math.round((fresh / notes.length) * 100) : 0;

  let verdict = 'empty';
  if (notes.length === 0) verdict = 'empty';
  else if (freshRatio >= 70) verdict = 'fresh';
  else if (freshRatio >= 40) verdict = 'aging';
  else verdict = 'stale';

  return {
    total: notes.length,
    fresh,
    stale,
    freshRatio,
    avgAgeDays,
    windowDays,
    oldestNotes: oldestNotes.slice(0, 5),
    verdict,
  };
}

// ---------------------------------------------------------------------------
// Full dashboard
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Tool usage & protocol adherence (from MCP event log)
// ---------------------------------------------------------------------------

function computeToolUsage(opts) {
  const eventLogMod = require('./event-log.cjs');
  const windowDays = (opts && opts.windowDays) || 30;
  const events = eventLogMod.readEvents({ sinceDays: windowDays });
  return eventLogMod.aggregateToolUsage(events);
}

function computeProtocolAdherence(opts) {
  const eventLogMod = require('./event-log.cjs');
  const windowDays = (opts && opts.windowDays) || 30;
  const events = eventLogMod.readEvents({ sinceDays: windowDays });
  return eventLogMod.aggregateProtocolAdherence(events);
}

// ---------------------------------------------------------------------------
// Metric history persistence & trends
// ---------------------------------------------------------------------------

function getHistoryPath(opts) {
  const dataDir =
    (opts && opts.dataDir) ||
    process.env.CLAUDE_PLUGIN_DATA ||
    process.env.ZED_DATA_DIR ||
    path.join(require('os').homedir(), '.zed-data');
  return path.join(dataDir, 'metrics-history.jsonl');
}

function appendHistory(metricsResult, opts) {
  const histPath = getHistoryPath(opts);
  const dir = path.dirname(histPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  // Dedup: don't append if last entry was < 60s ago
  try {
    if (fs.existsSync(histPath)) {
      const lines = fs.readFileSync(histPath, 'utf-8').split('\n').filter((l) => l.trim());
      if (lines.length > 0) {
        const last = JSON.parse(lines[lines.length - 1]);
        if (Date.now() - Date.parse(last.ts) < 60000) return;
      }
      // Auto-prune: keep last 365 entries
      if (lines.length > 365) {
        const pruned = lines.slice(-365);
        const tmp = histPath + '.tmp.' + process.pid;
        fs.writeFileSync(tmp, pruned.join('\n') + '\n');
        fs.renameSync(tmp, histPath);
      }
    }
  } catch (e) { /* non-fatal */ }

  const entry = {
    ts: metricsResult.generated || new Date().toISOString(),
    score: metricsResult.score,
    grade: metricsResult.grade,
    growthRate: metricsResult.growth.perWeek,
    edgesPerNode: metricsResult.connectivity.edgesPerNode,
    orphanRatio: metricsResult.connectivity.orphanRatio,
    compileRate: metricsResult.compileRate.rate,
    captureRatio: metricsResult.captureRatio.ratio,
    freshRatio: metricsResult.knowledgeAge.freshRatio,
  };
  fs.appendFileSync(histPath, JSON.stringify(entry) + '\n');
}

function readHistory(opts) {
  const histPath = getHistoryPath(opts);
  if (!fs.existsSync(histPath)) return [];
  return fs.readFileSync(histPath, 'utf-8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);
}

function computeTrends(currentMetrics, opts) {
  const history = readHistory(opts);
  if (history.length === 0) return null;

  const last = history[history.length - 1];
  const now = Date.now();
  const weekAgo = history.filter((h) => Date.parse(h.ts) <= now - 7 * 24 * 3600 * 1000).pop();

  const vsLast = last ? {
    scoreDelta: currentMetrics.score - last.score,
    edgesDelta: currentMetrics.connectivity.edgesPerNode - (last.edgesPerNode || 0),
    orphanDelta: currentMetrics.connectivity.orphanRatio - (last.orphanRatio || 0),
  } : null;

  const vs7d = weekAgo ? {
    scoreDelta: currentMetrics.score - weekAgo.score,
  } : null;

  // Direction: based on last 3 scores
  const recent = history.slice(-3);
  let direction = 'stable';
  if (recent.length >= 2) {
    const scores = recent.map((h) => h.score);
    const trend = scores[scores.length - 1] - scores[0];
    if (trend > 5) direction = 'improving';
    else if (trend < -5) direction = 'declining';
  }

  return { vsLast, vs7d, direction, historyCount: history.length };
}

// ---------------------------------------------------------------------------
// Full dashboard
// ---------------------------------------------------------------------------

/**
 * Compute all effectiveness metrics in one call.
 *
 * @param {Object} opts
 * @param {string} opts.vaultPath
 * @param {Object} opts.engine — a KnowledgeEngine instance (already built)
 * @param {number} [opts.windowDays=30]
 * @param {boolean} [opts.persistHistory=true] — auto-persist to history file
 * @returns {Object} all metrics grouped by category
 */
function computeMetrics(opts) {
  const { vaultPath, engine, windowDays = 30 } = opts;
  if (!vaultPath) throw new Error('computeMetrics: vaultPath required');
  if (!engine) throw new Error('computeMetrics: engine required');

  const growth = computeGrowth({ vaultPath, windowDays });
  const connectivity = computeConnectivity({ engine });
  const compileRate = computeCompileRate({ vaultPath });
  const searchUtility = computeSearchUtility({ vaultPath });
  const captureRatio = computeCaptureRatio({ vaultPath });
  const evolveEfficiency = computeEvolveEfficiency({ vaultPath });
  const knowledgeAge = computeKnowledgeAge({ vaultPath, windowDays });

  // Event-log-based telemetry (Phase 1)
  let toolUsage = null;
  let protocolAdherence = null;
  try {
    toolUsage = computeToolUsage({ windowDays });
    protocolAdherence = computeProtocolAdherence({ windowDays });
  } catch (e) { /* event log may not exist yet */ }

  // Composite effectiveness score (0-100)
  // Weights reflect what matters for "is ZED helping?"
  let score = 0;
  let maxScore = 0;

  // Growth (20 pts): is knowledge accumulating?
  maxScore += 20;
  if (growth.trajectory === 'growing') score += 20;
  else if (growth.trajectory === 'stable') score += 14;
  else if (growth.trajectory === 'stagnant') score += 6;

  // Connectivity (25 pts): is knowledge linked?
  maxScore += 25;
  if (connectivity.verdict === 'well-connected') score += 25;
  else if (connectivity.verdict === 'moderately-connected') score += 16;
  else if (connectivity.verdict === 'fragmented') score += 8;

  // Compile rate (15 pts): is raw/ being processed?
  maxScore += 15;
  if (compileRate.verdict === 'fully-compiled') score += 15;
  else if (compileRate.verdict === 'partially-compiled') score += 10;
  else if (compileRate.verdict === 'backlog') score += 3;
  else if (compileRate.verdict === 'no-raw') score += 15; // no raw = no penalty

  // Capture ratio (25 pts): are sessions producing knowledge?
  maxScore += 25;
  if (captureRatio.verdict === 'excellent') score += 25;
  else if (captureRatio.verdict === 'healthy') score += 18;
  else if (captureRatio.verdict === 'low') score += 8;
  else if (captureRatio.verdict === 'no-sessions') score += 10; // neutral, not penalty

  // Freshness (15 pts): is the vault current?
  maxScore += 15;
  if (knowledgeAge.verdict === 'fresh') score += 15;
  else if (knowledgeAge.verdict === 'aging') score += 8;
  else if (knowledgeAge.verdict === 'stale') score += 2;

  const finalScore = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
  let grade;
  if (finalScore >= 90) grade = 'A';
  else if (finalScore >= 75) grade = 'B';
  else if (finalScore >= 60) grade = 'C';
  else if (finalScore >= 40) grade = 'D';
  else grade = 'F';

  const result = {
    score: finalScore,
    grade,
    growth,
    connectivity,
    compileRate,
    searchUtility,
    captureRatio,
    evolveEfficiency,
    knowledgeAge,
    toolUsage,
    protocolAdherence,
    generated: new Date().toISOString(),
  };

  // Auto-persist to history + compute trends (Phase 3)
  let trends = null;
  if (opts.persistHistory !== false) {
    try {
      trends = computeTrends(result, opts);
      appendHistory(result, opts);
    } catch (e) { /* non-fatal */ }
  }
  result.trends = trends;

  return result;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  computeMetrics,
  computeGrowth,
  computeConnectivity,
  computeCompileRate,
  computeSearchUtility,
  computeCaptureRatio,
  computeEvolveEfficiency,
  computeKnowledgeAge,
  computeToolUsage,
  computeProtocolAdherence,
  appendHistory,
  readHistory,
  computeTrends,
  getHistoryPath,
};
