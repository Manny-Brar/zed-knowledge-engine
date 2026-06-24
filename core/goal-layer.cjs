/**
 * goal-layer.cjs — ZED Goal System (North Star + Focus)
 *
 * Two-tier goal model:
 *   - North Star: project-level, persistent, lives in <repo>/CLAUDE.md
 *                 mirrored to <vault>/goals/NORTH_STAR.md for vault search
 *   - Focus: session-level, ephemeral, lives in <data>/active-goal.json
 *
 * Resolution: effective = focus ?? northStar
 *
 * Privacy: goal-events.jsonl logs structural events (set, clear, complete)
 * with goal IDs and timestamps. Goal titles ARE logged (they're already
 * stored in plaintext markdown — no additional surface).
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

function getDataDir(opts) {
  return (
    (opts && opts.dataDir) ||
    process.env.ZED_DATA_DIR ||
    process.env.CLAUDE_PLUGIN_DATA ||
    path.join(os.homedir(), '.zed-data')
  );
}

function getVaultDir(opts) {
  return (opts && opts.vaultDir) || path.join(getDataDir(opts), 'vault');
}

function getRepoCwd(opts) {
  return (opts && opts.repoCwd) || process.cwd();
}

function activeGoalPath(opts) {
  return path.join(getDataDir(opts), 'active-goal.json');
}

function goalEventsPath(opts) {
  return path.join(getDataDir(opts), 'goal-events.jsonl');
}

function goalLockPath(opts) {
  return path.join(getDataDir(opts), 'goal-lock.json');
}

function loopObjectivePath(opts) {
  return path.join(getVaultDir(opts), '_loop', 'objective.md');
}

function projectClaudeMdPath(opts) {
  return path.join(getRepoCwd(opts), 'CLAUDE.md');
}

function northStarMirrorPath(opts) {
  return path.join(getVaultDir(opts), 'goals', 'NORTH_STAR.md');
}

function archivedGoalsDir(opts) {
  return path.join(getVaultDir(opts), 'goals', 'archived');
}

function completedGoalsDir(opts) {
  return path.join(getVaultDir(opts), 'goals', 'completed');
}

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

// ---------------------------------------------------------------------------
// Slug + ID helpers
// ---------------------------------------------------------------------------

function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function nextGoalId(title) {
  const date = new Date().toISOString().split('T')[0];
  return `G-${date}-${slugify(title) || 'untitled'}`;
}

// ---------------------------------------------------------------------------
// Markdown section parse/edit (for CLAUDE.md North Star section)
// ---------------------------------------------------------------------------

/**
 * Find the body of a `## <heading>` section. Returns { start, end, body }
 * where start/end are line indices (end exclusive) and body is the text
 * between the heading and the next `## ` heading (or EOF). Returns null
 * if the heading is not found.
 */
function findSection(text, heading) {
  const lines = text.split('\n');
  const headingRe = new RegExp('^##\\s+' + heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$');
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (headingRe.test(lines[i])) { start = i; break; }
  }
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i])) { end = i; break; }
  }
  return { start, end, body: lines.slice(start + 1, end).join('\n') };
}

/**
 * Replace (or insert) a `## <heading>` section in text. If the section
 * exists, its body is replaced. If not, the section is appended.
 */
function upsertSection(text, heading, body) {
  const block = `## ${heading}\n\n${body.trim()}\n`;
  const found = findSection(text, heading);
  if (!found) {
    const sep = text.endsWith('\n') ? '\n' : '\n\n';
    return text + sep + block + '\n';
  }
  const lines = text.split('\n');
  const before = lines.slice(0, found.start).join('\n');
  const after = lines.slice(found.end).join('\n');
  const beforePad = before && !before.endsWith('\n') ? before + '\n\n' : before ? before + '\n' : '';
  const afterPad = after.startsWith('\n') ? after : (after ? '\n' + after : '');
  return beforePad + block + afterPad;
}

/**
 * Remove a `## <heading>` section entirely. Returns the new text.
 */
function removeSection(text, heading) {
  const found = findSection(text, heading);
  if (!found) return text;
  const lines = text.split('\n');
  const before = lines.slice(0, found.start).join('\n').replace(/\n+$/, '');
  const after = lines.slice(found.end).join('\n').replace(/^\n+/, '');
  if (before && after) return before + '\n\n' + after + (after.endsWith('\n') ? '' : '\n');
  return (before || after) + '\n';
}

