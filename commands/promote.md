---
description: Promote a project-specific knowledge note to the global vault (available across all projects)
---

Run `zed promote "$ARGUMENTS"` via the Bash tool to promote the note from the project vault to the global vault.

Global knowledge is available across all projects — ideal for reusable patterns, anti-patterns, and learnings that apply everywhere.

If no note was specified, run `zed hubs` and `zed search --tag pattern` via the Bash tool to suggest candidates for promotion.

After promotion, confirm the note is now in the global vault and searchable via `zed global-search`.
