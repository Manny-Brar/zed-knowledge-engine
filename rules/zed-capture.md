---
description: ZED capture reminder — evaluate edits for knowledge capture
globs: ["**/*.js", "**/*.ts", "**/*.py", "**/*.go", "**/*.rs", "**/*.jsx", "**/*.tsx"]
---

After making significant code changes, evaluate:
- Did you choose between alternatives? → `zed template decision "<title>"` via Bash
- Did you discover a reusable pattern? → `zed template pattern "<title>"` via Bash
- Did something fail in a non-obvious way? → Note it as an anti-pattern

Only capture when genuinely persistence-worthy. Routine edits don't need notes.