// ---------------------------------------------------------------------------
// North Star — render + parse
// ---------------------------------------------------------------------------

/**
 * Render a goal object as the body of the `## North Star` section.
 */
function renderNorthStarBody(goal) {
  const lines = [];
  lines.push(`**Goal**: ${goal.title}`);
  lines.push('');
  if (Array.isArray(goal.successCriteria) && goal.successCriteria.length) {
    lines.push('**Success criteria**:');
    for (const c of goal.successCriteria) lines.push(`- ${c}`);
    lines.push('');
  }
  if (Array.isArray(goal.antiGoals) && goal.antiGoals.length) {
    lines.push('**Anti-goals** (out of scope):');
    for (const a of goal.antiGoals) lines.push(`- ${a}`);
    lines.push('');
  }
  lines.push(`**Horizon**: ${goal.horizon || 'ongoing'}`);
  lines.push(`**Set**: ${goal.setAt || new Date().toISOString().split('T')[0]}`);
  lines.push(`**ID**: ${goal.id}`);
  return lines.join('\n');
}

/**
 * Parse the body of `## North Star` into a goal object. Tolerant — missing
 * fields return as undefined / empty arrays.
 */
function parseNorthStarBody(body) {
  if (!body || !body.trim()) return null;
  const goal = { successCriteria: [], antiGoals: [] };

  // Title
  const m = body.match(/\*\*Goal\*\*:\s*(.+?)(?:\n|$)/);
  if (m) goal.title = m[1].trim();
  if (!goal.title) return null;

  // Success criteria — list under "**Success criteria**:" until blank line or next bold field
  goal.successCriteria = extractList(body, 'Success criteria');
  goal.antiGoals = extractList(body, 'Anti-goals');

  const hMatch = body.match(/\*\*Horizon\*\*:\s*(.+?)(?:\n|$)/);
  if (hMatch) goal.horizon = hMatch[1].trim();

  const sMatch = body.match(/\*\*Set\*\*:\s*(\d{4}-\d{2}-\d{2})/);
  if (sMatch) goal.setAt = sMatch[1];

  const idMatch = body.match(/\*\*ID\*\*:\s*(\S+)/);
  if (idMatch) goal.id = idMatch[1];
  else goal.id = nextGoalId(goal.title);

  return goal;
}

