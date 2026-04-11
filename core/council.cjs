/**
 * council.cjs — ZED v8.0 LLM Council
 *
 * Karpathy's llm-council pattern (https://github.com/karpathy/llm-council):
 *   Stage 1 — dispatch the question to N models in parallel
 *   Stage 2 — anonymously show each model the others' answers and ask
 *             for a 1..N ranking + one-sentence critique
 *   Stage 3 — a "chairman" model synthesises a final answer
 *
 * Uses native fetch (Node 18+) — zero SDK dependencies. Providers:
 *   - Anthropic  → direct via ANTHROPIC_API_KEY
 *   - OpenRouter → via OPENROUTER_API_KEY (routes to GPT, Gemini, Grok, etc.)
 *
 * The provider registry is pluggable so tests can inject mocks.
 *
 * Safety:
 *   - ZED_COUNCIL_BUDGET env var caps per-call cost (rough token estimate).
 *   - All provider calls are wrapped in try/catch — a failing model degrades
 *     the council rather than killing it. Empty responses just get skipped.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

// ---------------------------------------------------------------------------
// Provider adapters
// ---------------------------------------------------------------------------

const DEFAULT_MODELS = ['claude', 'gpt', 'gemini'];

// Rough USD-per-1M-token prices for budget enforcement. Intentionally
// conservative — the cap exists to prevent runaway spend in autonomous
// loops, not to bill accurately.
const ROUGH_PRICING = {
  anthropic: { in: 15, out: 75 },   // claude opus ballpark
  openrouter: { in: 5, out: 20 },   // mid-tier routed models ballpark
};

function estimateCost(res) {
  if (!res || !res.provider) return 0;
  const p = ROUGH_PRICING[res.provider] || { in: 5, out: 20 };
  const tin = res.tokensIn || 0;
  const tout = res.tokensOut || 0;
  return (tin * p.in + tout * p.out) / 1_000_000;
}

// ---------------------------------------------------------------------------
// Budget ledger — tracked per-process in a small JSON file under
// ~/.zed-data/council-budget.json. This gives us cross-command
// accounting without shared state.
// ---------------------------------------------------------------------------

function getBudgetFile() {
  const dataDir =
    process.env.CLAUDE_PLUGIN_DATA ||
    process.env.ZED_DATA_DIR ||
    path.join(os.homedir(), '.zed-data');
  try { fs.mkdirSync(dataDir, { recursive: true }); } catch {}
  return path.join(dataDir, 'council-budget.json');
}

function readBudgetLedger() {
  const file = getBudgetFile();
  try {
    const raw = fs.readFileSync(file, 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.spent === 'number') return parsed;
  } catch {}
  return { spent: 0, calls: 0, reset_at: new Date().toISOString() };
}

function writeBudgetLedger(ledger) {
  try {
    fs.writeFileSync(getBudgetFile(), JSON.stringify(ledger, null, 2), 'utf-8');
  } catch {}
}

function getBudgetCap() {
  const env = process.env.ZED_COUNCIL_BUDGET;
  if (env === undefined || env === '') return null;
  const n = Number(env);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function resetBudgetLedger() {
  writeBudgetLedger({ spent: 0, calls: 0, reset_at: new Date().toISOString() });
}

/**
 * Built-in providers. Each is `async (model, prompt, opts) => {text, tokensIn, tokensOut}`.
 * Returns null on failure (caller treats as a missing vote).
 */
const PROVIDERS = {
  /**
   * Anthropic Claude via direct HTTP. Model name like 'claude-opus-4-6'.
   */
  async anthropic(model, prompt, opts = {}) {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) return null;
    const modelId = model || 'claude-opus-4-6';
    const body = {
      model: modelId,
      max_tokens: opts.maxTokens || 1024,
      messages: [{ role: 'user', content: prompt }],
    };
    if (opts.system) body.system = opts.system;
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) return null;
      const data = await res.json();
      const text = (data.content || []).map((b) => b.text || '').join('').trim();
      return {
        text,
        tokensIn: data.usage ? data.usage.input_tokens : null,
        tokensOut: data.usage ? data.usage.output_tokens : null,
        provider: 'anthropic',
        model: modelId,
      };
    } catch (e) {
      return null;
    }
  },

  /**
   * OpenRouter (https://openrouter.ai) routes to many providers.
   * Model name like 'openai/gpt-5.1' or 'google/gemini-3-pro'.
   */
  async openrouter(model, prompt, opts = {}) {
    const key = process.env.OPENROUTER_API_KEY;
    if (!key) return null;
    const body = {
      model: model || 'openai/gpt-4o-mini',
      messages: [],
      max_tokens: opts.maxTokens || 1024,
    };
    if (opts.system) body.messages.push({ role: 'system', content: opts.system });
    body.messages.push({ role: 'user', content: prompt });
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'authorization': `Bearer ${key}`,
          'x-title': 'ZED Knowledge Engine',
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) return null;
      const data = await res.json();
      const text = ((data.choices || [])[0] || {}).message?.content || '';
      return {
        text: text.trim(),
        tokensIn: data.usage ? data.usage.prompt_tokens : null,
        tokensOut: data.usage ? data.usage.completion_tokens : null,
        provider: 'openrouter',
        model: body.model,
      };
    } catch (e) {
      return null;
    }
  },
};

