/**
 * test-event-log.cjs — ZED v8.1 MCP event log test suite
 */

'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const os = require('os');

const eventLog = require('./event-log.cjs');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.log(`  ✗ ${name}`);
    console.log(`    ${err.message}`);
  }
}

function withTmpDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zed-evlog-'));
  try {
    fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
console.log('\n── event-log: logEvent + readEvents ──');

test('logEvent: creates log file and writes one line', () => {
  withTmpDir((dir) => {
    eventLog.logEvent({ tool: 'zed_search', resultCount: 5, durationMs: 42 }, { dataDir: dir });
    const events = eventLog.readEvents({ dataDir: dir });
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].tool, 'zed_search');
    assert.strictEqual(events[0].resultCount, 5);
    assert.strictEqual(events[0].durationMs, 42);
    assert.strictEqual(events[0].isError, false);
    assert.ok(events[0].ts);
  });
});

test('logEvent: appends multiple events', () => {
  withTmpDir((dir) => {
    eventLog.logEvent({ tool: 'zed_search', resultCount: 3 }, { dataDir: dir });
    eventLog.logEvent({ tool: 'zed_write_note', resultCount: 0 }, { dataDir: dir });
    eventLog.logEvent({ tool: 'zed_decide', resultCount: 0 }, { dataDir: dir });
    const events = eventLog.readEvents({ dataDir: dir });
    assert.strictEqual(events.length, 3);
    assert.strictEqual(events[0].tool, 'zed_search');
    assert.strictEqual(events[2].tool, 'zed_decide');
  });
});

test('logEvent: records isError flag', () => {
  withTmpDir((dir) => {
    eventLog.logEvent({ tool: 'zed_clip', isError: true, note: 'HTTP 404' }, { dataDir: dir });
    const events = eventLog.readEvents({ dataDir: dir });
    assert.strictEqual(events[0].isError, true);
    assert.strictEqual(events[0].note, 'HTTP 404');
  });
});

test('readEvents: empty log returns []', () => {
  withTmpDir((dir) => {
    assert.deepStrictEqual(eventLog.readEvents({ dataDir: dir }), []);
  });
});

test('readEvents: sinceDays filters old events', () => {
  withTmpDir((dir) => {
    const logPath = eventLog.getLogPath({ dataDir: dir });
    const old = { ts: '2020-01-01T00:00:00Z', tool: 'old', sid: null, resultCount: null, durationMs: null, isError: false, note: null };
    const recent = { ts: new Date().toISOString(), tool: 'recent', sid: null, resultCount: null, durationMs: null, isError: false, note: null };
    fs.writeFileSync(logPath, JSON.stringify(old) + '\n' + JSON.stringify(recent) + '\n');
    const events = eventLog.readEvents({ dataDir: dir, sinceDays: 7 });
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].tool, 'recent');
  });
});

test('readEvents: sessionId filters to one session', () => {
  withTmpDir((dir) => {
    const logPath = eventLog.getLogPath({ dataDir: dir });
    const e1 = { ts: new Date().toISOString(), tool: 'a', sid: 'sess-1' };
    const e2 = { ts: new Date().toISOString(), tool: 'b', sid: 'sess-2' };
    const e3 = { ts: new Date().toISOString(), tool: 'c', sid: 'sess-1' };
    fs.writeFileSync(logPath, [e1, e2, e3].map(JSON.stringify).join('\n') + '\n');
    const events = eventLog.readEvents({ dataDir: dir, sessionId: 'sess-1' });
    assert.strictEqual(events.length, 2);
    assert.ok(events.every((e) => e.sid === 'sess-1'));
  });
});

test('readEvents: skips malformed lines gracefully', () => {
  withTmpDir((dir) => {
    const logPath = eventLog.getLogPath({ dataDir: dir });
    fs.writeFileSync(logPath, '{"tool":"good"}\n{bad json\n{"tool":"also good"}\n');
    const events = eventLog.readEvents({ dataDir: dir });
    assert.strictEqual(events.length, 2);
  });
});

// ---------------------------------------------------------------------------
console.log('\n── event-log: pruneEvents ──');

test('pruneEvents: removes old entries, keeps recent', () => {
  withTmpDir((dir) => {
    const logPath = eventLog.getLogPath({ dataDir: dir });
    const old = { ts: '2020-01-01T00:00:00Z', tool: 'old' };
    const recent = { ts: new Date().toISOString(), tool: 'recent' };
    fs.writeFileSync(logPath, JSON.stringify(old) + '\n' + JSON.stringify(recent) + '\n');
    const result = eventLog.pruneEvents({ dataDir: dir, maxAgeDays: 30 });
    assert.strictEqual(result.pruned, 1);
    assert.strictEqual(result.kept, 1);
    const events = eventLog.readEvents({ dataDir: dir });
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].tool, 'recent');
  });
});

test('pruneEvents: on empty log returns zeroes', () => {
  withTmpDir((dir) => {
    const result = eventLog.pruneEvents({ dataDir: dir });
    assert.strictEqual(result.kept, 0);
    assert.strictEqual(result.pruned, 0);
  });
});

// ---------------------------------------------------------------------------
console.log('\n── event-log: aggregation ──');

test('aggregateToolUsage: counts by tool and session', () => {
  const events = [
    { tool: 'zed_search', sid: 's1' },
    { tool: 'zed_search', sid: 's1' },
    { tool: 'zed_write_note', sid: 's1' },
    { tool: 'zed_search', sid: 's2' },
    { tool: 'zed_decide', sid: 's2' },
  ];
  const agg = eventLog.aggregateToolUsage(events);
  assert.strictEqual(agg.byTool.zed_search, 3);
  assert.strictEqual(agg.byTool.zed_write_note, 1);
  assert.strictEqual(agg.byTool.zed_decide, 1);
  assert.strictEqual(agg.totalCalls, 5);
  assert.strictEqual(agg.sessionCount, 2);
  assert.strictEqual(agg.avgPerSession, 2.5);
});

test('aggregateProtocolAdherence: detects search-before-write', () => {
  const events = [
    // Session 1: search then write (good)
    { tool: 'zed_search', sid: 's1', resultCount: 3 },
    { tool: 'zed_write_note', sid: 's1' },
    // Session 2: write without search (bad)
    { tool: 'zed_write_note', sid: 's2' },
    // Session 3: search (no results) then decide (good but miss)
    { tool: 'zed_search', sid: 's3', resultCount: 0 },
    { tool: 'zed_decide', sid: 's3' },
  ];
  const adh = eventLog.aggregateProtocolAdherence(events);
  assert.strictEqual(adh.writesTotal, 3);
  assert.strictEqual(adh.writesWithPriorSearch, 2); // s1 + s3
  assert.strictEqual(adh.searchBeforeWriteRate, 67); // 2/3 = 67%
  assert.strictEqual(adh.searchesTotal, 2);
  assert.strictEqual(adh.searchHits, 1); // only s1 had results
  assert.strictEqual(adh.searchHitRate, 50);
});

test('aggregateProtocolAdherence: no writes → null rates', () => {
  const events = [{ tool: 'zed_search', sid: 's1', resultCount: 5 }];
  const adh = eventLog.aggregateProtocolAdherence(events);
  assert.strictEqual(adh.searchBeforeWriteRate, null);
  assert.strictEqual(adh.searchHitRate, 100);
});

// ---------------------------------------------------------------------------
console.log(`\n${'═'.repeat(50)}`);
console.log(`event-log tests: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${'═'.repeat(50)}`);
process.exit(failed > 0 ? 1 : 0);
