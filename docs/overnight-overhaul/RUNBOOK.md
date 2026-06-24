# Overnight Overhaul — Iteration RUNBOOK (autonomous, scope-locked)

This file is the procedure every cron-fired iteration MUST follow. Each firing does
**exactly ONE task**, test-gated and committed, then stops (the cron fires the next in ~5 min).
You are operating UNATTENDED. Safety and reversibility beat speed. When in doubt, stop and log.

## On each firing

1. **Re-anchor.** Read `PROGRESS.md` (state) and `PLAN.md` (task queue). Read this RUNBOOK.
2. **Check STOP conditions FIRST.** Stop (see "Stopping" below) if ANY:
   - a file `docs/overnight-overhaul/STOP` exists, OR
   - `failStreak >= 3`, OR
   - `iteration >= maxIterations`, OR
   - every task in PLAN is `done`, `blocked`, or `review` (queue drained).
3. **Pick the next task**: the first task in PLAN with status `todo`. Skip `blocked`/`review`/`done`.
4. **Scope-lock gate.** Before editing, confirm: "This task achieves the Phase objective by [mechanism]."
   Only edit files in the task's declared file set (∪ the global scope set in PLAN). If the task needs
   anything outside scope → mark it `blocked` with a note, and stop. NO unrelated refactors.
5. **Implement** the task. Keep it minimal and idiomatic to the surrounding code.
6. **Test-gate (HARD).** Run `npm test` AND the affected suite(s) (e.g. `node core/test-autolink.cjs`).
   - GREEN → continue.
   - RED → make at most ONE focused fix attempt, re-run. Still red → `git checkout -- <changed files>`
     to revert this task entirely, set the task status `failed`, increment `failStreak`, append a log
     line explaining the failure, and **stop** (do not start another task).
7. **Commit** (green only): `git add -A` then commit on branch `zed-overnight-overhaul` with a clear
   message `iterN(taskID): <what changed>`. NEVER push. NEVER commit the stray `${CLAUDE_PLUGIN_DATA}/` dir.
8. **Measure + record.** Run `zed metrics 2>/dev/null | head -20` to capture orphan/edge numbers. In
   `PROGRESS.md`: set the task status `done`, increment `iteration`, reset `failStreak` to 0, and append a
   log line: `iterN | taskID | done | orphanCount=NN edges/node=N.NN | <one-line summary>`.
9. **Document.** If the task changed user-facing behavior or a public API, update the relevant doc under
   `docs/` (and `CHANGELOG.md` if appropriate). Keep `PLAN.md` statuses in sync.
10. **Stop this turn.** Do not chain into another task. Become idle; the cron fires the next iteration.

## Scope-lock / Drift firewall (NEVER do these unattended)

- The tasks marked `EXCLUDED` in PLAN (prompt MUST-cut / trigger-table / ULTRATHINK rewrite) — these have
  NO automated test net and high blast radius. Leave them for human review. Never touch them.
- No new npm dependencies unless a task explicitly authorizes it AND it degrades gracefully.
- No changes to CI, release scripts, or `package.json` version.
- No edits outside the file set declared in PLAN for the active task.
- No pushing to remote. No force operations. No history rewrites.

## Stopping

To stop cleanly: append a final log line in `PROGRESS.md` with the reason; if a cron job id is recorded
in PROGRESS (`cronJobId`), call CronDelete on it (or CronList → CronDelete). Then summarize what was done.
A human can also stop the run anytime with `/zed:evolve --stop` or by creating the `STOP` file.

## Reliability notes

- Each iteration is self-contained: it reads state from files, so a fresh/compacted context resumes cleanly.
- The cron only fires while the Claude Code REPL is idle and the session is alive. If nothing happens for a
  while, the machine may have slept or the session ended — progress is preserved in commits + PROGRESS.md;
  resume by re-arming the cron or running iterations manually.