function extractList(body, fieldLabel) {
  const escaped = fieldLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Allow optional bold-suffix text (e.g. "**Anti-goals** (out of scope):")
  // and any non-newline chars between the closing `**` and the newline.
  const re = new RegExp(`\\*\\*${escaped}\\*\\*[^\\n]*\\n((?:- .+\\n?)+)`, 'i');
  const m = body.match(re);
  if (!m) return [];
  return m[1]
    .split('\n')
    .map((l) => l.replace(/^\s*-\s*/, '').trim())
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// North Star — read/write
// ---------------------------------------------------------------------------

/**
 * Read the North Star from <repo>/CLAUDE.md. Returns null if missing or
 * unparseable.
 */
function readNorthStar(opts) {
  const claudeMd = projectClaudeMdPath(opts);
  if (!fs.existsSync(claudeMd)) return null;
  const text = fs.readFileSync(claudeMd, 'utf-8');
  const section = findSection(text, 'North Star');
  if (!section) return null;
  return parseNorthStarBody(section.body);
}

/**
 * Write the North Star to <repo>/CLAUDE.md and mirror to vault.
 * Creates CLAUDE.md if missing. Atomic per-file.
 */
function writeNorthStar(goal, opts) {
  if (!goal || !goal.title || !String(goal.title).trim()) {
    throw new Error('North Star requires a non-empty title');
  }
  if (!Array.isArray(goal.successCriteria) || goal.successCriteria.length === 0) {
    throw new Error('North Star requires at least one success criterion');
  }

  goal.id = goal.id || nextGoalId(goal.title);
  goal.setAt = goal.setAt || new Date().toISOString().split('T')[0];
  goal.horizon = goal.horizon || 'ongoing';

  const claudeMd = projectClaudeMdPath(opts);
  let existing = '';
  if (fs.existsSync(claudeMd)) {
    existing = fs.readFileSync(claudeMd, 'utf-8');
  } else {
    existing = `# Project Context\n\n_This file is the agent-facing contract for this project. ZED reads it on every session start._\n`;
  }
  const body = renderNorthStarBody(goal);
  const updated = upsertSection(existing, 'North Star', body);
  fs.writeFileSync(claudeMd, updated, 'utf-8');

  // Mirror to vault for query/search
  ensureDir(path.dirname(northStarMirrorPath(opts)));
  const mirror = [
    '---',
    `title: "${goal.title.replace(/"/g, '\\"')}"`,
    `type: project-goal`,
    `id: ${goal.id}`,
    `horizon: ${goal.horizon}`,
    `set_at: ${goal.setAt}`,
    `status: active`,
    `tags: [goal, north-star]`,
    '---',
    '',
    `# ${goal.title}`,
    '',
    body,
    '',
  ].join('\n');
  fs.writeFileSync(northStarMirrorPath(opts), mirror, 'utf-8');

  appendGoalEvent({ kind: 'north-star.set', id: goal.id, title: goal.title }, opts);
  return goal;
}

/**
 * Archive the current North Star to <vault>/goals/archived/ and remove
 * the `## North Star` section from CLAUDE.md.
 */
function archiveNorthStar(reason, opts) {
  const current = readNorthStar(opts);
  if (!current) return null;

  ensureDir(archivedGoalsDir(opts));
  const file = path.join(archivedGoalsDir(opts), `${current.id}.md`);
  const body = renderNorthStarBody(current);
  const archived = [
    '---',
    `title: "${current.title.replace(/"/g, '\\"')}"`,
    `type: archived-goal`,
    `id: ${current.id}`,
    `archived_at: ${new Date().toISOString()}`,
    `archived_reason: "${(reason || 'manual').replace(/"/g, '\\"')}"`,
    `tags: [goal, archived]`,
    '---',
    '',
    `# ${current.title}`,
    '',
    body,
    '',
  ].join('\n');
  fs.writeFileSync(file, archived, 'utf-8');

  // Remove from CLAUDE.md
  const claudeMd = projectClaudeMdPath(opts);
  if (fs.existsSync(claudeMd)) {
    const text = fs.readFileSync(claudeMd, 'utf-8');
    fs.writeFileSync(claudeMd, removeSection(text, 'North Star'), 'utf-8');
  }

  // Remove mirror
  try { fs.unlinkSync(northStarMirrorPath(opts)); } catch {}

  appendGoalEvent({ kind: 'north-star.archived', id: current.id, title: current.title, reason }, opts);
  return current;
}

/**
 * Mark the current North Star complete: emit closure synthesis, move to
 * completed/, remove from CLAUDE.md, emit closure event.
 *
 * Synthesis emission is automatic but can be disabled via opts.skipSynthesis.
 * Returns { goal, synthesisPath } so the caller can surface the synthesis
 * location to the user.
 */
function completeNorthStar(closureNote, opts) {
  const current = readNorthStar(opts);
  if (!current) return null;

  const completedAt = new Date().toISOString();

  // 1. Emit closure synthesis FIRST (while goal is still active so event-log
  //    queries with gid still resolve correctly)
  let synthesisPath = null;
  if (!(opts && opts.skipSynthesis)) {
    try {
      synthesisPath = writeClosureSynthesis(current, { ...opts, completedAtIso: completedAt, closureNote });
    } catch (e) {
      // Synthesis is additive — never fail the closure on synthesis errors
      synthesisPath = null;
    }
  }

  // 2. Write the archived goal note
  ensureDir(completedGoalsDir(opts));
  const file = path.join(completedGoalsDir(opts), `${current.id}.md`);
  const body = renderNorthStarBody(current);
  const note = [
    '---',
    `title: "${current.title.replace(/"/g, '\\"')}"`,
    `type: completed-goal`,
    `id: ${current.id}`,
    `completed_at: ${completedAt}`,
    synthesisPath ? `synthesis_path: "${path.relative(getVaultDir(opts), synthesisPath)}"` : '',
    `tags: [goal, completed]`,
    '---',
    '',
    `# ${current.title}`,
    '',
    body,
    '',
    '## Closure',
    '',
    closureNote || '_Marked complete. See synthesis note for full activity record._',
    '',
    synthesisPath ? `## Synthesis\n\nSee [[Closure: ${current.title}]] (\`${path.relative(getVaultDir(opts), synthesisPath)}\`) for the full activity record.\n` : '',
  ].filter(Boolean).join('\n');
  fs.writeFileSync(file, note, 'utf-8');

  // 3. Remove from CLAUDE.md + mirror
  const claudeMd = projectClaudeMdPath(opts);
  if (fs.existsSync(claudeMd)) {
    const text = fs.readFileSync(claudeMd, 'utf-8');
    fs.writeFileSync(claudeMd, removeSection(text, 'North Star'), 'utf-8');
  }
  try { fs.unlinkSync(northStarMirrorPath(opts)); } catch {}

  // 4. Emit closure event with synthesis pointer
  appendGoalEvent({
    kind: 'north-star.completed',
    id: current.id,
    title: current.title,
    meta: synthesisPath ? { synthesisPath: path.relative(getVaultDir(opts), synthesisPath) } : null,
  }, opts);

  return { goal: current, synthesisPath };
}

// ---------------------------------------------------------------------------
// Focus (session goal) — read/write
// ---------------------------------------------------------------------------

function readFocus(opts) {
  const p = activeGoalPath(opts);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch {
    return null;
  }
}

function writeFocus(goal, opts) {
  if (!goal || !goal.title || !String(goal.title).trim()) {
    throw new Error('Focus requires a non-empty title');
  }
  goal.id = goal.id || nextGoalId(goal.title);
  goal.setAt = goal.setAt || new Date().toISOString();
  goal.pinned = !!goal.pinned;
  if (!Array.isArray(goal.successCriteria)) goal.successCriteria = [];

  ensureDir(getDataDir(opts));
  fs.writeFileSync(activeGoalPath(opts), JSON.stringify(goal, null, 2), 'utf-8');
  appendGoalEvent({ kind: 'focus.set', id: goal.id, title: goal.title }, opts);
  return goal;
}

function clearFocus(opts) {
  const current = readFocus(opts);
  try { fs.unlinkSync(activeGoalPath(opts)); } catch {}
  if (current) {
    appendGoalEvent({ kind: 'focus.cleared', id: current.id, title: current.title }, opts);
  }
  return current;
}

// ---------------------------------------------------------------------------
// Resolution + clarity classification
// ---------------------------------------------------------------------------

/**
 * Return the effective goal stack: { northStar, focus, effective, source }.
 * effective = focus ?? northStar
 * source = 'focus' | 'north-star' | 'none'
 */
function resolveEffectiveGoal(opts) {
  const northStar = readNorthStar(opts);
  const focus = readFocus(opts);
  const effective = focus || northStar || null;
  const source = focus ? 'focus' : northStar ? 'north-star' : 'none';
  return { northStar, focus, effective, source };
}

/**
 * Classify how clearly the effective goal is defined.
 *   'clear'   — title + criteria, within horizon
 *   'vague'   — title but missing success criteria
 *   'stale'   — set more than HORIZON_DAYS ago
 *   'missing' — no goal at any tier
 */
function classifyGoalClarity(opts) {
  const { effective, source } = resolveEffectiveGoal(opts);
  if (!effective) return { clarity: 'missing', source: 'none' };

  const hasCriteria = Array.isArray(effective.successCriteria) && effective.successCriteria.length > 0;
  if (!hasCriteria) return { clarity: 'vague', source, reason: 'no success criteria' };

  // Staleness — focus expires faster than north-star
  const horizonDays = source === 'focus' ? 7 : 90;
  const setAt = effective.setAt ? Date.parse(effective.setAt + (effective.setAt.length === 10 ? 'T00:00:00Z' : '')) : null;
  if (Number.isFinite(setAt)) {
    const ageDays = (Date.now() - setAt) / (24 * 3600 * 1000);
    if (ageDays > horizonDays) {
      return { clarity: 'stale', source, reason: `set ${Math.round(ageDays)} days ago (horizon: ${horizonDays}d)` };
    }
  }

  return { clarity: 'clear', source };
}

// ---------------------------------------------------------------------------
// Lock mode (enforcement gradient)
// ---------------------------------------------------------------------------

const VALID_LOCK_MODES = ['advise', 'warn', 'block-writes', 'block-all'];

function readLockMode(opts) {
  const p = goalLockPath(opts);
  if (!fs.existsSync(p)) return 'advise';
  try {
    const obj = JSON.parse(fs.readFileSync(p, 'utf-8'));
    const mode = obj && obj.mode;
    return VALID_LOCK_MODES.includes(mode) ? mode : 'advise';
  } catch {
    return 'advise';
  }
}

function writeLockMode(mode, opts) {
  if (!VALID_LOCK_MODES.includes(mode)) {
    throw new Error(`Invalid lock mode: ${mode}. Must be one of: ${VALID_LOCK_MODES.join(', ')}`);
  }
  ensureDir(getDataDir(opts));
  fs.writeFileSync(goalLockPath(opts), JSON.stringify({ mode, setAt: new Date().toISOString() }, null, 2), 'utf-8');
  appendGoalEvent({ kind: 'lock.set', meta: { mode } }, opts);
  return mode;
}

function clearLockMode(opts) {
  try { fs.unlinkSync(goalLockPath(opts)); } catch {}
  appendGoalEvent({ kind: 'lock.cleared' }, opts);
  return 'advise';
}

// ---------------------------------------------------------------------------
// goal-check — one-shot resolver for hooks
// ---------------------------------------------------------------------------

/**
 * Single call that returns everything a hook needs to enforce policy:
 *   - effective goal id + title (or null)
 *   - clarity verdict
 *   - lock mode
 *   - inEvolveLoop flag (so the hook can defer to evolve scope-hard-lock)
 *   - recommendedAction: 'allow' | 'surface' | 'warn' | 'block'
 *
 * Decision matrix:
 *   inEvolveLoop:   always 'allow' (evolve-mode owns enforcement)
 *   clarity=clear:  'surface' if mode=advise/warn, else 'allow'
 *   clarity≠clear:
 *     advise:         'surface'
 *     warn:           'warn'
 *     block-writes:   'block' (only on write-like tools — caller decides)
 *     block-all:      'block'
 *   missing goal:
 *     advise:         'surface' (suggest setting one)
 *     warn:           'warn'
 *     block-writes:   'block'
 *     block-all:      'block'
 */
function goalCheck(opts) {
  const inEvolveLoop = fs.existsSync(loopObjectivePath(opts)) && (() => {
    try {
      const c = fs.readFileSync(loopObjectivePath(opts), 'utf-8');
      return !/completed:\s*true/m.test(c);
    } catch { return false; }
  })();

  const { effective, source } = resolveEffectiveGoal(opts);
  const clarity = classifyGoalClarity(opts);
  const mode = readLockMode(opts);

  let recommendedAction;
  let reason = null;

  if (inEvolveLoop) {
    recommendedAction = 'allow';
    reason = 'evolve loop active — evolve-mode scope-hard-lock applies';
  } else if (clarity.clarity === 'clear') {
    recommendedAction = mode === 'block-all' ? 'allow' : 'surface';
  } else if (clarity.clarity === 'missing') {
    if (mode === 'block-writes' || mode === 'block-all') {
      recommendedAction = 'block';
      reason = 'no goal declared; lock mode is ' + mode;
    } else if (mode === 'warn') {
      recommendedAction = 'warn';
      reason = 'no goal declared';
    } else {
      recommendedAction = 'surface';
      reason = 'no goal declared';
    }
  } else {
    // vague or stale
    if (mode === 'block-writes' || mode === 'block-all') {
      recommendedAction = 'block';
      reason = `goal clarity=${clarity.clarity}${clarity.reason ? ' (' + clarity.reason + ')' : ''}; lock mode is ${mode}`;
    } else if (mode === 'warn') {
      recommendedAction = 'warn';
      reason = `goal clarity=${clarity.clarity}${clarity.reason ? ' (' + clarity.reason + ')' : ''}`;
    } else {
      recommendedAction = 'surface';
      reason = `goal clarity=${clarity.clarity}`;
    }
  }

  return {
    goalId: effective ? effective.id : null,
    goalTitle: effective ? effective.title : null,
    source,
    clarity: clarity.clarity,
    clarityReason: clarity.reason || null,
    lockMode: mode,
    inEvolveLoop,
    recommendedAction,
    reason,
  };
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

function appendGoalEvent(event, opts) {
  try {
    const p = goalEventsPath(opts);
    ensureDir(path.dirname(p));
    const entry = {
      ts: new Date().toISOString(),
      kind: event.kind || 'unknown',
      id: event.id || null,
      title: event.title || null,
      reason: event.reason || null,
      meta: event.meta || null,
    };
    fs.appendFileSync(p, JSON.stringify(entry) + '\n', 'utf-8');
  } catch {
    // Best-effort
  }
}

function readGoalEvents(opts) {
  const p = goalEventsPath(opts);
  if (!fs.existsSync(p)) return [];
  const out = [];
  for (const line of fs.readFileSync(p, 'utf-8').split('\n')) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch {}
  }
  return out;
}

// ---------------------------------------------------------------------------
// Closure synthesis — rich compounding artifact emitted on goal completion
// ---------------------------------------------------------------------------

/**
 * Walk vault/wiki/ + vault/decisions/ for notes whose `created` frontmatter
 * falls within [windowStartIso, windowEndIso]. Returns [{ relPath, title, type }].
 * Best-effort — never throws.
 */
function listVaultNotesInWindow(windowStartIso, windowEndIso, opts) {
  const out = [];
  const vault = getVaultDir(opts);
  const dirs = [
    path.join(vault, 'wiki'),
    path.join(vault, 'decisions'),
    path.join(vault, 'patterns'),
    path.join(vault, 'architecture'),
  ];
  const startMs = Date.parse(windowStartIso);
  const endMs = Date.parse(windowEndIso) || Date.now();
  if (!Number.isFinite(startMs)) return out;

  function walk(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { return; }
    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { walk(full); continue; }
      if (!e.name.endsWith('.md')) continue;
      if (['index.md', 'log.md'].includes(e.name)) continue;
      try {
        const content = fs.readFileSync(full, 'utf-8');
        const createdMatch = content.match(/^created:\s*(\d{4}-\d{2}-\d{2})/m);
        if (!createdMatch) {
          // Fall back to mtime if no frontmatter `created`
          const mtime = fs.statSync(full).mtimeMs;
          if (mtime < startMs || mtime > endMs) continue;
        } else {
          const cMs = Date.parse(createdMatch[1] + 'T00:00:00Z');
          if (cMs < startMs || cMs > endMs) continue;
        }
        const titleMatch = content.match(/^title:\s*"?(.+?)"?\s*$/m);
        const typeMatch = content.match(/^type:\s*(\S+)/m);
        out.push({
          relPath: path.relative(vault, full),
          title: titleMatch ? titleMatch[1] : e.name.replace(/\.md$/, ''),
          type: typeMatch ? typeMatch[1] : 'note',
        });
      } catch { /* skip unreadable */ }
    }
  }

  for (const d of dirs) walk(d);
  return out;
}

