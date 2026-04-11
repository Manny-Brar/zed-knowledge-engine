#!/usr/bin/env node
/**
 * postinstall.cjs — ZED v8.0 post-install hook.
 *
 * Downloads the Playwright chromium binary required by the web clipping
 * pipeline. Respects ZED_SKIP_PLAYWRIGHT=1 for users who only want the
 * knowledge-graph features and prefer to skip the ~170MB download.
 *
 * Never exits non-zero: a missing browser should not break `npm install`.
 * The ingest-layer falls back to fetch() + readability when playwright is
 * absent, so ZED still works.
 */

'use strict';

const { spawnSync } = require('child_process');

if (process.env.ZED_SKIP_PLAYWRIGHT === '1') {
  console.log('[ZED] ZED_SKIP_PLAYWRIGHT=1 — skipping playwright chromium download.');
  console.log('[ZED] Web clipping will use fetch() + readability fallback.');
  process.exit(0);
}

// Let users override in CI / Docker builds.
if (process.env.CI === 'true' || process.env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD === '1') {
  console.log('[ZED] CI or PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD detected — skipping browser download.');
  process.exit(0);
}

try {
  require.resolve('playwright');
} catch (e) {
  // Playwright not installed — nothing to do. This happens if the user
  // pruned deps or if package.json was edited without reinstall.
  process.exit(0);
}

console.log('[ZED] Installing playwright chromium (web clipping pipeline)...');
console.log('[ZED] Set ZED_SKIP_PLAYWRIGHT=1 to skip this step in the future.');

const result = spawnSync('npx', ['playwright', 'install', 'chromium'], {
  stdio: 'inherit',
  shell: false,
});

if (result.status !== 0) {
  console.log('[ZED] playwright chromium install did not complete cleanly.');
  console.log('[ZED] This is non-fatal — ZED will fall back to fetch() + readability.');
  console.log('[ZED] You can retry later with: npx playwright install chromium');
}

process.exit(0);
