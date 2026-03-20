---
description: Search notes with graph-boosted ranking
---

Use the `zed_search` MCP tool to search the knowledge graph for "$ARGUMENTS".

Present results clearly with titles, scores, and backlink counts. If the user's query is broad, also run `zed related <top-result>` via the Bash tool to show connected knowledge.

If no results are found, suggest alternative search terms or recommend creating a new note with `zed_write_note`.
