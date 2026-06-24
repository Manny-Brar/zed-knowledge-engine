/**
 * autolink.cjs — ZED v8.1 Auto-Wikilink Injection
 *
 * Scans note body text for mentions of existing note titles and
 * automatically wraps them in [[wikilinks]]. This is the single
 * highest-leverage change for connectivity — it pushes edges/node
 * from 0 to 1.5+ with zero user behavior change.
 *
 * Design:
 *   - Longest-first matching prevents "Auth Strategy" → "[[Auth]] Strategy"
 *   - Whole-word boundaries prevent "rapid" matching title "api"
 *   - Code blocks (fenced + inline) are preserved untouched
 *   - Frontmatter is never modified
 *   - URLs and markdown links are skipped
 *   - Only the first occurrence per title is linked (configurable)
 *   - Titles ≤ 3 chars are skipped (too noisy)
 *   - Already-linked titles are skipped
 *   - Configurable via ZED_AUTOLINK=0 env var
 *
 * Public API:
 *   injectWikilinks(content, titleList, opts) → { content, injected[] }
 *   isAutoLinkEnabled() → boolean
 */

'use strict';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const MIN_TITLE_LENGTH = 4;

function isAutoLinkEnabled() {
  return process.env.ZED_AUTOLINK !== '0';
}

// ---------------------------------------------------------------------------
// Core: inject wikilinks
// ---------------------------------------------------------------------------

/**
 * Inject [[wikilinks]] into markdown content for mentioned note titles.
 *
 * @param {string} content  — full markdown content including frontmatter
 * @param {Array.<{title: string, path: string}>} titleList — all note titles from the graph
 * @param {Object} [opts]
 * @param {string} [opts.selfPath]   — path of the note being written (excluded from matching)
 * @param {boolean} [opts.allOccurrences=false] — link every occurrence, not just the first
 * @returns {{ content: string, injected: string[] }}
 */
function injectWikilinks(content, titleList, opts = {}) {
  if (!content || !titleList || titleList.length === 0) {
    return { content: content || '', injected: [] };
  }
  if (!isAutoLinkEnabled()) {
    return { content, injected: [] };
  }

  // 1. Separate frontmatter from body (never inject into YAML)
  const fmMatch = content.match(/^(---\r?\n[\s\S]*?\r?\n---\r?\n?)/);
  const frontmatter = fmMatch ? fmMatch[1] : '';
  let body = fmMatch ? content.slice(frontmatter.length) : content;

  // 2. Build candidate list: filter, dedupe, sort longest-first
  const candidates = [];
  const seen = new Set();
  for (const entry of titleList) {
    if (!entry.title || entry.title.length < MIN_TITLE_LENGTH) continue;
    if (opts.selfPath && entry.path === opts.selfPath) continue;
    const lower = entry.title.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    candidates.push(entry.title);
  }
  // Sort longest-first so "Auth Strategy" matches before "Auth"
  candidates.sort((a, b) => b.length - a.length);

  // 3. Protect regions that must not be modified:
  //    - Fenced code blocks (```...```)
  //    - Inline code (`...`)
  //    - Existing wikilinks ([[...]])
  //    - Markdown links ([text](url))
  //    - URLs (http://... or https://...)
  //    - Blockquote markers at line start (> )
  const protectedRegions = [];
  const protectPatterns = [
    /```[\s\S]*?```/g,              // fenced code
    /`[^`\n]+`/g,                   // inline code
    /\[\[[^\]]+\]\]/g,             // existing wikilinks
    /\[[^\]]*\]\([^)]*\)/g,       // markdown links
    /https?:\/\/[^\s)>\]]+/g,     // URLs
  ];

  for (const pat of protectPatterns) {
    let m;
    while ((m = pat.exec(body)) !== null) {
      protectedRegions.push({ start: m.index, end: m.index + m[0].length });
    }
  }

  // Merge overlapping protected regions
  protectedRegions.sort((a, b) => a.start - b.start);
  const merged = [];
  for (const r of protectedRegions) {
    if (merged.length > 0 && r.start <= merged[merged.length - 1].end) {
      merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, r.end);
    } else {
      merged.push({ ...r });
    }
  }

  function isProtected(index, length) {
    for (const r of merged) {
      if (index >= r.start && index < r.end) return true;
      if (index + length > r.start && index < r.end) return true;
    }
    return false;
  }

  // 4. For each candidate title, find and replace matches
  const injected = [];
  const allOccurrences = opts.allOccurrences || false;

  for (const title of candidates) {
    // Check if this title is already linked anywhere in the body
    const lcTitle = title.toLowerCase();
    const lcBody = body.toLowerCase();
    if (lcBody.includes(`[[${lcTitle}]]`) || lcBody.includes(`[[${lcTitle}|`)) {
      continue; // already linked
    }

    // Build a regex for the title. Always global so we can skip protected
    // first-match occurrences and still link a later unprotected one.
    // Use lookaround instead of \b to handle titles with non-word chars
    // like "C++ Design Patterns" or "React (Library)" where \b fails.
    const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(?<![\\w])(${escaped})(?![\\w])`, 'gi');

    let matched = false;
    body = body.replace(regex, (match, captured, offset) => {
      if (!allOccurrences && matched) return match;
      if (isProtected(offset, match.length)) return match;
      matched = true;
      return `[[${captured}]]`;
    });

    if (matched) {
      injected.push(title);
      // Update protected regions since offsets shifted.
      // Simple approach: recompute for remaining titles.
      // This is O(titles * patterns) but titles and bodies are small.
      merged.length = 0;
      for (const pat of protectPatterns) {
        pat.lastIndex = 0;
        let m;
        while ((m = pat.exec(body)) !== null) {
          merged.push({ start: m.index, end: m.index + m[0].length });
        }
      }
      merged.sort((a, b) => a.start - b.start);
      const reMerged = [];
      for (const r of merged) {
        if (reMerged.length > 0 && r.start <= reMerged[reMerged.length - 1].end) {
          reMerged[reMerged.length - 1].end = Math.max(reMerged[reMerged.length - 1].end, r.end);
        } else {
          reMerged.push({ ...r });
        }
      }
      merged.length = 0;
      merged.push(...reMerged);
    }
  }

  return {
    content: frontmatter + body,
    injected,
  };
}