/**
 * Walk git log for commits between windowStartIso and now in the project
 * working directory. Returns array of { sha, date, subject } or [] if not
 * a git repo or git not available.
 */
function listGitCommitsInWindow(windowStartIso, opts) {
  try {
    const { execFileSync } = require('child_process');
    const cwd = getRepoCwd(opts);
    // Check we're in a git repo
    execFileSync('git', ['rev-parse', '--git-dir'], { cwd, stdio: ['ignore', 'pipe', 'ignore'] });
    const sinceArg = `--since=${windowStartIso}`;
    const output = execFileSync(
      'git',
      ['log', sinceArg, '--pretty=format:%h\t%ai\t%s', '--no-merges'],
      { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }
    );
    if (!output.trim()) return [];
    return output.split('\n').filter(Boolean).map((line) => {
      const [sha, date, ...rest] = line.split('\t');
      return { sha, date, subject: rest.join('\t') };
    });
  } catch {
    return [];
  }
}

/**
 * Build the markdown body of the closure synthesis for a completed goal.
 * Pure function — does not touch disk except read.
 *
 * @param {Object} goal — the goal object (must have id, title, setAt, successCriteria)
 * @param {Object} [opts]
 * @param {string} [opts.closureNote]
 * @param {string} [opts.completedAtIso]
 */
