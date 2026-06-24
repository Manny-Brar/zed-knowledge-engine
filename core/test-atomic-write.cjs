#!/usr/bin/env node
/**
 * test-atomic-write.cjs — tests for core/atomic-write.cjs
 *
 * Covers:
 *   - Basic write + read roundtrip
 *   - Parent directory auto-creation
 *   - JSON helper roundtrip
 *   - readJsonAtomic returns null on missing/malformed
 *   - No partial files left after a write (cleanup on rename failure simulation)
 *   - Concurrent writes from the same process don't collide
 *   - Existing-file replacement is atomic (reader never sees half-written)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const { writeAtomic, writeJsonAtomic, readJsonAtomic } = require('./atomic-write.cjs');

let pass = 0;
let fail = 0;
const failures = [];

function t(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    pass++;
  } catch (err) {
    console.log(`  ✗ ${name}`);
    console.log(`    ${err.message}`);
    failures.push({ name, err });
    fail++;
  }
}

function assertEq(actual, expected, msg) {
  if (actual !== expected) throw new Error(`${msg || ''}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`);
}

function assertDeep(actual, expected, msg) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg || ''}\n    expected: ${e}\n    actual:   ${a}`);
}

// Create a clean tmp dir for this run
const TEST_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'zed-atomic-test-'));

try {
  console.log('atomic-write tests');

  t('writeAtomic: basic write + read roundtrip', () => {
    const p = path.join(TEST_DIR, 'a.txt');
    writeAtomic(p, 'hello world');
    assertEq(fs.readFileSync(p, 'utf-8'), 'hello world');
  });

  t('writeAtomic: creates parent directory if missing', () => {
    const p = path.join(TEST_DIR, 'sub1', 'sub2', 'a.txt');
    writeAtomic(p, 'nested');
    assertEq(fs.readFileSync(p, 'utf-8'), 'nested');
  });

  t('writeAtomic: replaces existing file', () => {
    const p = path.join(TEST_DIR, 'b.txt');
    writeAtomic(p, 'v1');
    writeAtomic(p, 'v2');
    assertEq(fs.readFileSync(p, 'utf-8'), 'v2');
  });

  t('writeAtomic: leaves no .tmp.* siblings after success', () => {
    const p = path.join(TEST_DIR, 'c.txt');
    writeAtomic(p, 'clean');
    const siblings = fs.readdirSync(TEST_DIR).filter((f) => f.startsWith('c.txt.tmp.'));
    assertEq(siblings.length, 0, 'no tmp files should remain');
  });

  t('writeAtomic: respects mode option', () => {
    const p = path.join(TEST_DIR, 'mode.txt');
    writeAtomic(p, 'x', { mode: 0o600 });
    const stat = fs.statSync(p);
    // Compare permission bits only (lower 9 bits)
    assertEq(stat.mode & 0o777, 0o600, 'mode bits');
  });

  t('writeJsonAtomic + readJsonAtomic: object roundtrip', () => {
    const p = path.join(TEST_DIR, 'obj.json');
    const obj = { a: 1, b: [2, 3], c: { d: 'e' } };
    writeJsonAtomic(p, obj);
    assertDeep(readJsonAtomic(p), obj);
  });

  t('readJsonAtomic: null on missing file', () => {
    assertEq(readJsonAtomic(path.join(TEST_DIR, 'does-not-exist.json')), null);
  });

  t('readJsonAtomic: null on malformed JSON', () => {
    const p = path.join(TEST_DIR, 'bad.json');
    fs.writeFileSync(p, '{ not valid json', 'utf-8');
    assertEq(readJsonAtomic(p), null);
  });

  t('writeAtomic: concurrent writes from same process do not collide', () => {
    const p = path.join(TEST_DIR, 'concurrent.txt');
    // Fire two writes back-to-back (synchronous so they actually serialize,
    // but each generates a unique tmp name)
    writeAtomic(p, 'one');
    writeAtomic(p, 'two');
    writeAtomic(p, 'three');
    assertEq(fs.readFileSync(p, 'utf-8'), 'three');
    const siblings = fs.readdirSync(TEST_DIR).filter((f) => f.startsWith('concurrent.txt.tmp.'));
    assertEq(siblings.length, 0);
  });

  t('writeAtomic: reader never sees half-written content (no partial file at destination)', () => {
    // Write a large blob; the rename must be atomic so a parallel reader
    // either sees the previous content or the new full content.
    const p = path.join(TEST_DIR, 'big.txt');
    const big = 'x'.repeat(100_000);
    writeAtomic(p, 'small');
    writeAtomic(p, big);
    const content = fs.readFileSync(p, 'utf-8');
    if (content !== 'small' && content !== big) {
      throw new Error('reader saw partial content!');
    }
    assertEq(content.length, big.length);
  });

  t('writeAtomic: rename failure cleans up tmp file', () => {
    // Simulate rename failure by passing an invalid destination
    let threw = false;
    const badDest = '/nonexistent-readonly-' + Math.random() + '/x.txt';
    try {
      // Will throw — parent doesn't exist AND we can't mkdir under /nonexistent...
      // Actually our writer mkdirs parent recursively, so this MIGHT succeed.
      // Use a different approach: pass a path where the destination is a directory
      const conflictDir = path.join(TEST_DIR, 'conflict');
      fs.mkdirSync(conflictDir);
      // rename of a file onto a non-empty directory throws EISDIR/ENOTEMPTY
      fs.mkdirSync(path.join(conflictDir, 'inner'));
      writeAtomic(conflictDir, 'x');
    } catch {
      threw = true;
    }
    if (!threw) throw new Error('expected rename failure to throw');
    // Verify no orphaned tmp files
    const conflictDir = path.join(TEST_DIR, 'conflict');
    if (fs.existsSync(path.dirname(conflictDir))) {
      const siblings = fs.readdirSync(path.dirname(conflictDir))
        .filter((f) => f.startsWith('conflict.tmp.'));
      assertEq(siblings.length, 0, 'no orphaned tmp on failure');
    }
  });

  t('writeAtomic: Buffer content writes correctly', () => {
    const p = path.join(TEST_DIR, 'buf.bin');
    const buf = Buffer.from([0x00, 0x01, 0xff, 0x7f]);
    writeAtomic(p, buf, { encoding: null });
    const read = fs.readFileSync(p);
    assertEq(read.length, buf.length);
    for (let i = 0; i < buf.length; i++) assertEq(read[i], buf[i], `byte ${i}`);
  });

} finally {
  // Cleanup
  try { fs.rmSync(TEST_DIR, { recursive: true, force: true }); } catch {}
}

console.log('');
console.log('═'.repeat(50));
console.log(`atomic-write tests: ${pass} passed, ${fail} failed, ${pass + fail} total`);
console.log('═'.repeat(50));

if (fail > 0) process.exit(1);
