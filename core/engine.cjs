/**
 * engine.cjs — Nelson Knowledge Engine v6
 *
 * Main entry point that initializes all layers, builds the knowledge graph
 * on startup, and exposes a unified API for vault operations.
 */

'use strict';

const path = require('path');
const GraphLayer = require('./graph-layer.cjs');
const SearchLayer = require('./search-layer.cjs');
const fileLayer = require('./file-layer.cjs');

// ---------------------------------------------------------------------------
// KnowledgeEngine Class
// ---------------------------------------------------------------------------

class KnowledgeEngine {
  /**
   * Create a new KnowledgeEngine instance.
   *
   * @param {Object} opts - Configuration options
   * @param {string} opts.vaultPath - Absolute path to the Obsidian vault / markdown directory
   * @param {string} [opts.dbPath] - SQLite database path (default: ':memory:')
   * @param {boolean} [opts.watch] - Enable file watching for live updates (default: false)
   * @param {string[]} [opts.ignore] - Directory names to ignore (default: node_modules, .git, .obsidian, .trash)
   */
  constructor(opts) {
    if (!opts || !opts.vaultPath) {
      throw new Error('KnowledgeEngine requires opts.vaultPath');
    }

    this.vaultPath = path.resolve(opts.vaultPath);
    this.dbPath = opts.dbPath || ':memory:';
    this.watchEnabled = opts.watch || false;
    this.ignoreOpts = opts.ignore ? { ignore: opts.ignore } : {};

    // Initialize layers
    this.graph = new GraphLayer(this.dbPath);
    this.search = new SearchLayer(this.graph.db, this.graph);
    this._watcher = null;
    this._ready = false;
  }

  /**
   * Build the knowledge graph and search index.
   * Call this once after construction, or call rebuild() to refresh.
   *
   * @returns {{ nodeCount: number, edgeCount: number }}
   */
  build() {
    try {
      const result = this.graph.buildGraph(this.vaultPath, this.ignoreOpts);
      this.search.indexVault(this.vaultPath);

      if (this.watchEnabled && !this._watcher) {
        this._startWatcher();
      }

      this._ready = true;
      return result;
    } catch (err) {
      // If database is corrupt, attempt recovery by deleting and rebuilding
      if (err.message && (err.message.includes('database disk image is malformed') ||
          err.message.includes('SQLITE_CORRUPT') ||
          err.message.includes('file is not a database'))) {
        return this._recoverCorruptDatabase();
      }
      throw err;
    }
  }

  /**
   * Recover from a corrupt database by deleting it and rebuilding.
   * @private
   * @returns {{ nodeCount: number, edgeCount: number }}
   */
  _recoverCorruptDatabase() {
    const fs = require('fs');

    // Close current connection
    try { this.graph.close(); } catch {}

    // Delete corrupt DB
    if (this.dbPath !== ':memory:' && fs.existsSync(this.dbPath)) {
      fs.unlinkSync(this.dbPath);
      // Also remove WAL/SHM files
      for (const suffix of ['-wal', '-shm']) {
        const walPath = this.dbPath + suffix;
        if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
      }
    }

    // Reinitialize
    const GraphLayer = require('./graph-layer.cjs');
    const SearchLayer = require('./search-layer.cjs');

    this.graph = new GraphLayer(this.dbPath);
    this.search = new SearchLayer(this.graph.db, this.graph);

    // Rebuild from vault files
    const result = this.graph.buildGraph(this.vaultPath, this.ignoreOpts);
    this.search.indexVault(this.vaultPath);
    this._ready = true;

    return result;
  }

  /**
   * Incremental build: only re-index files that changed since last build.
   * Falls back to full rebuild if >30% of files changed.
   *
   * @returns {{ nodeCount: number, edgeCount: number, mode: string, changedFiles: number }}
   */
  incrementalBuild() {
    const result = this.graph.incrementalBuild(this.vaultPath, this.ignoreOpts);
    if (result.mode !== 'none') {
      this.search.indexVault(this.vaultPath);
    }
    this._ready = true;
    return result;
  }

  /**
   * Rebuild the graph and index from scratch.
   * Alias for build() — clears existing data and rebuilds.
   *
   * @returns {{ nodeCount: number, edgeCount: number }}
   */
  rebuild() {
    return this.build();
  }

  // -------------------------------------------------------------------------
  // File Layer (pass-through)
  // -------------------------------------------------------------------------

  /**
   * List all markdown notes in the vault.
   * @returns {string[]} Absolute file paths
   */
  listNotes() {
    return fileLayer.listNotes(this.vaultPath, this.ignoreOpts);
  }