function generateClosureSynthesis(goal, opts) {
  const completedAt = (opts && opts.completedAtIso) || new Date().toISOString();
  const closureNote = (opts && opts.closureNote) || '';

  // Normalize setAt to ISO at day boundary if just a date
  const setAtRaw = goal.setAt || completedAt;
  const setAtIso = /T/.test(setAtRaw) ? setAtRaw : setAtRaw + 'T00:00:00Z';

  const durationDays = Math.max(
    1,
    Math.round((Date.parse(completedAt) - Date.parse(setAtIso)) / (24 * 3600 * 1000))
  );

  // MCP events with this gid
  let mcpEvents = [];
  try {
    const eventLog = require('./event-log.cjs');
    const all = eventLog.readEvents(opts);
    mcpEvents = all.filter((e) => e.gid === goal.id);
  } catch { /* event-log may not exist */ }

  const tools = {};
  for (const e of mcpEvents) {
    tools[e.tool] = (tools[e.tool] || 0) + 1;
  }
  const topTools = Object.entries(tools).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const captures = (tools['zed_write_note'] || 0) + (tools['zed_decide'] || 0);
  const searches = tools['zed_search'] || 0;

  // Goal mutation events for this goal
  let goalEvents = [];
  try { goalEvents = readGoalEvents(opts).filter((e) => e.id === goal.id); } catch {}

  // Vault notes created in the window
  const vaultNotes = listVaultNotesInWindow(setAtIso, completedAt, opts);
  const captureNotes = vaultNotes.filter((n) => /pattern|architecture|wiki-/.test(n.type));
  const decisionNotes = vaultNotes.filter((n) => n.type === 'decision');

  // Git commits in the window (only if running in a git repo)
  const commits = listGitCommitsInWindow(setAtIso, opts);

  // Alignment rate during the goal's lifetime
  let alignmentRate = null;
  try {
    const eventLog = require('./event-log.cjs');
    const all = eventLog.readEvents(opts);
    const writeLike = new Set(['zed_write_note', 'zed_decide', 'zed_clip', 'zed_wiki_compile']);
    const inWindow = all.filter((e) => {
      if (!writeLike.has(e.tool)) return false;
      const ts = Date.parse(e.ts);
      return Number.isFinite(ts) && ts >= Date.parse(setAtIso) && ts <= Date.parse(completedAt);
    });
    if (inWindow.length > 0) {
      const aligned = inWindow.filter((e) => e.gid === goal.id).length;
      alignmentRate = Math.round((aligned / inWindow.length) * 100);
    }
  } catch {}

  // Build markdown
  const lines = [];
  lines.push(`# Closure: ${goal.title}`);
  lines.push('');
  lines.push(`> Synthesis emitted on goal completion — ${completedAt.split('T')[0]}.`);
  lines.push('');
  lines.push('## Goal');
  lines.push('');
  lines.push(`**Goal**: ${goal.title}`);
  lines.push(`**ID**: ${goal.id}`);
  lines.push(`**Set**: ${setAtIso.split('T')[0]}`);
  lines.push(`**Completed**: ${completedAt.split('T')[0]}`);
  lines.push(`**Duration**: ${durationDays} day${durationDays === 1 ? '' : 's'}`);
  lines.push(`**Horizon**: ${goal.horizon || 'ongoing'}`);
  lines.push('');

  if (Array.isArray(goal.successCriteria) && goal.successCriteria.length) {
    lines.push('### Success Criteria');
    lines.push('');
    for (const c of goal.successCriteria) lines.push(`- ${c}`);
    lines.push('');
  }

  if (closureNote && closureNote.trim()) {
    lines.push('## Closure Note');
    lines.push('');
    lines.push(closureNote.trim());
    lines.push('');
  }

  lines.push('## Activity During Pursuit');
  lines.push('');
  if (mcpEvents.length === 0 && vaultNotes.length === 0 && commits.length === 0) {
    lines.push('_No tracked activity in this window. The event log may have been pruned, or work happened before telemetry was attributed to this goal._');
    lines.push('');
  } else {
    if (mcpEvents.length > 0) {
      lines.push(`- **MCP tool calls attributed to this goal**: ${mcpEvents.length}`);
      lines.push(`- **Captures** (zed_write_note + zed_decide): ${captures}`);
      lines.push(`- **Searches** (zed_search): ${searches}`);
      if (alignmentRate !== null) {
        lines.push(`- **Goal alignment** during pursuit: ${alignmentRate}% of write-events`);
      }
      if (topTools.length > 0) {
        lines.push(`- **Top tools**: ${topTools.map(([t, n]) => `${t} (${n})`).join(', ')}`);
      }
      lines.push('');
    }
  }

  if (decisionNotes.length > 0) {
    lines.push('## Decisions');
    lines.push('');
    for (const n of decisionNotes) {
      lines.push(`- [[${n.title}]] — \`${n.relPath}\``);
    }
    lines.push('');
  }

  if (captureNotes.length > 0) {
    lines.push('## Knowledge Captured');
    lines.push('');
    for (const n of captureNotes.slice(0, 20)) {
      lines.push(`- [[${n.title}]] (${n.type}) — \`${n.relPath}\``);
    }
    if (captureNotes.length > 20) lines.push(`- _… ${captureNotes.length - 20} more_`);
    lines.push('');
  }

  if (commits.length > 0) {
    lines.push('## Git Commits');
    lines.push('');
    lines.push(`${commits.length} commit${commits.length === 1 ? '' : 's'} since goal set:`);
    lines.push('');
    for (const c of commits.slice(0, 25)) {
      lines.push(`- \`${c.sha}\` — ${c.subject}`);
    }
    if (commits.length > 25) lines.push(`- _… ${commits.length - 25} more_`);
    lines.push('');
  }

  if (goalEvents.length > 0) {
    lines.push('## Goal Lifecycle');
    lines.push('');
    for (const e of goalEvents) {
      lines.push(`- ${e.ts} — ${e.kind}${e.reason ? ' (' + e.reason + ')' : ''}`);
    }
    lines.push('');
  }

  lines.push('## What\'s Next');
  lines.push('');
  lines.push('_Set the successor goal with `zed goal-pin "title" --criteria "..."` (or leave blank to operate without a goal until you set one). When you do, link this synthesis as the predecessor._');
  lines.push('');

  return lines.join('\n');
}

