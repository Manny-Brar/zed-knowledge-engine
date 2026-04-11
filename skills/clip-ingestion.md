---
name: clip-ingestion
description: Use this skill when the user wants to pull an external URL (article, doc, blog post, GitHub README, paper, YouTube video) into the ZED vault as a first-class knowledge node, or when you — during autonomous research — need to persist a source for future sessions. Covers when to use `zed_clip` vs `zed ingest-yt` / `zed ingest-repo`, how to pick a template, dedup rules, and what to do with the clipped file afterward.
---

# Clip Ingestion

ZED v8.0 adds headless web ingestion: `zed clip <url>` uses Playwright +
Defuddle (with Mozilla Readability as a fallback) to turn any URL into
clean markdown and file it under `vault/raw/clips/`. Templates bundled
under `templates/clip-templates/` shape the output.

## When to use

- The user says "clip this" / "save this article" / "add this to the vault"
- During Gate 2 research (execution-protocol skill), when a vault search
  doesn't cover a technique and the canonical source is a web page
- Inside an evolve loop's Gate 2.5 ingestion step, to persist research
  before committing to an implementation approach
- When you want a fact checked — clip the canonical source, then author
  a wiki entry referencing it
- Before a `zed_council` call, clip the relevant reference material so
  the council models can reason over it

## Which tool to use

| Kind of source | Tool | Output |
|---|---|---|
| Generic web page / article | `zed_clip <url>` | `raw/clips/YYYY-MM-DD-slug.md` |
| Anthropic docs, Claude engineering blog | `zed_clip <url>` (auto-routes via `anthropic-docs` template) | `raw/clips/anthropic/` |
| arXiv abstract page | `zed_clip <url>` (auto-routes via `arxiv` template) | `raw/papers/` |
| GitHub README (just the landing page) | `zed_clip <url>` | `raw/clips/github/` |
| GitHub full repo (code + all files) | Bash: `zed ingest-repo <git-url>` | `raw/repos/` |
| YouTube video transcript | Bash: `zed ingest-yt <url>` | `raw/transcripts/` |
| PDF paper (local or URL) | Bash: `zed ingest-pdf <path>` (v8.x) | `raw/papers/` |

**Default**: if you're unsure which template matches, just run
`zed_clip <url>` with no extra args. The URL triggers auto-match the
best-fitting bundled template. The generic `article.json` template is
the fallthrough and always works.

## Required frontmatter in output

Every clipped file gets this frontmatter automatically:

```yaml
---
title: "..."
type: "clip"              # or paper, transcript, repo-dump
source: "https://..."
source_host: "example.com"
author: "..."             # if extractable
published: "..."          # if extractable
clipped: "2026-04-10T..."
extractor: "defuddle"     # or readability, naive
tags: ["clip", "example-com", ...]
---
```

You do NOT need to edit the file after clipping — ZED's template engine
+ Defuddle already produce clean, well-structured markdown. If the
output is poor (e.g. a JS-heavy SPA gave a thin result), retry with:

```
zed clip <url> --strategy playwright
```

to force full JS rendering.

## After clipping — the two-step flow

Clipping only populates `raw/`. To turn it into compounding, cross-linked
knowledge, follow the `wiki-compiler` skill:

1. `zed_clip <url>` → writes to `raw/clips/...`
2. `zed_wiki_compile` → shows the new uncompiled entry
3. Read the raw file with `zed_read_note`, then write the compiled wiki
   entry with `zed_write_note` under `wiki/concepts/`, `wiki/entities/`,
   or `wiki/syntheses/` — include `source_paths: ["raw/clips/..."]` in
   frontmatter so `wiki-health` can track provenance.
4. `zed_wiki_compile` again → verifies `wiki/index.md` updated.

For a quick "just capture it, compile later" pass, stop at step 1 — the
raw file is searchable via `zed_search` immediately.

## Auth / private content

For pages behind a login, save a Playwright `storageState.json` once
(via a browser automation script), then pass it:

```
zed clip https://private.example.com/doc --auth /path/to/storageState.json --strategy playwright
```

Never commit `storageState.json` — treat it like a credential.

## Deduplication

`zed_clip` is idempotent for the same URL on the same day — re-running
overwrites the existing file. Different URLs with the same slug get a
`-2`, `-3`, etc. suffix. You never need to manually check for duplicates.

## Anti-patterns

- **Don't** clip the same URL five times "to be sure" — it's idempotent.
- **Don't** clip low-value URLs (ads, 404s, error pages) — just search
  again or refine the URL first.
- **Don't** edit `raw/` files by hand. They're immutable sources. If a
  clip is wrong, delete the file and re-clip, or write a correction note
  under `wiki/syntheses/`.
- **Don't** skip the compile step for important sources — a raw clip
  nobody has read is almost as useless as no clip at all. Follow the
  `wiki-compiler` skill within the same session whenever possible.
- **Don't** use `zed_clip` for code repos — use `zed ingest-repo` which
  shells out to repomix for a flattened, LLM-friendly dump.
