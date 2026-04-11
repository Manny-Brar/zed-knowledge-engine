/**
 * test-council.cjs — ZED v8.0 LLM council test suite
 *
 * Tests the three-stage flow, ranking parser, alias resolution, and graceful
 * degradation. No real API calls — providers are mocked via the injected
 * `opts.providers` registry.
 */

'use strict';

const assert = require('assert');
const council = require('./council.cjs');

let passed = 0;
let failed = 0;
const asyncQueue = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.log(`  ✗ ${name}`);
    console.log(`    ${err.message}`);
    if (process.env.ZED_TEST_STACK) console.log(err.stack);
  }
}

// Collects async tests and runs them serially after all top-level code
// has registered them. Serial execution gives deterministic output order
// and lets us properly await setTimeout-backed tests.
function testAsync(name, fn) {
  asyncQueue.push({ name, fn });
}

async function drainAsyncQueue() {
  for (const { name, fn } of asyncQueue) {
    try {
      await fn();
      passed++;
      console.log(`  ✓ ${name}`);
    } catch (err) {
      failed++;
      console.log(`  ✗ ${name}`);
      console.log(`    ${err.message}`);
      if (process.env.ZED_TEST_STACK) console.log(err.stack);
    }
  }
}

// ---------------------------------------------------------------------------
// Alias resolver
// ---------------------------------------------------------------------------

console.log('\n── council: resolveAlias ──');

test('resolveAlias: claude → anthropic', () => {
  const r = council.resolveAlias('claude');
  assert.strictEqual(r.provider, 'anthropic');
  assert.ok(r.modelId.startsWith('claude'));
});

test('resolveAlias: gpt → openrouter', () => {
  const r = council.resolveAlias('gpt');
  assert.strictEqual(r.provider, 'openrouter');
  assert.ok(r.modelId.startsWith('openai/'));
});

test('resolveAlias: gemini → openrouter', () => {
  const r = council.resolveAlias('gemini');
  assert.strictEqual(r.provider, 'openrouter');
  assert.ok(r.modelId.startsWith('google/'));
});

test('resolveAlias: provider/model form → openrouter', () => {
  const r = council.resolveAlias('meta-llama/llama-3.1-70b');
  assert.strictEqual(r.provider, 'openrouter');
  assert.strictEqual(r.modelId, 'meta-llama/llama-3.1-70b');
});

test('resolveAlias: unknown alias → null', () => {
  assert.strictEqual(council.resolveAlias('nonsense-model'), null);
});

// ---------------------------------------------------------------------------
// parseRanking
// ---------------------------------------------------------------------------

console.log('\n── council: parseRanking ──');

test('parseRanking: clean output', () => {
  const { order, critiques } = council.parseRanking(
    'Ranking:\n1. B\n2. A\n3. C\n\nCritiques:\nA: Too vague.\nB: Strongest evidence.\nC: Wrong claim.'
  );
  assert.deepStrictEqual(order, ['B', 'A', 'C']);
  assert.strictEqual(critiques.A, 'Too vague.');
  assert.strictEqual(critiques.B, 'Strongest evidence.');
});

test('parseRanking: extra prose is tolerated', () => {
  const { order } = council.parseRanking(
    'Here is my ranking:\n\nRanking:\n1. A\n2. B\n\nHope that helps.'
  );
  assert.deepStrictEqual(order, ['A', 'B']);
});

test('parseRanking: empty input → empty arrays/objects', () => {
  const r = council.parseRanking('');
  assert.deepStrictEqual(r.order, []);
  assert.deepStrictEqual(r.critiques, {});
});

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------

console.log('\n── council: prompt builders ──');

test('stage1Prompt: contains the question', () => {
  const p = council.stage1Prompt('What is X?');
  assert.ok(p.includes('What is X?'));
});

test('stage2Prompt: anonymises answers as A, B, C', () => {
  const p = council.stage2Prompt('Q?', ['answer one', 'answer two', 'answer three']);
  assert.ok(p.includes('Answer A'));
  assert.ok(p.includes('Answer B'));
  assert.ok(p.includes('Answer C'));
  assert.ok(p.includes('Ranking:'));
});