/**
 * Write the closure synthesis to vault/wiki/syntheses/G-<id>-closure.md.
 * Returns the absolute path written.
 */
function writeClosureSynthesis(goal, opts) {
  const completedAt = (opts && opts.completedAtIso) || new Date().toISOString();
  const closureNote = opts && opts.closureNote;

  const synthDir = path.join(getVaultDir(opts), 'wiki', 'syntheses');
  ensureDir(synthDir);
  const file = path.join(synthDir, `${goal.id}-closure.md`);

  const body = generateClosureSynthesis(goal, { ...opts, completedAtIso: completedAt, closureNote });

  const frontmatter = [
    '---',
    `title: "Closure: ${goal.title.replace(/"/g, '\\"')}"`,
    'type: wiki-synthesis',
    `goal_id: ${goal.id}`,
    `goal_completed_at: ${completedAt}`,
    `source_paths: ["vault/goals/completed/${goal.id}.md"]`,
    `summary: "Synthesis of work and knowledge captured during pursuit of ${goal.title.replace(/"/g, '\\"').slice(0, 80)}"`,
    'tags: [goal, closure, synthesis]',
    '---',
    '',
  ].join('\n');

  fs.writeFileSync(file, frontmatter + body, 'utf-8');
  return file;
}

// ---------------------------------------------------------------------------
// Stack rendering (used by session-start hook and `zed goal` command)
// ---------------------------------------------------------------------------

