---
description: Show vault statistics, top hubs, and orphan notes
---

Run `zed stats` via the Bash tool to get current vault statistics, then present them clearly to the user.

Also run `zed hubs 5` via the Bash tool to show the most connected notes, and check for orphan notes using `zed clusters`.

Present a concise dashboard like:

```
Knowledge Engine v6 — Status
═══════════════════════════════
Notes:       [count]
Connections: [count]
Clusters:    [count]
Orphans:     [count]

Top Hubs:
1. [title] — [N] backlinks
2. [title] — [N] backlinks
...
```

If the vault is empty, suggest the user start by creating a decision record with `/zed:decide` or a daily note with `/zed:daily`.