test('stage3Prompt: includes all expert answers and rankings', () => {
  const p = council.stage3Prompt(
    'Q?',
    [{ text: 'one' }, { text: 'two' }],
    [{ voter: 'claude', order: ['A', 'B'] }]
  );
  assert.ok(p.includes('Expert A'));
  assert.ok(p.includes('Expert B'));
  assert.ok(p.includes('claude'));
});

// ---------------------------------------------------------------------------
// End-to-end council with mocked providers
// ---------------------------------------------------------------------------

console.log('\n── council: three-stage flow (mocked) ──');

function makeMockProviders(options = {}) {
  const calls = [];
  const {
    claudeText = 'Stage response from Claude.',
    gptText = 'Stage response from GPT.',
    geminiText = 'Stage response from Gemini.',
    rankText = 'Ranking:\n1. A\n2. B\n3. C\n\nCritiques:\nA: Best.\nB: OK.\nC: Weak.',
    chairText = 'Final synthesis. Consensus: X. Dissent: Y.',
    failProvider = null,
  } = options;

  const providers = {
    async anthropic(model, prompt, opts) {
      calls.push({ provider: 'anthropic', model, promptLen: prompt.length });
      if (failProvider === 'anthropic') return null;
      // Chairman stage 3 has the "Expert A" structure
      if (/Expert A/.test(prompt)) return { text: chairText, provider: 'anthropic', model };
      if (/Ranking:/.test(prompt)) return { text: rankText, provider: 'anthropic', model };
      return { text: claudeText, provider: 'anthropic', model };
    },
    async openrouter(model, prompt, opts) {
      calls.push({ provider: 'openrouter', model, promptLen: prompt.length });
      if (failProvider === 'openrouter') return null;
      if (/Expert A/.test(prompt)) return { text: chairText, provider: 'openrouter', model };
      if (/Ranking:/.test(prompt)) return { text: rankText, provider: 'openrouter', model };
      if (/openai/.test(model)) return { text: gptText, provider: 'openrouter', model };
      if (/google/.test(model)) return { text: geminiText, provider: 'openrouter', model };
      return { text: 'generic', provider: 'openrouter', model };
    },
  };
  return { providers, calls };
}

testAsync('council: returns answers from all three models', async () => {
  const { providers } = makeMockProviders();
  const result = await council.council('What is the capital of France?', {
    models: ['claude', 'gpt', 'gemini'],
    providers,
  });
  assert.strictEqual(result.answers.length, 3);
  const aliases = result.answers.map((a) => a.alias);
  assert.deepStrictEqual(aliases.sort(), ['claude', 'gemini', 'gpt']);
});

testAsync('council: stage 2 rankings are collected from every voter', async () => {
  const { providers } = makeMockProviders();
  const result = await council.council('Q?', {
    models: ['claude', 'gpt', 'gemini'],
    providers,
  });
  assert.strictEqual(result.rankings.length, 3);
  for (const r of result.rankings) {
    assert.deepStrictEqual(r.order, ['A', 'B', 'C']);
  }
});

testAsync('council: leaderboard computes avgRank correctly', async () => {
  const { providers } = makeMockProviders();
  const result = await council.council('Q?', {
    models: ['claude', 'gpt', 'gemini'],
    providers,
  });
  // All voters ranked A=1, B=2, C=3
  const a = result.leaderboard.find((x) => x.letter === 'A');
  const b = result.leaderboard.find((x) => x.letter === 'B');
  const c = result.leaderboard.find((x) => x.letter === 'C');
  assert.strictEqual(a.avgRank, 1);
  assert.strictEqual(b.avgRank, 2);
  assert.strictEqual(c.avgRank, 3);
  // Leaderboard is sorted best-first
  assert.strictEqual(result.leaderboard[0].letter, 'A');
});

testAsync('council: chairman verdict is returned', async () => {
  const { providers } = makeMockProviders();
  const result = await council.council('Q?', {
    models: ['claude', 'gpt', 'gemini'],
    providers,
  });
  assert.ok(result.verdict);
  assert.ok(result.verdict.text.includes('Final synthesis'));
  assert.strictEqual(result.verdict.chairman, 'claude');
});

