---
name: wiki-compiler
description: Use this skill when the user runs `zed compile`, when `zed wiki-health` surfaces uncompiled raw sources, or whenever there are new `raw/` files that haven't been integrated into `wiki/` yet. This skill implements Karpathy's "LLM as compiler" pattern — you turn immutable raw sources into persistent, cross-linked wiki entries.
---

# Wiki Compiler

You are operating as the **compiler** in ZED's Karpathy-style knowledge
architecture. Raw sources live in `vault/raw/` and are immutable. The
wiki lives in `vault/wiki/` and is the compounding artifact you maintain.
`schema.md` is your contract.

## When this skill fires

- User ran `zed compile` and a plan was printed showing uncompiled raw files
- `zed wiki-health` flagged uncompiled or stale entries
- The pre-compact hook fired and referenced uncompiled work
- During evolve-mode Gate 3.5 (Research), after `zed clip` has added new sources
- At session start when the SessionStart hook reports > 0 uncompiled raw files

## Your job

For each uncompiled raw file:

1. **Read the raw source** via `zed_read_note` (or `Bash: cat`).
2. **Classify** into one of three wiki categories:
   - `wiki/concepts/` — abstract ideas, techniques, patterns, mental models
   - `wiki/entities/` — people, projects, tools, companies, papers, repos
   - `wiki/syntheses/` — anything that combines multiple raw sources
3. **Extract** the signal: the key claims, definitions, data points, quotes,
   caveats. Leave noise (ads, navigation, boilerplate) behind.
4. **Cross-link** everything that touches an existing wiki entry:
   - Run `zed_search "<concept>"` before writing to discover existing entries
   - Use `[[wikilinks]]` to both the raw source AND other wiki nodes
5. **Write the wiki entry** via `zed_write_note` with required frontmatter:
   ```yaml
   ---
   title: "Effective Harnesses for Long-Running Agents"
   type: wiki-concept
   tags: [harness, agents, context-engineering, anthropic]
   source_paths: ["raw/clips/anthropic/2026-04-10-effective-harnesses.md"]
   summary: "Design patterns for agent loops that survive many context windows."
   created: 2026-04-10
   updated: 2026-04-10          # bump every time you meaningfully edit
   # expires_at: 2027-04-10     # optional: auto-flagged by wiki-health
   # superseded_by: "Foo v2"    # optional: points to a newer entry
   ---
   ```

   **Temporal fields (v8.1)**: `created` / `updated` / `expires_at` /
   `superseded_by` are optional but recommended. `wiki-health` surfaces
   expired entries so they can be refreshed, and `superseded_by` lets
   you deprecate without deleting — search ranking can skip superseded
   nodes.
6. **Run `zed compile` again** after you finish a batch so `index.md` and
   `log.md` update.

## Frontmatter rules

- **`source_paths` is mandatory.** It is how `wiki-health` detects orphans
  and stale entries when the underlying raw file changes.
- **`summary` is mandatory and max ~150 chars.** It goes into `index.md`
  — keep it scannable.
- **`tags`** should include the category (concept/entity/synthesis), the
  domain (e.g. `harness`, `memory`, `retrieval`), and any canonical names.

## Anti-patterns

- **Don't write to `raw/`.** Raw sources are immutable. If you find an
  error, write a `wiki/syntheses/` correction note that references the
  flawed source and explains the fix.
- **Don't dump the raw source verbatim.** You are compiling — extract,
  restructure, cross-link. If the compiled entry looks like a copy of the
  raw content, you did it wrong.
- **Don't leave orphans.** Every wiki entry must have at least one
  `[[wikilink]]` to another wiki entry or to `schema.md` if it's a
  foundational definition.
- **Don't compile one-off noise.** If a clip is low-value (an ad, a broken
  page, a 404), delete the raw file instead of compiling it. ZED will not
  mind a missing raw — but it WILL mind a worthless wiki entry.

## Batch workflow

When the compile plan has many uncompiled sources (e.g. after a long
research session), work in batches of 3-5 related sources at a time:

1. Group by topic using `zed_search` + `zed backlinks` (Bash)
2. Read the group together (reduces re-reading)
3. Write 1-2 synthesis entries covering the group
4. Write individual concept/entity entries as needed
5. Run `zed compile` and `zed wiki-health` to verify

## Outputs

After you finish a compile pass, tell the user:

- How many wiki entries you created/updated
- What categories (concept / entity / synthesis)
- What cross-links you created
- Any sources you deliberately skipped and why

Then the user can run `zed compile` to see the updated index and log.
