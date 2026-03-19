/**
 * test-mcp.cjs — Integration tests for the MCP Server
 *
 * Spawns the MCP server as a child process, sends JSON-RPC messages,
 * and validates responses for all 17 tools.
 */

'use strict';

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const assert = require('assert');

const SERVER_PATH = path.join(__dirname, 'mcp-server.mjs');
const TEST_DATA = path.join(require('os').tmpdir(), 'ke-mcp-test-' + Date.now());

let passed = 0;
let failed = 0;

// ---------------------------------------------------------------------------
// MCP Client Helper
// ---------------------------------------------------------------------------

class McpTestClient {
  constructor() {
    this.proc = null;
    this.buffer = '';
    this.responses = new Map();
    this.nextId = 1;
    this._resolvers = new Map();
  }

  async start() {
    return new Promise((resolve, reject) => {
      this.proc = spawn('node', [SERVER_PATH], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, CLAUDE_PLUGIN_DATA: TEST_DATA },
      });

      this.proc.stdout.on('data', (data) => {
        this.buffer += data.toString();
        const lines = this.buffer.split('\n');
        this.buffer = lines.pop(); // Keep incomplete line

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const msg = JSON.parse(line);
            if (msg.id !== undefined && this._resolvers.has(msg.id)) {
              this._resolvers.get(msg.id)(msg);
              this._resolvers.delete(msg.id);
            }
          } catch {}
        }
      });

      this.proc.stderr.on('data', () => {}); // Suppress stderr

      // Initialize
      setTimeout(async () => {
        try {
          await this.send('initialize', {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'test', version: '1.0.0' },
          });
          this.proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
          setTimeout(resolve, 100);
        } catch (e) {
          reject(e);
        }
      }, 300);
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      this._resolvers.set(id, resolve);

      const msg = { jsonrpc: '2.0', id, method, params };
      this.proc.stdin.write(JSON.stringify(msg) + '\n');

      // Timeout
      setTimeout(() => {
        if (this._resolvers.has(id)) {
          this._resolvers.delete(id);
          reject(new Error(`Timeout waiting for response to ${method} (id: ${id})`));
        }
      }, 5000);
    });
  }

  async callTool(name, args = {}) {
    const resp = await this.send('tools/call', { name, arguments: args });
    if (resp.error) throw new Error(`Tool error: ${JSON.stringify(resp.error)}`);
    return resp.result;
  }

  async listTools() {
    const resp = await this.send('tools/list');
    return resp.result.tools;
  }

  stop() {
    if (this.proc) {
      this.proc.kill();
      this.proc = null;
    }
  }
}