// ---------------------------------------------------------------------------
// Related-section injection (semantic connectivity)
// ---------------------------------------------------------------------------

/**
 * Append a "## Related" section with [[wikilinks]] for related notes that are
 * NOT already linked anywhere in the body. Unlike injectWikilinks (which only
 * links titles literally mentioned in the text), this connects notes whose
 * relationship is semantic (FTS/tag), de-orphaning date-titled and atomically
 * named notes. Pure function — no graph/db dependency.
 *
 * @param {string} content — full markdown including frontmatter
 * @param {Array.<{title:string}|string>} related — related note titles
 * @param {Object} [opts]
 * @param {string} [opts.heading='Related'] — section heading text
 * @param {number} [opts.max=5] — max links to add
 * @returns {{ content: string, added: string[] }}
 */
function injectRelatedSection(content, related, opts = {}) {
  if (!content || !related || related.length === 0) {
    return { content: content || '', added: [] };
  }
  if (!isAutoLinkEnabled()) {
    return { content, added: [] };
  }
  const heading = opts.heading || 'Related';
  const max = opts.max || 5;

  // Normalize + dedupe titles (skip too-short titles, same rule as injection)
  const titles = [];
  const seen = new Set();
  for (const r of related) {
    const t = typeof r === 'string' ? r : (r && r.title);
    if (!t || t.length < MIN_TITLE_LENGTH) continue;
    const lc = t.toLowerCase();
    if (seen.has(lc)) continue;
    seen.add(lc);
    titles.push(t);
  }
  if (titles.length === 0) return { content, added: [] };

  // Separate frontmatter (never modify YAML)
  const fmMatch = content.match(/^(---\r?\n[\s\S]*?\r?\n---\r?\n?)/);
  const frontmatter = fmMatch ? fmMatch[1] : '';
  let body = fmMatch ? content.slice(frontmatter.length) : content;

  // Skip titles already linked anywhere in the body
  const lcBody = body.toLowerCase();
  const toAdd = [];
  for (const t of titles) {
    const lc = t.toLowerCase();
    if (lcBody.includes('[[' + lc + ']]') || lcBody.includes('[[' + lc + '|')) continue;
    toAdd.push(t);
    if (toAdd.length >= max) break;
  }
  if (toAdd.length === 0) return { content, added: [] };

  const bullets = toAdd.map((t) => '- [[' + t + ']]').join('\n');

  // If a "## <heading>" section already exists, append bullets under it;
  // otherwise create a new section at the end of the body.
  const esc = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const headingRe = new RegExp('^##\\s+' + esc + '\\s*$', 'mi');
  const hm = body.match(headingRe);
  if (hm) {
    const insertAt = hm.index + hm[0].length;
    body = body.slice(0, insertAt) + '\n' + bullets + body.slice(insertAt);
  } else {
    body = body.replace(/\s*$/, '');
    body += '\n\n## ' + heading + '\n\n' + bullets + '\n';
  }

  return { content: frontmatter + body, added: toAdd };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  injectWikilinks,
  injectRelatedSection,
  isAutoLinkEnabled,
  MIN_TITLE_LENGTH,
};
