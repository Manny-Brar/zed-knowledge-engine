/**
 * test-mcp.cjs — Integration tests for the Slim MCP Server (4 tools)
 *
 * Tests: zed_search, zed_read_note, zed_write_note, zed_decide
 */

'use strict';

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const assert = require('assert');

const SERVER_PATH = path.join(__dirname, 'mcp-server.mjs');
const TEST_DATA = path.join(require('os').tmpdir(), 'zed-mcp-test-' + Date.now());

let passed = 0;
let failed = 0;

// ---------------------------------------------------------------------------
// MCP Client
// ---------------------------------------------------------------------------

class McpTestClient {
  constructor() {
    this.proc = null;
    this.buffer = '';
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
        this.buffer = lines.pop();
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

      this.proc.stderr.on('data', () => {});

      setTimeout(async () => {
        try {
          await this.send('initialize', {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'test', version: '1.0.0' },
          });
          this.proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
          setTimeout(resolve, 100);
        } catch (e) { reject(e); }
      }, 300);
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      this._resolvers.set(id, resolve);
      this.proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
      setTimeout(() => {
        if (this._resolvers.has(id)) {
          this._resolvers.delete(id);
          reject(new Error(`Timeout: ${method}`));
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
    if (this.proc) { this.proc.kill(); this.proc = null; }
  }
}

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  \u2713 ${name}`);
  } catch (err) {
    failed++;
    console.log(`  \u2717 ${name}: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

async function runTests() {
  fs.rmSync(TEST_DATA, { recursive: true, force: true });

  const client = new McpTestClient();
  await client.start();

  console.log('\n── MCP Server Tests (Slim: 4 tools) ──\n');

  // Tool listing
  await test('lists exactly 4 tools', async () => {
    const tools = await client.listTools();
    assert.strictEqual(tools.length, 4, `Expected 4, got ${tools.length}: ${tools.map(t => t.name).join(', ')}`);
    const names = tools.map(t => t.name).sort();
    assert.deepStrictEqual(names, ['zed_decide', 'zed_read_note', 'zed_search', 'zed_write_note']);
  });

  // zed_write_note — create test data first
  await test('zed_write_note creates a note', async () => {
    const result = await client.callTool('zed_write_note', {
      file_name: 'patterns/test-pattern.md',
      content: '---\ntitle: "Test Pattern"\ntags: [pattern, test]\n---\n# Test Pattern\nA reusable pattern for [[API Design]].',
    });
    assert.ok(result.content[0].text.includes('Note written'));
  });

  await test('zed_write_note creates second note', async () => {
    const result = await client.callTool('zed_write_note', {
      file_name: 'decisions/api-design.md',
      content: '---\ntitle: "API Design"\ntags: [decision, api]\n---\n# API Design\nWe chose REST.',
    });
    assert.ok(result.content[0].text.includes('Note written'));
  });

  // zed_decide — structured ADR
  await test('zed_decide creates decision record', async () => {
    const result = await client.callTool('zed_decide', {
      title: 'Use SQLite for storage',
      context: 'Need embedded database',
      decision: 'SQLite via better-sqlite3',
      alternatives: 'PostgreSQL, LevelDB',
      consequences: 'No server needed, single file',
    });
    assert.ok(result.content[0].text.includes('Decision recorded'));
  });

  // zed_search
  await test('zed_search finds notes by content', async () => {
    const result = await client.callTool('zed_search', { query: 'pattern', limit: 5 });
    assert.ok(result.content[0].text.includes('Test Pattern'));
  });

  await test('zed_search returns no results for gibberish', async () => {
    const result = await client.callTool('zed_search', { query: 'xyznonexistent999', limit: 5 });
    assert.ok(result.content[0].text.includes('No results'));
  });

  await test('zed_search finds decision records', async () => {
    const result = await client.callTool('zed_search', { query: 'SQLite', limit: 5 });
    assert.ok(result.content[0].text.includes('SQLite'));
  });

  await test('zed_search returns snippets', async () => {
    const result = await client.callTool('zed_search', { query: 'reusable pattern', limit: 5 });
    const text = result.content[0].text;
    assert.ok(text.includes('Snippet:'), `Expected "Snippet:" in results: ${text}`);
    assert.ok(text.includes('reusable pattern'), `Expected snippet to contain matched text: ${text}`);
  });

  // zed_read_note
  await test('zed_read_note reads by title', async () => {
    const result = await client.callTool('zed_read_note', { note_path: 'Test Pattern' });
    const text = result.content[0].text;
    assert.ok(text.includes('Test Pattern'));
    assert.ok(text.includes('reusable pattern'));
  });

  await test('zed_read_note reads by relative path', async () => {
    const result = await client.callTool('zed_read_note', { note_path: 'decisions/api-design.md' });
    assert.ok(result.content[0].text.includes('API Design'));
  });

  await test('zed_read_note errors on missing note', async () => {
    const result = await client.callTool('zed_read_note', { note_path: 'Nonexistent Note' });
    assert.ok(result.isError);
    assert.ok(result.content[0].text.includes('not found'));
  });

  // zed_write_note — update existing
  await test('zed_write_note overwrites existing note', async () => {
    const result = await client.callTool('zed_write_note', {
      file_name: 'patterns/test-pattern.md',
      content: '---\ntitle: "Test Pattern Updated"\ntags: [pattern, test, updated]\n---\n# Test Pattern Updated\nNow with more detail.',
    });
    assert.ok(result.content[0].text.includes('Note written'));

    // Verify update
    const read = await client.callTool('zed_read_note', { note_path: 'patterns/test-pattern.md' });
    assert.ok(read.content[0].text.includes('Updated'));
  });

  // ---------------------------------------------------------------------------
  // Wikilink suggestion tests
  // ---------------------------------------------------------------------------

  await test('zed_write_note suggests wikilinks for mentioned titles', async () => {
    // "API Design" already exists as a note title from earlier test
    const result = await client.callTool('zed_write_note', {
      file_name: 'research/api-research.md',
      content: '---\ntitle: "API Research"\ntags: [research, api]\n---\n# API Research\nWe looked at API Design patterns and considered alternatives.',
    });
    const text = result.content[0].text;
    assert.ok(text.includes('Suggested wikilinks'), `Expected "Suggested wikilinks" in: ${text}`);
    assert.ok(text.includes('[[API Design]]'), `Expected "[[API Design]]" in: ${text}`);
  });

  // ---------------------------------------------------------------------------
  // Duplicate detection tests
  // ---------------------------------------------------------------------------

  await test('zed_write_note warns about potential duplicates', async () => {
    // Create a note with title "Auth Architecture"
    await client.callTool('zed_write_note', {
      file_name: 'architecture/auth-architecture.md',
      content: '---\ntitle: "Auth Architecture"\ntags: [architecture, auth]\n---\n# Auth Architecture\nHow authentication works in the system.',
    });

    // Now try to write a note with a very similar title
    const result = await client.callTool('zed_write_note', {
      file_name: 'architecture/authentication-architecture.md',
      content: '---\ntitle: "Authentication Architecture"\ntags: [architecture, auth]\n---\n# Authentication Architecture\nDetailed auth architecture overview.',
    });
    const text = result.content[0].text;
    assert.ok(text.includes('Note written'), `Expected "Note written" in: ${text}`);
    assert.ok(text.includes('Possible duplicate'), `Expected "Possible duplicate" in: ${text}`);
    assert.ok(text.includes('Auth Architecture'), `Expected "Auth Architecture" in duplicate warning: ${text}`);
  });

  // ---------------------------------------------------------------------------
  // Edge case tests: error handling hardening
  // ---------------------------------------------------------------------------

  // zed_search with empty query
  await test('zed_search rejects empty query', async () => {
    const result = await client.callTool('zed_search', { query: '   ', limit: 5 });
    assert.ok(result.isError, 'Expected isError to be true');
    assert.ok(result.content[0].text.includes('empty'), `Expected "empty" in: ${result.content[0].text}`);
  });

  // zed_read_note with non-existent note (should return error, not crash)
  await test('zed_read_note returns error for non-existent note', async () => {
    const result = await client.callTool('zed_read_note', { note_path: 'this-note-does-not-exist-ever.md' });
    assert.ok(result.isError, 'Expected isError to be true');
    assert.ok(result.content[0].text.includes('not found'), `Expected "not found" in: ${result.content[0].text}`);
  });

  // zed_write_note with empty content
  await test('zed_write_note rejects empty content', async () => {
    const result = await client.callTool('zed_write_note', { file_name: 'test-empty.md', content: '' });
    assert.ok(result.isError, 'Expected isError to be true');
    assert.ok(result.content[0].text.includes('empty'), `Expected "empty" in: ${result.content[0].text}`);
  });

  // zed_write_note with path traversal attempt
  await test('zed_write_note blocks path traversal', async () => {
    const result = await client.callTool('zed_write_note', {
      file_name: '../../../etc/hosts',
      content: '---\ntitle: "Evil"\n---\nmalicious content',
    });
    assert.ok(result.isError, 'Expected isError to be true');
    assert.ok(result.content[0].text.includes('escapes vault'), `Expected "escapes vault" in: ${result.content[0].text}`);
  });

  // zed_decide — with empty optionals
  await test('zed_decide handles empty alternatives/consequences', async () => {
    const result = await client.callTool('zed_decide', {
      title: 'Quick Decision',
      context: 'Needed fast',
      decision: 'Just do it',
    });
    assert.ok(result.content[0].text.includes('Decision recorded'));
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