/**
 * Friendly alias map: short names → { provider, modelId }.
 */
const MODEL_ALIASES = {
  claude: { provider: 'anthropic', modelId: 'claude-opus-4-6' },
  'claude-sonnet': { provider: 'anthropic', modelId: 'claude-sonnet-4-6' },
  'claude-haiku': { provider: 'anthropic', modelId: 'claude-haiku-4-5-20251001' },
  gpt: { provider: 'openrouter', modelId: 'openai/gpt-4o' },
  'gpt-5.1': { provider: 'openrouter', modelId: 'openai/gpt-5.1' },
  gemini: { provider: 'openrouter', modelId: 'google/gemini-pro-1.5' },
  'gemini-3': { provider: 'openrouter', modelId: 'google/gemini-3-pro' },
  grok: { provider: 'openrouter', modelId: 'x-ai/grok-2' },
  'grok-4': { provider: 'openrouter', modelId: 'x-ai/grok-4' },
};

function resolveAlias(alias) {
  if (MODEL_ALIASES[alias]) return MODEL_ALIASES[alias];
  // Allow direct provider:model form
  if (alias.includes('/')) return { provider: 'openrouter', modelId: alias };
  if (alias.startsWith('claude-')) return { provider: 'anthropic', modelId: alias };
  return null;
}

// ---------------------------------------------------------------------------
// Prompt templates
// ---------------------------------------------------------------------------

function stage1Prompt(question) {
  return (
    `You are one of several independent experts being asked the same question. ` +
    `Answer directly, concretely, and honestly. Flag any assumption. Favor evidence ` +
    `over rhetoric. Keep it under 400 words.\n\n` +
    `Question:\n${question}`
  );
}

function stage2Prompt(question, anonymizedResponses) {
  const lines = [
    `You previously answered the question below. Now review the anonymized answers ` +
    `from other experts and rank them (including your own) from BEST to WORST, using ` +
    `a 1..N integer scale (1 = best). Then write a one-sentence critique per answer.`,
    '',
    `Question:\n${question}`,
    '',
    `Anonymized answers:`,
    '',
  ];
  anonymizedResponses.forEach((r, i) => {
    lines.push(`---`);
    lines.push(`Answer ${String.fromCharCode(65 + i)}:`);
    lines.push(r);
    lines.push('');
  });
  lines.push(`---`);
  lines.push('');
  lines.push(
    `Respond in this exact format (no extra prose before or after):\n\n` +
    `Ranking:\n` +
    `1. <LETTER>\n` +
    `2. <LETTER>\n` +
    `...\n\n` +
    `Critiques:\n` +
    `A: <one sentence>\n` +
    `B: <one sentence>\n` +
    `...`
  );
  return lines.join('\n');
}

