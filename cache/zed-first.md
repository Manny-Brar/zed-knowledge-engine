---
description: ZED-First Principle — search vault before every task
---

Excellence is the minimum bar. Before starting any task:
1. Search the vault for prior knowledge — don't re-solve solved problems
2. Plan the approach — even simple tasks deserve 10 seconds of thought
3. After completing the task, evaluate: is this production quality?

If the work wouldn't survive a hostile code review, improve it before moving on.

Before starting any task, run `zed search <keywords>` via Bash to check if relevant knowledge exists in the vault. If matches are found, read the top result with the Read tool. This takes 2 seconds and prevents re-solving problems you've already solved.

After completing any task where you made a non-obvious decision, run `zed template decision "<title>"` via Bash to record it.
