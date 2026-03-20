---
description: Capture evaluation rubric for ZED Full mode. Defines what to write to the vault, what to skip, quality standards, and the session summary protocol. Referenced by the behavior-controller when Full mode is active.
---

## ZED Full Mode — Capture Rubric

When Full mode is active, evaluate ALL output for vault storage. This rubric defines the decision boundary between signal and noise.

---

### What to Capture

**Architecture/approach decisions** — Use `zed_decide`
- When a non-obvious choice was made between alternatives
- Include: what was decided, what was rejected, and why
- Tag with the domain area (e.g., `database`, `api-design`, `auth`)

**Reusable patterns/solutions** — Use `zed_write_note` in `patterns/`
- Solutions to problems likely to recur
- Include: problem, solution, when to apply, concrete example
- If the pattern spans domains, link to all relevant areas

**Non-obvious insights** — Use `zed_write_note` in `architecture/`
- Things that required significant reasoning to understand
- Constraints discovered during implementation
- Implicit dependencies between components
- Performance characteristics learned empirically

**Research findings** — Use `zed_write_note`
- Comparison results (tool X vs tool Y)
- Benchmark data
- API quirks or undocumented behavior
- Third-party library evaluations

**Anti-patterns (things that failed)** — Use `zed_write_note` in `patterns/`
- Tag with `anti-pattern` in frontmatter
- Include: what was tried, why it failed, what to do instead
- Include: how to detect the failure mode early

---

### What NOT to Capture

Do not write these to the vault. They add noise without value.

- **Code snippets under 20 lines with no novel logic** — If the code is straightforward and follows established patterns, it does not need to be in the vault.
- **Factual lookups** — Things easily re-searched (API docs, syntax references, standard library methods). The vault is not a search engine cache.
- **Things already in the vault** — Before writing, run `zed_search` to check if this knowledge already exists. Update existing notes rather than creating duplicates.
- **Trivial fixes** — Typos, formatting changes, import reordering, linting fixes. These are not knowledge.
- **Obvious implications** — If anyone familiar with the codebase would immediately know this, it does not need to be written down.

---

### Write Quality Rules

Every note written in Full mode must meet these standards:

1. **Include WHY, not just WHAT.** "We use Redis for session storage" is incomplete. "We use Redis for session storage because sessions are ephemeral, high-frequency, and we need sub-ms reads across multiple server instances" is knowledge.

2. **Use [[wikilinks]] to connect to existing knowledge.** Every new note should link to at least one existing note. Isolated notes are dead knowledge — connected notes compound.

3. **Include tags in frontmatter for searchability.** Use specific, consistent tags. `database` not `db`. `authentication` not `auth`. Check existing tags with `zed_search` before inventing new ones.

4. **Be specific.** "Use transactions for multi-step DB operations" is useful. "Be careful with databases" is not. If the note could apply to any project, it is too generic.

5. **One idea per note.** If a note covers two distinct concepts, split it. Atomic notes link better than monoliths.

---

### Session Summary

At the end of every Full mode task, append a summary to the daily note:

```
zed daily "summary"
```

The summary should include:
- What was accomplished
- Decisions made (with links to ADRs if created)
- Knowledge captured (list of notes written)
- Open questions or follow-ups for next session
