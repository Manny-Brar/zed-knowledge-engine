# Contributing to ZED

## Quick Start

```bash
git clone https://github.com/Manny-Brar/zed-knowledge-engine.git
cd zed-knowledge-engine
npm install
npm run test:all  # 146 tests, all should pass
```

## Project Structure

```
.claude-plugin/     Plugin manifest
agents/             6 specialized agents (planner, validator, researcher, etc.)
bin/zed             CLI with 32 subcommands
cli/                CLI tests
commands/           16 slash commands for Claude Code
core/               Knowledge engine (SQLite + FTS5 + graph)
hooks/              hooks.json + lifecycle hook config
memory/             ZED_SOUL.md identity document
prompts/            Session-injected protocol
rules/              Auto-injected behavioral rules
scripts/            5 hook scripts (session-start, post-edit, pre-compact, stop, session-end)
server/             MCP server (4 tools)
skills/             9 behavioral skills
templates/          8 note templates
```

## Architecture

ZED has four layers:

1. **Core Engine** (`core/`) — SQLite database with FTS5 full-text search and graph operations
2. **Interface Layer** (`server/` + `bin/`) — MCP tools (4) and CLI commands (32)
3. **Protocol Layer** (`skills/` + `prompts/` + `rules/`) — Behavioral enforcement
4. **Hook Layer** (`scripts/`) — External lifecycle enforcement via 5 hooks

## Running Tests

```bash
npm test          # Core engine (49 tests)
npm run test:mcp  # MCP server (17 tests)
npm run test:cli  # CLI + hooks (80 tests)
npm run test:all  # Everything (146 tests)
npm run bench     # Performance benchmarks (500 + 1000 notes)
```

## Adding a New Command

1. Create `commands/your-command.md` with frontmatter:
   ```yaml
   ---
   description: What this command does
   ---
   ```
2. Add the implementation to `bin/zed` in the commands object
3. Add help text to `printHelp()`
4. Add tests to `cli/test-cli.cjs`
5. Copy to cache for testing: `cp commands/your-command.md ~/.claude/plugins/cache/zed-marketplace/zed/7.0.0/commands/`

## Adding a New Skill

1. Create `skills/your-skill.md` with frontmatter:
   ```yaml
   ---
   name: your-skill
   description: When this skill should activate
   ---
   ```
2. Add trigger condition to `skills/behavior-controller.md` trigger table
3. Copy to cache for testing

## Adding a New Agent

1. Create `agents/your-agent.md` with frontmatter:
   ```yaml
   ---
   name: your-agent
   description: What this agent does
   model: sonnet  # or opus, haiku
   disallowedTools:
     - Edit  # if read-only
   ---
   ```
2. Note: Plugin-defined agents cannot access MCP tools (GitHub #21560). Use CLI via Bash instead.

## Code Quality

- No external linter configured — keep code clean manually
- Every CLI command must support `--json` flag
- Every error path must produce a clear, actionable message
- Path traversal checks on all file read/write operations
- Tests required for new features

## Commit Messages

Format: `type: description`

Types: `feat`, `fix`, `test`, `perf`, `docs`, `refactor`, `release`
