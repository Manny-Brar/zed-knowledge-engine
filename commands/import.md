---
description: Import markdown files into the knowledge vault
---

Run `zed import <directory>` via the Bash tool to import markdown files from the specified directory into the knowledge vault.

If "$ARGUMENTS" is provided, use it as the source directory. Otherwise, offer to scan the current working directory for markdown documentation files (README.md, docs/, etc.).

After import, run `zed stats` via the Bash tool to show the updated vault state and mention that the imported files are now searchable with `/zed:search`.
