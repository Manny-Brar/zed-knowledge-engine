/**
 * search-layer.cjs — Full-Text Search with Graph Boost
 *
 * FTS5 virtual table on note content with graph-boosted ranking.
 * Backlink count amplifies search relevance: score * (1 + 0.1 * backlink_count).
 * Supports tiered search returning L0 titles, L1 summaries, L2 full content.
 */

'use strict';

const path = require('path');
const fileLayer = require('./file-layer.cjs');

// ---------------------------------------------------------------------------
// SearchLayer Class
// ---------------------------------------------------------------------------

class SearchLayer {
  /**
   * @param {import('better-sqlite3').Database} db - Shared SQLite database (from GraphLayer)
   * @param {import('./graph-layer.cjs')} graphLayer - GraphLayer instance for backlink counts
   */
  constructor(db, graphLayer) {
    this.db = db;
    this.graph = graphLayer;
    this._initFTS();
  }

  /**
   * Initialize the FTS5 virtual table and populate it.
   * @private
   */
  _initFTS() {
    // Create FTS5 table if it doesn't exist
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
        title,
        body,
        tags,
        content='',
        contentless_delete=1,
        tokenize='porter unicode61'
      );
    `);

    // Prepare statements
    this._stmts = {
      insertFTS: this.db.prepare(`
        INSERT INTO notes_fts (rowid, title, body, tags)
        VALUES (@rowid, @title, @body, @tags)
      `),
      deleteFTS: this.db.prepare(`
        DELETE FROM notes_fts WHERE rowid = @rowid
      `),
      searchRaw: this.db.prepare(`
        SELECT rowid, rank
        FROM notes_fts
        WHERE notes_fts MATCH ?
        ORDER BY rank
        LIMIT ?
      `),
      searchByTag: this.db.prepare(`
        SELECT rowid, rank
        FROM notes_fts
        WHERE tags MATCH ?
        ORDER BY rank
        LIMIT ?
      `),
      getNode: this.db.prepare('SELECT * FROM nodes WHERE id = ?'),
    };
  }

  /**
   * Index all notes from the vault into the FTS5 table.
   * Should be called after GraphLayer.buildGraph().
   *
   * @param {string} vaultPath - Root directory of the vault
   */
  indexVault(vaultPath) {
    // Clear existing FTS data
    this.db.exec('DELETE FROM notes_fts');

    const files = fileLayer.listNotes(path.resolve(vaultPath));

    const insertAll = this.db.transaction(() => {
      for (const filePath of files) {
        const note = fileLayer.readNote(filePath);
        const node = this.graph.getNodeByPath(filePath);
        if (!node) continue;

        const tags = note.frontmatter.tags || [];
        const tagStr = Array.isArray(tags) ? tags.join(' ') : String(tags);

        this._stmts.insertFTS.run({
          rowid: node.id,
          title: note.title || '',
          body: note.body || '',
          tags: tagStr,
        });
      }
    });
    insertAll();
  }

  /**
   * Search notes with graph-boosted ranking.
   * Score formula: fts_rank * (1 + 0.1 * backlink_count)
   * Lower rank = better match (FTS5 returns negative ranks, more negative = better).
   *
   * @param {string} query - FTS5 search query
   * @param {Object} [opts] - Options
   * @param {number} [opts.limit=20] - Max results
   * @returns {Array<{ node: Object, ftsRank: number, backlinkCount: number, boostedScore: number }>}
   */
  search(query, opts = {}) {
    const limit = opts.limit || 20;

    if (!query || !query.trim()) return [];

    // Sanitize query for FTS5: wrap terms in quotes if they contain special chars
    const safeQuery = this._sanitizeQuery(query);

    let rows;
    try {
      rows = this._stmts.searchRaw.all(safeQuery, limit * 3); // overfetch for re-ranking
    } catch (err) {
      // FTS5 query syntax error — try as plain terms
      if (this.debug) {
        console.error(`[search] FTS5 query failed: "${safeQuery}" — ${err.message}. Falling back to plain terms.`);
      }
      const plainQuery = query.replace(/[^\w\s]/g, ' ').trim();
      if (!plainQuery) return [];
      try {
        rows = this._stmts.searchRaw.all(plainQuery, limit * 3);
      } catch (fallbackErr) {
        if (this.debug) {
          console.error(`[search] Fallback query also failed: "${plainQuery}" — ${fallbackErr.message}`);
        }
        return [];
      }
    }

    // Apply graph boost
    const results = rows.map(row => {
      const node = this._stmts.getNode.get(row.rowid);
      if (!node) return null;

      const backlinkCount = this.graph.getBacklinkCount(node.id);
      // FTS5 rank is negative (more negative = better match)
      // We negate it so higher = better, then apply boost
      const ftsScore = -row.rank;
      const boostedScore = ftsScore * (1 + 0.1 * backlinkCount);

      return {
        node,
        ftsRank: row.rank,
        backlinkCount,
        boostedScore,
      };
    }).filter(Boolean);

    // Sort by boosted score descending (higher = better)
    results.sort((a, b) => b.boostedScore - a.boostedScore);

    return results.slice(0, limit);
  }

  /**
   * Search notes by tag.
   *
   * @param {string} tag - Tag to search for
   * @param {Object} [opts] - Options
   * @param {number} [opts.limit=20] - Max results
   * @returns {Array<{ node: Object, ftsRank: number }>}
   */
  searchByTag(tag, opts = {}) {
    const limit = opts.limit || 20;
    if (!tag || !tag.trim()) return [];

    const safeTag = tag.replace(/[^\w\s-]/g, '').trim();
    if (!safeTag) return [];

    let rows;
    try {
      rows = this._stmts.searchByTag.all(safeTag, limit);
    } catch {
      return [];
    }

    return rows.map(row => {
      const node = this._stmts.getNode.get(row.rowid);
      if (!node) return null;
      return { node, ftsRank: row.rank };
    }).filter(Boolean);
  }

  /**
   * Tiered search returning progressively more detail.
   *
   * L0: titles only (cheapest — for autocomplete, quick scans)
   * L1: titles + first 200 chars of body (summaries)
   * L2: titles + full content (expensive — for deep retrieval)
   *
   * @param {string} query - FTS5 search query
   * @param {Object} [opts] - Options
   * @param {number} [opts.limit=20] - Max results
   * @returns {{ L0: Array<{ id: number, title: string, score: number }>, L1: Array<{ id: number, title: string, summary: string, score: number }>, L2: Array<{ id: number, title: string, content: string, path: string, score: number }> }}
   */
  tieredSearch(query, opts = {}) {
    const results = this.search(query, opts);

    const L0 = results.map(r => ({
      id: r.node.id,
      title: r.node.title,
      score: r.boostedScore,
    }));

    const L1 = results.map(r => {
      let summary = '';
      try {
        const note = fileLayer.readNote(r.node.path);
        summary = note.body.replace(/\s+/g, ' ').trim().slice(0, 200);
      } catch {
        summary = '';
      }
      return {
        id: r.node.id,
        title: r.node.title,
        summary,
        score: r.boostedScore,
      };
    });

    const L2 = results.map(r => {
      let content = '';
      try {
        const note = fileLayer.readNote(r.node.path);
        content = note.body;
      } catch {
        content = '';
      }
      return {
        id: r.node.id,
        title: r.node.title,
        content,
        path: r.node.path,
        score: r.boostedScore,
      };
    });

    return { L0, L1, L2 };
  }

  /**
   * Search with context snippets showing matching lines.
   * Returns the lines containing query terms with surrounding context.
   *
   * @param {string} query - Search query
   * @param {Object} [opts]
   * @param {number} [opts.limit=10] - Max results
   * @param {number} [opts.snippetLines=2] - Lines of context around each match
   * @returns {Array<{ node: Object, score: number, snippets: string[] }>}
   */
  searchWithSnippets(query, opts = {}) {
    const limit = opts.limit || 10;
    const snippetLines = opts.snippetLines || 2;
    const results = this.search(query, { limit });

    // Extract search terms for matching
    const terms = query
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 2);

    return results.map(r => {
      const snippets = [];
      try {
        const note = fileLayer.readNote(r.node.path);
        const lines = note.body.split('\n');

        for (let i = 0; i < lines.length; i++) {
          const lineLower = lines[i].toLowerCase();
          const hasMatch = terms.some(term => lineLower.includes(term));

          if (hasMatch) {
            // Gather context window
            const start = Math.max(0, i - snippetLines);
            const end = Math.min(lines.length - 1, i + snippetLines);
            const snippet = lines.slice(start, end + 1).join('\n').trim();
            if (snippet && snippets.length < 3) { // Max 3 snippets per note
              snippets.push(snippet);
            }
            // Skip past this context window
            i = end;
          }
        }
      } catch {}

      return {
        node: r.node,
        score: r.boostedScore,
        backlinkCount: r.backlinkCount,
        contextSummary: r.node.context_summary || '',
        snippets,
      };
    });
  }

  /**
   * Sanitize a user query for FTS5.
   * Wraps each term to prevent syntax errors.
   *
   * @private
   * @param {string} query
   * @returns {string}
   */
  _sanitizeQuery(query) {
    // If it already looks like an FTS5 query (has operators), validate and pass through
    if (/\b(AND|OR|NOT|NEAR)\b/.test(query) || query.includes('"')) {
      // Reject bare operators with no real terms (e.g. "NOT" alone, "AND OR")
      const stripped = query.replace(/\b(AND|OR|NOT|NEAR(\/\d+)?)\b/g, '').replace(/[^\w*]/g, ' ').trim();
      if (!stripped) {
        // No actual search terms — fall through to normal sanitization
      } else {
        // Reject NEAR with excessive distance (> 1000)
        const nearMatch = query.match(/\bNEAR\/(\d+)\b/);
        if (nearMatch && parseInt(nearMatch[1]) > 1000) {
          // Cap NEAR distance — fall through to normal sanitization
        } else {
          return query;
        }
      }
    }

    // Split into terms and join with implicit AND
    const terms = query
      .replace(/[^\w\s*]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 0);

    if (terms.length === 0) return query;
    if (terms.length === 1) return terms[0];

    return terms.join(' ');
  }
}

module.exports = SearchLayer;
