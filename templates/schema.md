---
title: "ZED Vault Schema"
type: wiki-schema
tags: [schema, convention, ai-facing]
version: 8.0
---

# ZED Vault Schema

> Read this file before touching the wiki. It is the agent-facing contract
> for how this knowledge base is organised and maintained. The structure
> comes from Andrej Karpathy's [LLM wiki pattern](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f):
> immutable `raw/` sources, LLM-compiled `wiki/` entries, and this file as
> the schema that binds them together.

## Structure

```
vault/
├── raw/                     # IMMUTABLE — never edit, only add
│   ├── clips/               #   web clips (zed clip)
│   ├── repos/               #   repomix dumps (zed ingest-repo)
│   ├── papers/              #   PDFs (zed ingest-pdf)
│   └── transcripts/         #   YouTube + other transcripts (zed ingest-yt)
├── wiki/                    # COMPILED — the LLM owns this layer
│   ├── index.md             #   auto-maintained TOC (do not edit)
│   ├── log.md               #   append-only change log (do not edit)
│   ├── concepts/            #   abstract ideas, techniques, patterns
│   ├── entities/            #   people, projects, tools, companies, papers
│   └── syntheses/           #   cross-source write-ups, session snapshots
├── decisions/               # ADRs (zed_decide)
├── patterns/                # reusable patterns / anti-patterns
├── architecture/            # system architecture notes
├── sessions/                # daily session notes (zed daily)
├── _loop/                   # evolve-mode state (scope, objective, handoff)
├── _templates/              # user-override clip templates
└── schema.md                # this file
```

## Compile loop (how raw/ becomes wiki/)

When the user runs `zed compile`, the CLI scans `raw/` and `wiki/` and prints
a plan: what's uncompiled, what's stale, what's orphaned. You (the agent)
are expected to:

1. **Read the plan** — look at the uncompiled raw files.
2. **Read each raw source** via `zed_read_note` to get the full content.
3. **Decide the wiki category**:
   - `wiki/concepts/` — if the source introduces or deepens a concept.
   - `wiki/entities/` — if the source is about a specific person, project,
     paper, tool, or company.
   - `wiki/syntheses/` — if you're combining information from multiple
     raw sources into a single write-up.
4. **Write the wiki entry** via `zed_write_note` with frontmatter:
   ```yaml
   ---
   title: "..."
   type: wiki-concept | wiki-entity | wiki-synthesis
   tags: [...]
   source_paths: ["raw/clips/2026-04-10-example.md"]
   summary: "One-sentence description (shown on index.md)."
   ---
   ```
5. **Use `[[wikilinks]]`** liberally — cross-link concepts, entities, and
   relevant existing wiki entries. The graph layer uses these to compute
   backlinks + hubs + clusters.
6. **Run `zed compile` again** to update `index.md` + `log.md`.

## Conventions

- **Never edit `raw/`.** Raw sources are immutable. If a source is wrong,
  deprecate it in a wiki entry rather than rewriting it.
- **Every wiki entry must reference its sources** via `source_paths` in
  frontmatter. This is how `wiki-health` detects orphans and stale entries.
- **Keep summaries short** — one sentence, 150 chars max — so they fit in
  `index.md` without cluttering.
- **Prefer one concept / entity per file.** Big meta-notes belong in
  `wiki/syntheses/`.
- **Cross-link aggressively.** Every mention of a known concept should be
  a wikilink. That's what makes the compounding work.

## Operations

```bash
zed compile              # show plan, update index.md + log.md
zed wiki-health          # lint: orphans, stale sources, broken links
zed clip <url>           # add a new raw source from the web
zed ingest-repo <git>    # add a repo dump to raw/repos/
zed ingest-yt <url>      # add a transcript to raw/transcripts/
```

## When in doubt

Read `wiki/index.md` first. It is the authoritative TOC. If something isn't
on the index, it either doesn't exist or hasn't been compiled yet. The log
(`wiki/log.md`) tells you when each wiki entry was last touched.