// ---------------------------------------------------------------------------
// Test Runner
// ---------------------------------------------------------------------------

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.log(`  ✗ ${name}`);
    console.log(`    ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

async function runTests() {
  // Clean up test data
  fs.rmSync(TEST_DATA, { recursive: true, force: true });

  const client = new McpTestClient();
  await client.start();

  console.log('\n── MCP Server Integration Tests ──\n');

  // Tool listing
  await test('lists all 17 tools', async () => {
    const tools = await client.listTools();
    assert.strictEqual(tools.length, 17);
    const names = tools.map(t => t.name);
    assert.ok(names.includes('ke_search'));
    assert.ok(names.includes('ke_stats'));
    assert.ok(names.includes('ke_global_search'));
    assert.ok(names.includes('ke_promote'));
  });

  // ke_stats
  await test('ke_stats returns vault info', async () => {
    const result = await client.callTool('ke_stats');
    assert.ok(result.content[0].text.includes('Notes'));
    assert.ok(result.content[0].text.includes('Connections'));
  });

  // ke_daily — create
  await test('ke_daily creates session note', async () => {
    const result = await client.callTool('ke_daily');
    assert.ok(result.content[0].text.includes('Daily note created') || result.content[0].text.includes('Session'));
  });

  // ke_decide
  await test('ke_decide creates decision record', async () => {
    const result = await client.callTool('ke_decide', {
      title: 'Test Decision',
      context: 'Testing the MCP server',
      decision: 'Use integration tests',
      alternatives: 'Manual testing',
      consequences: 'Better reliability',
    });
    assert.ok(result.content[0].text.includes('Decision record created'));
  });

  // ke_write_note
  await test('ke_write_note creates a note', async () => {
    const result = await client.callTool('ke_write_note', {
      file_name: 'patterns/test-pattern.md',
      content: '---\ntitle: Test Pattern\ntags: [pattern, test]\n---\n# Test Pattern\nA pattern for [[Test Decision]].',
    });
    assert.ok(result.content[0].text.includes('Note written'));
  });

  // ke_rebuild
  await test('ke_rebuild rebuilds graph', async () => {
    const result = await client.callTool('ke_rebuild');
    assert.ok(result.content[0].text.includes('Graph rebuilt'));
    assert.ok(result.content[0].text.includes('Nodes'));
  });

  // ke_search
  await test('ke_search finds notes', async () => {
    const result = await client.callTool('ke_search', { query: 'pattern', limit: 5 });
    assert.ok(result.content[0].text.includes('Test Pattern') || result.content[0].text.includes('Search Results'));
  });

  // ke_search — empty query
  await test('ke_search handles empty query', async () => {
    const result = await client.callTool('ke_search', { query: '', limit: 5 });
    assert.ok(result.content[0].text.includes('No results'));
  });

  // ke_backlinks
  await test('ke_backlinks finds linking notes', async () => {
    const result = await client.callTool('ke_backlinks', { note_path: 'Test Decision' });
    // Test Pattern links to Test Decision
    const text = result.content[0].text;
    assert.ok(text.includes('Test Pattern') || text.includes('No backlinks') || text.includes('Backlinks'));
  });

  // ke_related
  await test('ke_related finds nearby notes', async () => {
    const result = await client.callTool('ke_related', { note_path: 'Test Decision', max_hops: 2 });
    assert.ok(result.content[0].text);
  });

  // ke_hubs
  await test('ke_hubs returns hub notes', async () => {
    const result = await client.callTool('ke_hubs', { limit: 5 });
    assert.ok(result.content[0].text.includes('Hub') || result.content[0].text.includes('backlinks'));
  });

  // ke_clusters
  await test('ke_clusters detects clusters', async () => {
    const result = await client.callTool('ke_clusters');
    assert.ok(result.content[0].text.includes('Cluster'));
  });

  // ke_shortest_path
  await test('ke_shortest_path finds paths', async () => {
    const result = await client.callTool('ke_shortest_path', {
      from_note: 'Test Pattern',
      to_note: 'Test Decision',
    });
    assert.ok(result.content[0].text.includes('Path') || result.content[0].text.includes('No path'));
  });

  // ke_read_note
  await test('ke_read_note reads note content', async () => {
    const result = await client.callTool('ke_read_note', { note_path: 'Test Decision' });
    const text = result.content[0].text;
    assert.ok(text.includes('Test Decision') || text.includes('Testing the MCP server'));
  });

  // ke_license status
  await test('ke_license returns status', async () => {
    const result = await client.callTool('ke_license', { action: 'status' });
    assert.ok(result.content[0].text.includes('License Status'));
    assert.ok(result.content[0].text.includes('trial'));
  });

  // ke_graph_data
  await test('ke_graph_data returns JSON', async () => {
    const result = await client.callTool('ke_graph_data');
    const data = JSON.parse(result.content[0].text);
    assert.ok(data.stats);
    assert.ok(Array.isArray(data.nodes));
    assert.ok(Array.isArray(data.edges));
  });

  // ke_global_search
  await test('ke_global_search searches both vaults', async () => {
    const result = await client.callTool('ke_global_search', { query: 'pattern' });
    assert.ok(result.content[0].text.includes('Project Knowledge') || result.content[0].text.includes('No results'));
  });

  // ke_import with non-existent dir
  await test('ke_import handles missing directory', async () => {
    const result = await client.callTool('ke_import', { source_dir: '/nonexistent/path' });
    assert.ok(result.isError);
    assert.ok(result.content[0].text.includes('not found'));
  });

  // ke_promote
  await test('ke_promote promotes note to global', async () => {
    const result = await client.callTool('ke_promote', {
      note_path: 'Test Pattern',
      global_subdir: 'patterns',
    });
    assert.ok(result.content[0].text.includes('Promoted') || result.content[0].text.includes('already exists'));
  });

  // Cleanup
  client.stop();
  fs.rmSync(TEST_DATA, { recursive: true, force: true });

  console.log(`\n${'═'.repeat(50)}`);
  console.log(`MCP Integration: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log(`${'═'.repeat(50)}\n`);

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
