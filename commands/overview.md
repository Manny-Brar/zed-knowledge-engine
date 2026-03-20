---
description: Show a full vault dashboard with stats, health, and hubs
---

Generate a comprehensive knowledge vault overview by running `zed overview` via the Bash tool, which gathers all data in one call:

- Vault statistics, health score, top hubs, recent notes, tags, and link suggestions

Alternatively, gather the data piecemeal via individual CLI calls:

1. `zed stats` — vault statistics
2. `zed health` — health score and recommendations
3. `zed hubs 5` — most connected notes
4. `zed recent 5` — recently modified notes
5. `zed tags` — tag cloud
6. `zed suggest-links 3` — quick link suggestions

Present as a clean dashboard:

```
ZED Knowledge Engine — Vault Overview
═════════════════════════════════════════
Health: B (78/100) — Good

Stats: 42 notes | 87 connections | 3 clusters | 2 orphans

Top Hubs:
  1. API Architecture (12 backlinks)
  2. Auth Strategy (8 backlinks)
  ...

Recent Activity:
  1. Session 2026-03-19 — 2h ago
  2. JWT Decision — 1d ago
  ...

Tags: decision (8) | pattern (5) | architecture (3) | session (12)

Suggestions:
  - "Auth module" mentions "JWT Decision" but doesn't link to it
  ...
```

Keep it concise. This is the "one command to see everything" experience.
