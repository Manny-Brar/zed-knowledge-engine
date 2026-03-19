---
description: Create a new knowledge note from a template
---

Use the `ke_template` MCP tool to create a new note from a template.

If "$ARGUMENTS" is provided, parse it as "type title" (e.g., "decision Use PostgreSQL" or "pattern Error handling middleware").

Available template types:
- **decision** — Architecture Decision Record (ADR)
- **architecture** — Architecture documentation
- **postmortem** — Bug postmortem / incident report
- **pattern** — Reusable pattern or anti-pattern
- **daily** — Daily session note

If the user didn't specify a type, ask which template they want. If they didn't specify a title, ask for one.

After creation, show the file path and suggest they edit it to fill in the details.