testAsync('council: failing provider degrades gracefully', async () => {
  const { providers } = makeMockProviders({ failProvider: 'openrouter' });
  const result = await council.council('Q?', {
    models: ['claude', 'gpt', 'gemini'],
    providers,
  });
  // Only claude survives stage 1
  assert.strictEqual(result.answers.length, 1);
  assert.strictEqual(result.answers[0].alias, 'claude');
  // Errors were recorded
  assert.ok(result.errors.length >= 2);
});

testAsync('council: zero live providers → structured failure note', async () => {
  const { providers } = makeMockProviders({ failProvider: 'anthropic' });
  // Force openrouter to also fail
  providers.openrouter = async () => null;
  const result = await council.council('Q?', {
    models: ['claude', 'gpt', 'gemini'],
    providers,
  });
  assert.strictEqual(result.answers.length, 0);
  assert.ok(result.note);
  assert.ok(/no models returned/.test(result.note));
  assert.strictEqual(result.verdict, null);
});

testAsync('council: rejects empty question', async () => {
  let caught = null;
  try {
    await council.council('', { providers: {} });
  } catch (e) {
    caught = e;
  }
  assert.ok(caught);
  assert.ok(/question is required/.test(caught.message));
});

testAsync('council: ZED_COUNCIL_BUDGET hard-caps a new run', async () => {
  // Seed the ledger above the cap so the council refuses to start.
  const tmpDir = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'zed-budget-'));
  const saved = process.env.CLAUDE_PLUGIN_DATA;
  process.env.CLAUDE_PLUGIN_DATA = tmpDir;
  try {
    council.writeBudgetLedger({ spent: 1.5, calls: 5, reset_at: new Date().toISOString() });
    const { providers } = makeMockProviders();
    const result = await council.council('Q?', {
      models: ['claude'],
      providers,
      budgetCap: 1.0,
    });
    assert.strictEqual(result.answers.length, 0);
    assert.ok(/budget cap reached/i.test(result.note || ''), `expected budget note, got: ${result.note}`);
    assert.ok(result.budget);
    assert.strictEqual(result.budget.cap, 1.0);
  } finally {
    if (saved) process.env.CLAUDE_PLUGIN_DATA = saved;
    else delete process.env.CLAUDE_PLUGIN_DATA;
    require('fs').rmSync(tmpDir, { recursive: true, force: true });
  }
});

testAsync('council: budget is tracked across calls and reported in result', async () => {
  const tmpDir = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'zed-budget-'));
  const saved = process.env.CLAUDE_PLUGIN_DATA;
  process.env.CLAUDE_PLUGIN_DATA = tmpDir;
  try {
    council.resetBudgetLedger();
    // Mock provider that reports usage so estimateCost has something to chew
    const providers = {
      async anthropic(model, prompt) {
        if (/Expert A/.test(prompt)) return { text: 'final', provider: 'anthropic', model, tokensIn: 100, tokensOut: 200 };
        if (/Ranking:/.test(prompt)) return { text: 'Ranking:\n1. A\n\nCritiques:\nA: ok.', provider: 'anthropic', model, tokensIn: 50, tokensOut: 30 };
        return { text: 'answer', provider: 'anthropic', model, tokensIn: 40, tokensOut: 60 };
      },
    };
    const result = await council.council('Q?', {
      models: ['claude'],
      providers,
      budgetCap: 10.0,
    });
    assert.ok(result.budget);
    assert.strictEqual(result.budget.cap, 10.0);
    assert.ok(result.budget.spent > 0, 'spent should be greater than 0');
    assert.ok(result.budget.calls >= 1);
    assert.ok(result.verdict);
  } finally {
    if (saved) process.env.CLAUDE_PLUGIN_DATA = saved;
    else delete process.env.CLAUDE_PLUGIN_DATA;
    require('fs').rmSync(tmpDir, { recursive: true, force: true });
  }
});