function stage3Prompt(question, answers, rankings) {
  const lines = [
    `You are the chairman of an expert council. Synthesize a final, decisive answer ` +
    `to the question using the experts' answers and their peer rankings. Be concrete, ` +
    `cite specific claims from the experts when they agree, flag contradictions ` +
    `explicitly, and end with a one-paragraph "consensus" and a one-paragraph ` +
    `"dissent" section. Keep the total under 600 words.`,
    '',
    `Question:\n${question}`,
    '',
    `Expert answers:`,
    '',
  ];
  answers.forEach((a, i) => {
    lines.push(`### Expert ${String.fromCharCode(65 + i)}`);
    lines.push(a.text || '(no answer)');
    lines.push('');
  });
  if (rankings && rankings.length > 0) {
    lines.push(`Peer rankings (1 = best):`);
    lines.push('');
    for (const r of rankings) {
      lines.push(`- ${r.voter}: [${(r.order || []).join(', ')}]`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Ranking parser — tolerant of slightly messy LLM output
// ---------------------------------------------------------------------------

function parseRanking(text) {
  const lines = (text || '').split('\n');
  const order = [];
  const critiques = {};
  let mode = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (/^ranking\s*:/i.test(line)) { mode = 'rank'; continue; }
    if (/^critiques\s*:/i.test(line)) { mode = 'crit'; continue; }
    if (mode === 'rank') {
      const m = line.match(/^\d+\.\s*([A-Z])\b/);
      if (m) order.push(m[1]);
      else if (line === '') mode = null;
    } else if (mode === 'crit') {
      const m = line.match(/^([A-Z])\s*:\s*(.+)$/);
      if (m) critiques[m[1]] = m[2];
    }
  }
  return { order, critiques };
}

// ---------------------------------------------------------------------------
// Main: council(question, opts)
// ---------------------------------------------------------------------------

/**
 * Run the three-stage LLM council.
 *
 * @param {string} question
 * @param {Object} [opts]
 * @param {string[]} [opts.models]       — alias list (default: claude, gpt, gemini)
 * @param {string} [opts.chairman]       — alias for the synthesizer (default: claude)
 * @param {number} [opts.maxTokens]      — per-model max (default: 1024)
 * @param {Object} [opts.providers]      — injected provider registry (for tests)
 * @returns {Promise<{answers, rankings, verdict, errors}>}
 */
async function council(question, opts = {}) {
  if (!question || typeof question !== 'string') {
    throw new Error('council: question is required');
  }
  const models = (opts.models && opts.models.length ? opts.models : DEFAULT_MODELS).slice(0, 6);
  const chairman = opts.chairman || 'claude';
  const maxTokens = opts.maxTokens || 1024;
  const providers = opts.providers || PROVIDERS;

  const errors = [];

  // ---- Budget pre-check ----
  // ZED_COUNCIL_BUDGET is an optional USD cap. When set, we refuse to
  // start a new council run once accumulated spend in the ledger hits
  // the cap. The ledger is a single JSON file under the data dir and
  // can be reset with `council.resetBudgetLedger()` or by deleting
  // council-budget.json.
  const budgetCap = budgetOverride(opts);
  let ledger = readBudgetLedger();
  if (budgetCap !== null && ledger.spent >= budgetCap) {
    return {
      answers: [],
      rankings: [],
      verdict: null,
      errors: [{ stage: 0, error: `budget cap reached (${ledger.spent.toFixed(4)}/${budgetCap} USD)` }],
      note: `council refused — ZED_COUNCIL_BUDGET cap reached ($${ledger.spent.toFixed(4)} / $${budgetCap}). Reset with \`zed council --reset-budget\` or unset ZED_COUNCIL_BUDGET.`,
      budget: { cap: budgetCap, spent: ledger.spent, remaining: 0 },
    };
  }

  // Helper: fold a provider result's estimated cost into the ledger.
  // Called after every successful API call. Safe to fail silently — we'd
  // rather undercount than break the council.
  function chargeLedger(res) {
    if (!res) return;
    try {
      ledger.spent += estimateCost(res);
      ledger.calls += 1;
    } catch {}
  }

  // ---- Stage 1: parallel dispatch ----
  const stage1Calls = models.map(async (alias) => {
    const resolved = resolveAlias(alias);
    if (!resolved) {
      errors.push({ stage: 1, alias, error: 'unknown model alias' });
      return null;
    }
    const fn = providers[resolved.provider];
    if (!fn) {
      errors.push({ stage: 1, alias, error: `no provider for ${resolved.provider}` });
      return null;
    }
    try {
      const res = await fn(resolved.modelId, stage1Prompt(question), { maxTokens });
      if (!res || !res.text) {
        errors.push({ stage: 1, alias, error: 'empty response' });
        return null;
      }
      chargeLedger(res);
      return { alias, resolved, ...res };
    } catch (e) {
      errors.push({ stage: 1, alias, error: e.message });
      return null;
    }
  });

  const answers = (await Promise.all(stage1Calls)).filter(Boolean);

  if (answers.length === 0) {
    return {
      answers: [],
      rankings: [],
      verdict: null,
      errors,
      note: 'council failed — no models returned an answer (check ANTHROPIC_API_KEY / OPENROUTER_API_KEY)',
    };
  }

  // ---- Stage 2: anonymous peer ranking ----
  const anonymized = answers.map((a) => a.text);
  const letterMap = answers.map((_, i) => String.fromCharCode(65 + i));

  const stage2Calls = answers.map(async (voter) => {
    const fn = providers[voter.resolved.provider];
    const promptText = stage2Prompt(question, anonymized);
    try {
      const res = await fn(voter.resolved.modelId, promptText, { maxTokens });
      if (!res || !res.text) {
        errors.push({ stage: 2, alias: voter.alias, error: 'empty response' });
        return null;
      }
      chargeLedger(res);
      const { order, critiques } = parseRanking(res.text);
      return { voter: voter.alias, order, critiques, raw: res.text };
    } catch (e) {
      errors.push({ stage: 2, alias: voter.alias, error: e.message });
      return null;
    }
  });

  const rankings = (await Promise.all(stage2Calls)).filter(Boolean);

  // ---- Aggregate: compute average rank per letter ----
  const aggregate = {};
  for (const L of letterMap) aggregate[L] = { sum: 0, count: 0 };
  for (const r of rankings) {
    (r.order || []).forEach((letter, idx) => {
      if (aggregate[letter]) {
        aggregate[letter].sum += idx + 1;
        aggregate[letter].count += 1;
      }
    });
  }
  const leaderboard = letterMap
    .map((L) => {
      const entry = aggregate[L];
      const avg = entry.count > 0 ? entry.sum / entry.count : null;
      return {
        letter: L,
        alias: answers[letterMap.indexOf(L)].alias,
        avgRank: avg,
        votes: entry.count,
      };
    })
    .sort((a, b) => {
      if (a.avgRank === null && b.avgRank === null) return 0;
      if (a.avgRank === null) return 1;
      if (b.avgRank === null) return -1;
      return a.avgRank - b.avgRank;
    });

  // ---- Budget mid-check (before the expensive stage 3) ----
  let budgetSkippedStage3 = false;
  if (budgetCap !== null && ledger.spent >= budgetCap) {
    budgetSkippedStage3 = true;
  }

  // ---- Stage 3: chairman synthesis ----
  let verdict = null;
  if (!budgetSkippedStage3) {
    const chairResolved = resolveAlias(chairman);
    if (chairResolved) {
      const fn = providers[chairResolved.provider];
      if (fn) {
        try {
          const res = await fn(
            chairResolved.modelId,
            stage3Prompt(question, answers, rankings),
            { maxTokens: Math.max(maxTokens, 1536) }
          );
          if (res && res.text) {
            chargeLedger(res);
            verdict = {
              text: res.text,
              provider: res.provider,
              model: res.model,
              chairman,
            };
          }
        } catch (e) {
          errors.push({ stage: 3, alias: chairman, error: e.message });
        }
      }
    }
  } else {
    errors.push({ stage: 3, error: `budget cap reached before chairman (${ledger.spent.toFixed(4)}/${budgetCap})` });
  }

  // Persist the updated ledger (best-effort)
  writeBudgetLedger(ledger);

  return {
    question,
    models,
    chairman,
    answers: answers.map((a) => ({
      alias: a.alias,
      letter: letterMap[answers.indexOf(a)],
      model: a.model,
      provider: a.provider,
      text: a.text,
      tokensIn: a.tokensIn,
      tokensOut: a.tokensOut,
    })),
    rankings,
    leaderboard,
    verdict,
    errors,
    budget: budgetCap !== null
      ? {
          cap: budgetCap,
          spent: ledger.spent,
          remaining: Math.max(0, budgetCap - ledger.spent),
          calls: ledger.calls,
        }
      : null,
  };
}

/**
 * Override the budget cap from opts (used by tests to avoid touching
 * ZED_COUNCIL_BUDGET env var). Returns a numeric cap or null.
 */
function budgetOverride(opts) {
  if (opts && opts.budgetCap !== undefined) {
    return Number.isFinite(opts.budgetCap) && opts.budgetCap > 0 ? opts.budgetCap : null;
  }
  return getBudgetCap();
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  council,
  // Exported for tests + skill wiring
  PROVIDERS,
  MODEL_ALIASES,
  resolveAlias,
  stage1Prompt,
  stage2Prompt,
  stage3Prompt,
  parseRanking,
  // Budget ledger utilities
  readBudgetLedger,
  writeBudgetLedger,
  resetBudgetLedger,
  getBudgetCap,
  estimateCost,
};