/**
 * Render the goal stack as a human-readable block. Returns empty string
 * when no goal is set. Used by SessionStart hook for ambient injection.
 */
function renderStack(opts) {
  const { northStar, focus, source } = resolveEffectiveGoal(opts);
  if (!northStar && !focus) return '';

  const lines = [];
  lines.push('=== ZED Goal Stack ===');
  if (northStar) {
    lines.push(`North Star: ${northStar.title}`);
    if (northStar.successCriteria && northStar.successCriteria.length) {
      lines.push(`  Success: ${northStar.successCriteria.join('; ')}`);
    }
    if (northStar.antiGoals && northStar.antiGoals.length) {
      lines.push(`  Anti-goals: ${northStar.antiGoals.join('; ')}`);
    }
  }
  if (focus) {
    lines.push(`Focus: ${focus.title}${focus.pinned ? ' (pinned)' : ''}`);
    if (focus.successCriteria && focus.successCriteria.length) {
      lines.push(`  Success: ${focus.successCriteria.join('; ')}`);
    }
  }
  const clarity = classifyGoalClarity(opts);
  if (clarity.clarity !== 'clear') {
    lines.push(`Status: ${clarity.clarity}${clarity.reason ? ' — ' + clarity.reason : ''}`);
  }
  lines.push(`Active: ${source}`);
  lines.push('======================');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  // Paths
  getDataDir,
  getVaultDir,
  activeGoalPath,
  goalEventsPath,
  goalLockPath,
  projectClaudeMdPath,
  northStarMirrorPath,
  // North Star
  readNorthStar,
  writeNorthStar,
  archiveNorthStar,
  completeNorthStar,
  // Focus
  readFocus,
  writeFocus,
  clearFocus,
  // Resolution
  resolveEffectiveGoal,
  classifyGoalClarity,
  renderStack,
  // Lock mode + enforcement check
  readLockMode,
  writeLockMode,
  clearLockMode,
  goalCheck,
  VALID_LOCK_MODES,
  // Closure synthesis
  generateClosureSynthesis,
  writeClosureSynthesis,
  listVaultNotesInWindow,
  listGitCommitsInWindow,
  // Events
  appendGoalEvent,
  readGoalEvents,
  // Helpers (exported for tests)
  slugify,
  nextGoalId,
  findSection,
  upsertSection,
  removeSection,
  parseNorthStarBody,
  renderNorthStarBody,
};
