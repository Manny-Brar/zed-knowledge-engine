---
name: llm-council
description: Use this skill when you are about to commit to a high-stakes decision (architectural choice, irreversible change, trade-off between two hard-to-reverse approaches) and you want a second opinion beyond your own analysis. Implements Karpathy's llm-council pattern: dispatch the question to multiple models, have them anonymously rank each other, then synthesize a chairman verdict. The skill tells you WHEN to invoke it, HOW to phrase the question, and HOW to interpret the result.
---

# LLM Council

This skill wraps the `zed_council` MCP tool (and `zed council` CLI). It
implements the three-stage pattern from Karpathy's
[llm-council](https://github.com/karpathy/llm-council):

1. **Stage 1** — the question is sent to N models (default: claude, gpt, gemini) in parallel
2. **Stage 2** — each model is shown the others' answers anonymised as A/B/C and asked to rank them + critique
3. **Stage 3** — a "chairman" model (default: claude) synthesises a final consensus + dissent

## When to invoke

- **Tier 3 execution protocol gate**: before committing to a deeply consequential architecture choice
- **Evolve mode**: at the beginning of iteration 0, after decomposing the objective, to pressure-test the approach
- **Hard-to-reverse decisions**: schema migrations, dependency removals, public API changes
- **Two strong alternatives**: when your own analysis is split 50/50

## When NOT to invoke

- Routine refactors, bug fixes, syntax questions
- Questions with a known answer (check `zed_search` first)
- Anything where the cost of a wrong call is cheap — just make the call yourself
- When you're in a fast iteration loop and need speed, not consensus

Council costs ~7 API calls per invocation (3 answers + 3 peer reviews + 1 synthesis). Treat it as a gate, not a hammer.

## Phrasing the question

Good council questions are:
- **Specific**: "Should the wiki compile layer use source_paths as an array or a single string?" not "How should the wiki work?"
- **Decision-shaped**: name the alternatives explicitly
- **Context-bounded**: include the relevant constraints in one paragraph max

```
zed_council({
  question: "For ZED's v8.0 web clipper, should we ship Defuddle or Mozilla Readability as the default extractor? Defuddle is newer (~50 stars), markdown-native, written by kepano (author of Obsidian Web Clipper). Readability is battle-tested (Mozilla Firefox Reader View) but outputs HTML requiring a separate Turndown pass. Constraint: we can only bundle ONE by default, the other becomes a fallback.",
  models: ["claude", "gpt", "gemini"],
  chairman: "claude"
})
```

## Interpreting the result

The tool returns:
- **answers**: raw responses from each model
- **leaderboard**: aggregated peer rankings (lower avgRank = better)
- **verdict**: the chairman's synthesis with **consensus** and **dissent** sections

**How to read it:**
1. Start with the **verdict**. If the consensus is strong and dissent weak, follow the consensus.
2. If the dissent raises an issue the consensus ignores, *prefer the dissent* — strong peer pressure often masks important contrarian signal.
3. Check the **leaderboard**. If one model ranks #1 across all voters, its answer is the empirical best.
4. If the models *strongly disagree* (no clear leader), the decision is probably underspecified — refine the question and rerun.

## Saving the verdict

Always save Tier 3 council verdicts as wiki/syntheses/ notes so future sessions can find them:

```bash
zed council "question here" --save
```

Or equivalently via MCP: run the council, then call `zed_write_note` with the rendered output under `wiki/syntheses/YYYY-MM-DD-council-<slug>.md` and include `source_paths: []` and `tags: [council, decision, synthesis]` in frontmatter.

## Fallback when keys are missing

If neither ANTHROPIC_API_KEY nor OPENROUTER_API_KEY is set, the council returns a structured failure note. Do NOT silently skip the council — surface the failure to the user and ask if they want to proceed without a second opinion, or set the keys and retry.

## Budget discipline

Council costs real money. Guard rails:
- Never invoke council inside a loop
- Never invoke council for the same question twice in one session (search first)
- For evolve mode, council fires AT MOST once per iteration, AT MOST at Tier 3
- **`ZED_COUNCIL_BUDGET`** (USD cap, enforced as of v8.1): set this env var
  to a dollar amount (e.g. `export ZED_COUNCIL_BUDGET=5.00`) and the
  council will refuse to start a new run once the ledger hits the cap,
  AND will skip the stage-3 chairman synthesis mid-run if the cap is
  reached after stages 1+2. The ledger persists to
  `<data-dir>/council-budget.json` across invocations.

Check and reset the ledger:

```bash
zed council --budget-status    # how much has the council cost so far?
zed council --reset-budget     # zero the ledger (e.g., start of a month)
```

The `result.budget` object in the `zed_council` MCP response also
reports `{cap, spent, remaining, calls}` so Claude can monitor spend
inside autonomous loops.
