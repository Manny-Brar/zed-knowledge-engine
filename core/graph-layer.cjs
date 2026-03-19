/**
 * graph-layer.cjs — SQLite Knowledge Graph Layer
 *
 * Creates and manages a knowledge graph in SQLite with nodes (notes) and
 * edges (wikilinks). Supports backlinks, outlinks, hub detection, BFS
 * shortest path, N-hop related notes, orphan detection, and clustering.
 */

'use strict';

const path = require('path');
const Database = require('better-sqlite3');
const fileLayer = require('./file-layer.cjs');

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS nodes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    path        TEXT    UNIQUE NOT NULL,
    title       TEXT    NOT NULL,
    type        TEXT    DEFAULT 'note',
    tags        TEXT    DEFAULT '[]',
    word_count  INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS edges (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id   INTEGER NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    target_id   INTEGER NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    link_text   TEXT    DEFAULT '',
    context     TEXT    DEFAULT ''
  );

  CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source_id);
  CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target_id);
  CREATE INDEX IF NOT EXISTS idx_nodes_path   ON nodes(path);
`;

// ---------------------------------------------------------------------------
// GraphLayer Class
// ---------------------------------------------------------------------------

class GraphLayer {
  /**
   * @param {string} dbPath - Path to the SQLite database file (use ':memory:' for in-memory)
   */
  constructor(dbPath) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.exec(SCHEMA_SQL);

    // Prepare frequently-used statements
    this._stmts = {
      insertNode: this.db.prepare(`
        INSERT OR REPLACE INTO nodes (path, title, type, tags, word_count)
        VALUES (@path, @title, @type, @tags, @wordCount)
      `),
      insertEdge: this.db.prepare(`
        INSERT INTO edges (source_id, target_id, link_text, context)
        VALUES (@sourceId, @targetId, @linkText, @context)
      `),
      getNodeByPath: this.db.prepare('SELECT * FROM nodes WHERE path = ?'),
      getNodeById: this.db.prepare('SELECT * FROM nodes WHERE id = ?'),
      getAllNodes: this.db.prepare('SELECT * FROM nodes'),
      getOutlinks: this.db.prepare(`
        SELECT e.*, n.path AS target_path, n.title AS target_title
        FROM edges e
        JOIN nodes n ON n.id = e.target_id
        WHERE e.source_id = ?
      `),
      getBacklinks: this.db.prepare(`
        SELECT e.*, n.path AS source_path, n.title AS source_title
        FROM edges e
        JOIN nodes n ON n.id = e.source_id
        WHERE e.target_id = ?
      `),
      backlinkCount: this.db.prepare(`
        SELECT n.id, n.path, n.title, COUNT(e.id) AS backlink_count
        FROM nodes n
        LEFT JOIN edges e ON e.target_id = n.id
        GROUP BY n.id
        ORDER BY backlink_count DESC
      `),
      orphans: this.db.prepare(`
        SELECT n.*
        FROM nodes n
        LEFT JOIN edges e_out ON e_out.source_id = n.id
        LEFT JOIN edges e_in  ON e_in.target_id  = n.id
        WHERE e_out.id IS NULL AND e_in.id IS NULL
      `),
      clearEdges: this.db.prepare('DELETE FROM edges'),
      clearNodes: this.db.prepare('DELETE FROM nodes'),
    };
  }

  /**
   * Build the full knowledge graph from a vault directory.
   * Scans all .md files, creates nodes, resolves wikilinks into edges.
   *
   * @param {string} vaultPath - Root directory of the vault
   * @param {Object} [opts] - Options passed to listNotes
   * @returns {{ nodeCount: number, edgeCount: number }}
   */
  buildGraph(vaultPath, opts = {}) {
    const resolvedVault = path.resolve(vaultPath);
    const files = fileLayer.listNotes(resolvedVault, opts);

    // Clear existing data
    this.db.exec('DELETE FROM edges');
    this.db.exec('DELETE FROM nodes');

    // Phase 1: Create all nodes
    const nodesByPath = new Map();
    const nodesByName = new Map(); // basename -> node path (for wikilink resolution)

    const insertNodes = this.db.transaction(() => {
      for (const filePath of files) {
        const note = fileLayer.readNote(filePath);
        const tags = note.frontmatter.tags || [];
        const type = note.frontmatter.type || 'note';

        this._stmts.insertNode.run({
          path: note.path,
          title: note.title,
          type,
          tags: JSON.stringify(Array.isArray(tags) ? tags : [tags]),
          wordCount: note.wordCount,
        });

        const node = this._stmts.getNodeByPath.get(note.path);
        nodesByPath.set(note.path, node);

        // Index by basename (without extension) for wikilink resolution
        const basename = path.basename(note.path, '.md');
        nodesByName.set(basename.toLowerCase(), note.path);

        // Also index by title
        if (note.title) {
          nodesByName.set(note.title.toLowerCase(), note.path);
        }
      }
    });
    insertNodes();

    // Phase 2: Create edges from wikilinks
    const insertEdges = this.db.transaction(() => {
      for (const filePath of files) {
        const note = fileLayer.readNote(filePath);
        const sourceNode = nodesByPath.get(note.path);
        if (!sourceNode) continue;

        for (const link of note.wikilinks) {
          // Resolve target: strip heading/block refs for matching
          const targetName = link.target.split('#')[0].split('^')[0].trim();
          const targetPath = nodesByName.get(targetName.toLowerCase());

          if (!targetPath) continue; // Unresolved link — skip

          const targetNode = nodesByPath.get(targetPath);
          if (!targetNode || targetNode.id === sourceNode.id) continue; // No self-links

          // Extract surrounding context (line containing the link)
          const lines = note.body.split('\n');
          const contextLine = lines.find(l => l.includes(link.raw)) || '';

          this._stmts.insertEdge.run({
            sourceId: sourceNode.id,
            targetId: targetNode.id,
            linkText: link.alias || link.target,
            context: contextLine.trim().slice(0, 200),
          });
        }
      }
    });
    insertEdges();

    const nodeCount = this.db.prepare('SELECT COUNT(*) AS c FROM nodes').get().c;
    const edgeCount = this.db.prepare('SELECT COUNT(*) AS c FROM edges').get().c;

    return { nodeCount, edgeCount };
  }

  /**
   * Get all backlinks pointing TO a note.
   *
   * @param {string} notePath - Absolute path of the target note
   * @returns {Array<{ source_path: string, source_title: string, link_text: string, context: string }>}
   */
  getBacklinks(notePath) {
    const node = this._stmts.getNodeByPath.get(path.resolve(notePath));
    if (!node) return [];
    return this._stmts.getBacklinks.all(node.id);
  }

  /**
   * Get all outlinks FROM a note.
   *
   * @param {string} notePath - Absolute path of the source note
   * @returns {Array<{ target_path: string, target_title: string, link_text: string, context: string }>}
   */
  getOutlinks(notePath) {
    const node = this._stmts.getNodeByPath.get(path.resolve(notePath));
    if (!node) return [];
    return this._stmts.getOutlinks.all(node.id);
  }

  /**
   * Find hub notes — notes with the most backlinks (most linked-to).
   *
   * @param {number} [limit=10] - Number of hubs to return
   * @returns {Array<{ id: number, path: string, title: string, backlink_count: number }>}
   */
  findHubs(limit = 10) {
    return this._stmts.backlinkCount.all().slice(0, limit);
  }

  /**
   * Find shortest path between two notes using BFS on the undirected graph.
   *
   * @param {string} fromPath - Absolute path of source note
   * @param {string} toPath - Absolute path of target note
   * @returns {Array<{ id: number, path: string, title: string }>|null} Path of nodes, or null if unreachable
   */
  shortestPath(fromPath, toPath) {
    const fromNode = this._stmts.getNodeByPath.get(path.resolve(fromPath));
    const toNode = this._stmts.getNodeByPath.get(path.resolve(toPath));
    if (!fromNode || !toNode) return null;
    if (fromNode.id === toNode.id) return [fromNode];

    // Build adjacency list (undirected)
    const edges = this.db.prepare('SELECT source_id, target_id FROM edges').all();
    const adj = new Map();

    for (const e of edges) {
      if (!adj.has(e.source_id)) adj.set(e.source_id, []);
      if (!adj.has(e.target_id)) adj.set(e.target_id, []);
      adj.get(e.source_id).push(e.target_id);
      adj.get(e.target_id).push(e.source_id);
    }

    // BFS
    const visited = new Set([fromNode.id]);
    const parent = new Map();
    const queue = [fromNode.id];

    while (queue.length > 0) {
      const current = queue.shift();

      if (current === toNode.id) {
        // Reconstruct path
        const pathIds = [];
        let node = toNode.id;
        while (node !== undefined) {
          pathIds.unshift(node);
          node = parent.get(node);
        }
        return pathIds.map(id => this._stmts.getNodeById.get(id));
      }

      const neighbors = adj.get(current) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          parent.set(neighbor, current);
          queue.push(neighbor);
        }
      }
    }

    return null; // Unreachable
  }

  /**
   * Get related notes within N hops of a given note (undirected).
   *
   * @param {string} notePath - Absolute path of the note
   * @param {number} [maxHops=2] - Maximum number of hops
   * @returns {Array<{ node: Object, distance: number }>}
   */
  getRelated(notePath, maxHops = 2) {
    const startNode = this._stmts.getNodeByPath.get(path.resolve(notePath));
    if (!startNode) return [];

    // Build adjacency list (undirected)
    const edges = this.db.prepare('SELECT source_id, target_id FROM edges').all();
    const adj = new Map();

    for (const e of edges) {
      if (!adj.has(e.source_id)) adj.set(e.source_id, []);
      if (!adj.has(e.target_id)) adj.set(e.target_id, []);
      adj.get(e.source_id).push(e.target_id);
      adj.get(e.target_id).push(e.source_id);
    }

    // BFS with distance tracking
    const visited = new Map([[startNode.id, 0]]);
    const queue = [startNode.id];
    const results = [];

    while (queue.length > 0) {
      const current = queue.shift();
      const dist = visited.get(current);

      if (dist > 0) {
        results.push({
          node: this._stmts.getNodeById.get(current),
          distance: dist,
        });
      }

      if (dist >= maxHops) continue;

      const neighbors = adj.get(current) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          visited.set(neighbor, dist + 1);
          queue.push(neighbor);
        }
      }
    }

    return results.sort((a, b) => a.distance - b.distance);
  }

  /**
   * Find orphan notes — notes with no incoming or outgoing links.
   *
   * @returns {Array<Object>} Array of orphan node records
   */
  getOrphans() {
    return this._stmts.orphans.all();
  }

  /**
   * Detect clusters of connected notes using union-find.
   * Returns groups of notes that are connected to each other.
   *
   * @returns {Array<Array<Object>>} Array of clusters, each an array of nodes
   */
  getClusters() {
    const nodes = this._stmts.getAllNodes.all();
    const edges = this.db.prepare('SELECT source_id, target_id FROM edges').all();

    if (nodes.length === 0) return [];

    // Union-Find
    const parentMap = new Map();
    const rankMap = new Map();

    for (const n of nodes) {
      parentMap.set(n.id, n.id);
      rankMap.set(n.id, 0);
    }

    function find(x) {
      if (parentMap.get(x) !== x) {
        parentMap.set(x, find(parentMap.get(x))); // path compression
      }
      return parentMap.get(x);
    }

    function union(a, b) {
      const ra = find(a);
      const rb = find(b);
      if (ra === rb) return;
      if (rankMap.get(ra) < rankMap.get(rb)) {
        parentMap.set(ra, rb);
      } else if (rankMap.get(ra) > rankMap.get(rb)) {
        parentMap.set(rb, ra);
      } else {
        parentMap.set(rb, ra);
        rankMap.set(ra, rankMap.get(ra) + 1);
      }
    }

    for (const e of edges) {
      union(e.source_id, e.target_id);
    }

    // Group nodes by root
    const clusters = new Map();
    for (const n of nodes) {
      const root = find(n.id);
      if (!clusters.has(root)) clusters.set(root, []);
      clusters.get(root).push(n);
    }

    // Sort: largest cluster first
    return Array.from(clusters.values()).sort((a, b) => b.length - a.length);
  }

  /**
   * Get the backlink count for a specific node (used by search layer).
   *
   * @param {number} nodeId - Node ID
   * @returns {number}
   */
  getBacklinkCount(nodeId) {
    const row = this.db.prepare(
      'SELECT COUNT(*) AS c FROM edges WHERE target_id = ?'
    ).get(nodeId);
    return row ? row.c : 0;
  }

  /**
   * Look up a node by its path.
   *
   * @param {string} notePath - Absolute path
   * @returns {Object|undefined}
   */
  getNodeByPath(notePath) {
    return this._stmts.getNodeByPath.get(path.resolve(notePath));
  }

  /**
   * Close the database connection.
   */
  close() {
    this.db.close();
  }
}

module.exports = GraphLayer;