  /**
   * Read and parse a single note.
   * @param {string} filePath - Absolute or vault-relative path
   * @returns {Object} Parsed note with frontmatter, wikilinks, etc.
   */
  readNote(filePath) {
    const resolved = filePath.startsWith('/')
      ? filePath
      : path.join(this.vaultPath, filePath);
    return fileLayer.readNote(resolved);
  }

  /**
   * Write a note to the vault.
   * @param {string} filePath - Absolute or vault-relative path
   * @param {string} content - Full file content
   */
  writeNote(filePath, content) {
    const resolved = filePath.startsWith('/')
      ? filePath
      : path.join(this.vaultPath, filePath);
    fileLayer.writeNote(resolved, content);
  }

  // -------------------------------------------------------------------------
  // Graph Layer (delegated)
  // -------------------------------------------------------------------------

  /**
   * Get backlinks pointing to a note.
   * @param {string} notePath - Absolute path
   * @returns {Array}
   */
  getBacklinks(notePath) {
    return this.graph.getBacklinks(notePath);
  }

  /**
   * Get outgoing links from a note.
   * @param {string} notePath - Absolute path
   * @returns {Array}
   */
  getOutlinks(notePath) {
    return this.graph.getOutlinks(notePath);
  }

  /**
   * Find hub notes (most linked-to).
   * @param {number} [limit=10]
   * @returns {Array}
   */
  findHubs(limit) {
    return this.graph.findHubs(limit);
  }

  /**
   * BFS shortest path between two notes.
   * @param {string} fromPath
   * @param {string} toPath
   * @returns {Array|null}
   */
  shortestPath(fromPath, toPath) {
    return this.graph.shortestPath(fromPath, toPath);
  }

  /**
   * Get related notes within N hops.
   * @param {string} notePath
   * @param {number} [maxHops=2]
   * @returns {Array}
   */
  getRelated(notePath, maxHops) {
    return this.graph.getRelated(notePath, maxHops);
  }

  /**
   * Find orphan notes (no links in or out).
   * @returns {Array}
   */
  getOrphans() {
    return this.graph.getOrphans();
  }

  /**
   * Detect clusters of connected notes.
   * @returns {Array<Array>}
   */
  getClusters() {
    return this.graph.getClusters();
  }

  // -------------------------------------------------------------------------
  // Search Layer (delegated)
  // -------------------------------------------------------------------------

  /**
   * Full-text search with graph-boosted ranking.
   * @param {string} query - FTS5 query
   * @param {Object} [opts] - { limit: number }
   * @returns {Array}
   */
  searchNotes(query, opts) {
    return this.search.search(query, opts);
  }

  /**
   * Search by tag.
   * @param {string} tag
   * @param {Object} [opts]
   * @returns {Array}
   */
  searchByTag(tag, opts) {
    return this.search.searchByTag(tag, opts);
  }

  /**
   * Tiered search: L0 titles, L1 summaries, L2 full content.
   * @param {string} query
   * @param {Object} [opts]
   * @returns {{ L0: Array, L1: Array, L2: Array }}
   */
  tieredSearch(query, opts) {
    return this.search.tieredSearch(query, opts);
  }

  /**
   * Search with context snippets showing matching lines.
   * @param {string} query
   * @param {Object} [opts]
   * @returns {Array}
   */
  searchWithSnippets(query, opts) {
    return this.search.searchWithSnippets(query, opts);
  }

  // -------------------------------------------------------------------------
  // Stats & Utilities
  // -------------------------------------------------------------------------

  /**
   * Get vault statistics.
   * @returns {{ nodeCount: number, edgeCount: number, orphanCount: number, clusterCount: number }}
   */
  getStats() {
    const nodeCount = this.graph.db.prepare('SELECT COUNT(*) AS c FROM nodes').get().c;
    const edgeCount = this.graph.db.prepare('SELECT COUNT(*) AS c FROM edges').get().c;
    const orphanCount = this.getOrphans().length;
    const clusterCount = this.getClusters().length;

    return { nodeCount, edgeCount, orphanCount, clusterCount };
  }

  /**
   * Close the engine and release resources.
   */
  close() {
    if (this._watcher) {
      this._watcher.close();
      this._watcher = null;
    }
    this.graph.close();
    this._ready = false;
  }

  // -------------------------------------------------------------------------
  // File Watcher (private)
  // -------------------------------------------------------------------------

  /**
   * Start watching the vault for changes and rebuild on modification.
   * @private
   */
  _startWatcher() {
    this._watcher = fileLayer.watchNotes(this.vaultPath, (eventType, filePath) => {
      // Rebuild the full graph on any change.
      // For large vaults, a smarter incremental update would be better,
      // but full rebuild is correct and simple for v6 Phase 1.
      this.build();
    }, { debounceMs: 500 });
  }
}

module.exports = KnowledgeEngine;