testAsync('council: budgetCap prevents stage 3 (chairman) when exceeded mid-run', async () => {
  const tmpDir = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'zed-budget-'));
  const saved = process.env.CLAUDE_PLUGIN_DATA;
  process.env.CLAUDE_PLUGIN_DATA = tmpDir;
  try {
    council.resetBudgetLedger();
    // Make stage 1+2 report huge usage so the mid-check trips
    const providers = {
      async anthropic(model, prompt) {
        if (/Expert A/.test(prompt)) return { text: 'should not run', provider: 'anthropic', model };
        if (/Ranking:/.test(prompt)) return { text: 'Ranking:\n1. A\n\nCritiques:\nA: ok.', provider: 'anthropic', model, tokensIn: 500000, tokensOut: 500000 };
        return { text: 'answer', provider: 'anthropic', model, tokensIn: 500000, tokensOut: 500000 };
      },
    };
    const result = await council.council('Q?', {
      models: ['claude'],
      providers,
      budgetCap: 1.0,
    });
    // Stage 1 succeeded, but chairman skipped.
    assert.strictEqual(result.answers.length, 1);
    assert.strictEqual(result.verdict, null);
    const stage3Errs = result.errors.filter((e) => e.stage === 3);
    assert.ok(stage3Errs.length >= 1);
    assert.ok(/budget cap reached/.test(stage3Errs[0].error));
  } finally {
    if (saved) process.env.CLAUDE_PLUGIN_DATA = saved;
    else delete process.env.CLAUDE_PLUGIN_DATA;
    require('fs').rmSync(tmpDir, { recursive: true, force: true });
  }
});

testAsync('council: resetBudgetLedger zeroes the ledger', async () => {
  const tmpDir = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'zed-budget-'));
  const saved = process.env.CLAUDE_PLUGIN_DATA;
  process.env.CLAUDE_PLUGIN_DATA = tmpDir;
  try {
    council.writeBudgetLedger({ spent: 3.7, calls: 10, reset_at: 'old' });
    council.resetBudgetLedger();
    const l = council.readBudgetLedger();
    assert.strictEqual(l.spent, 0);
    assert.strictEqual(l.calls, 0);
  } finally {
    if (saved) process.env.CLAUDE_PLUGIN_DATA = saved;
    else delete process.env.CLAUDE_PLUGIN_DATA;
    require('fs').rmSync(tmpDir, { recursive: true, force: true });
  }
});

testAsync('council: parallel dispatch (all stage-1 calls in flight together)', async () => {
  // Build providers that record call order with artificial delays to prove
  // they overlap. If dispatch were serial total time >= 3 * 50ms = 150ms.
  // Parallel should be closer to 50ms.
  const timestamps = [];
  const providers = {
    async anthropic() {
      timestamps.push({ t: 'claude-start', time: Date.now() });
      await new Promise((r) => setTimeout(r, 50));
      timestamps.push({ t: 'claude-end', time: Date.now() });
      return { text: 'c', provider: 'anthropic', model: 'x' };
    },
    async openrouter(model) {
      timestamps.push({ t: `${model}-start`, time: Date.now() });
      await new Promise((r) => setTimeout(r, 50));
      timestamps.push({ t: `${model}-end`, time: Date.now() });
      return { text: model, provider: 'openrouter', model };
    },
  };
  const start = Date.now();
  await council.council('Q?', {
    models: ['claude', 'gpt', 'gemini'],
    providers,
  });
  const elapsed = Date.now() - start;
  // Generous bound: fewer than 200ms would be impossible if serial (stage 1
  // alone would take 150ms; add stage 2 and stage 3 on top).
  // What we really want is: all three stage-1 *starts* happen within ~10ms.
  const starts = timestamps.filter((t) => t.t.endsWith('-start')).slice(0, 3);
  assert.strictEqual(starts.length, 3);
  const span = Math.max(...starts.map((t) => t.time)) - Math.min(...starts.map((t) => t.time));
  assert.ok(span < 30, `stage-1 start span ${span}ms should be near-zero (parallel)`);
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

(async () => {
  await drainAsyncQueue();
  console.log(`\n${'═'.repeat(50)}`);
  console.log(`council tests: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log(`${'═'.repeat(50)}`);
  process.exit(failed > 0 ? 1 : 0);
})();
