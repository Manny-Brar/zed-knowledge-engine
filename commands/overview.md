---
description: Comprehensive vault dashboard — stats, health, hubs, recent notes, and recommendations in one view
---

Generate a comprehensive knowledge vault overview by calling multiple tools:

1. `ke_stats` — vault statistics
2. `ke_health` — health score and recommendations
3. `ke_hubs` (limit 5) — most connected notes
4. `ke_recent` (limit 5) — recently modified notes
5. `ke_tags` — tag cloud
6. `ke_suggest_links` (limit 3) — quick link suggestions

Present as a clean dashboard:

```
Nelson Knowledge Engine — Vault Overview
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
