/**
 * atomic-write.cjs — atomic file write helper for ZED state files
 *
 * Pattern: write to <path>.tmp.<pid>, then rename to <path>.
 * rename(2) is atomic on POSIX within the same filesystem. This eliminates
 * the partial-write window where a reader could see a half-written JSON
 * file and fail to parse it.
 *
 * Critical paths that MUST use this:
 *   - cron-state.json (loop continuation guardrail)
 *   - active-goal.json (Focus state)
 *   - active-burst.json (burst checkpoint)
 *   - metrics-history.jsonl (when rewriting after prune)
 *
 * Public API:
 *   writeAtomic(filePath, content, opts)
 *   readJsonAtomic(filePath)
 *   writeJsonAtomic(filePath, obj, opts)
 */

'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Atomically write `content` to `filePath`. Creates parent directory if
 * missing. Throws on unrecoverable error (caller decides). Never leaves a
 * partial file at `filePath` — either the new content is fully written or
 * the old content (if any) remains intact.
 *
 * @param {string} filePath — absolute destination path
 * @param {string|Buffer} content — file contents
 * @param {Object} [opts]
 * @param {string} [opts.encoding='utf-8']
 * @param {number} [opts.mode] — chmod mode for the final file
 */
function writeAtomic(filePath, content, opts) {
  const encoding = (opts && opts.encoding) || 'utf-8';
  const dir = path.dirname(filePath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Tmp file in the SAME directory so rename stays on the same filesystem.
  // PID + counter handles concurrent writers from the same process.
  const tmpPath = `${filePath}.tmp.${process.pid}.${Date.now()}`;

  try {
    fs.writeFileSync(tmpPath, content, { encoding });
    if (opts && typeof opts.mode === 'number') {
      try { fs.chmodSync(tmpPath, opts.mode); } catch { /* non-fatal */ }
    }
    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    // Clean up the tmp file if rename never happened
    try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
    throw err;
  }
}

/**
 * Atomically write a JS object as pretty-printed JSON.
 */
function writeJsonAtomic(filePath, obj, opts) {
  writeAtomic(filePath, JSON.stringify(obj, null, 2), opts);
}

/**
 * Read JSON from `filePath`. Returns null on missing file or parse error.
 * Pairs with writeJsonAtomic — never throws on the read side.
 */
function readJsonAtomic(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

module.exports = {
  writeAtomic,
  writeJsonAtomic,
  readJsonAtomic,
};
