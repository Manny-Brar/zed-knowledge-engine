# ZED Knowledge Engine v6 — Beta Tester Guide

Thanks for testing the ZED Knowledge Engine! Here's how to get started.

## Installation

```bash
# In Claude Code, run:
claude --plugin-dir /path/to/nelson-knowledge-engine
```

Or if installed from marketplace:
```bash
/plugin marketplace add mannybrar/nelson-plugins
/plugin install nelson-knowledge-engine
```

## Activate Your Beta Key

```bash
/zed:activate KE6-XXXX-XXXX-XXXX-XXXX
```

Use one of your assigned beta keys. Each key works on one machine.

## Quick Start (2 minutes)

1. **See your vault**: `/zed:overview`
2. **Record a decision**: `/zed:decide "Why we chose React over Vue"`
3. **Import project docs**: `/zed:import ./docs` (if you have a docs/ directory)
4. **Search**: `/zed:search authentication`
5. **Check health**: `/zed:health`

## Key Things to Test

### Does it work?
- [ ] Plugin loads without errors
- [ ] MCP tools appear (Claude can use `zed_search`, `zed_decide`, etc.)
- [ ] Commands work (`/zed:status`, `/zed:daily`, etc.)

### Does it feel useful?
- [ ] Does the knowledge graph actually help Claude give better answers?
- [ ] Does auto-capture (session hooks) work in the background?
- [ ] Are the templates useful? Which would you change?
- [ ] Is the health score motivating or annoying?

### What's missing?
- [ ] What features would you pay $9/mo for that aren't here?
- [ ] What's confusing about the commands/tools?
- [ ] What would you remove?

## All Commands

| Command | What it does |
|---------|-------------|
| `/zed:overview` | Full dashboard |
| `/zed:search <query>` | Search knowledge |
| `/zed:decide <title>` | Record a decision |
| `/zed:daily` | Today's session note |
| `/zed:template <type> <title>` | Create from template |
| `/zed:health` | Vault quality score |
| `/zed:tags` | Browse by tags |
| `/zed:graph` | Visualize the graph |
| `/zed:import <dir>` | Import existing markdown |
| `/zed:promote <note>` | Move to global vault |
| `/zed:status` | Quick stats |
| `/zed:help` | Full help guide |
| `/zed:activate <key>` | Activate license |

## Feedback

Please share:
1. What worked well
2. What didn't work / was confusing
3. What features you'd want added
4. Would you pay $9/mo for this? Why or why not?

Send feedback to: [contact method]

## Known Issues

- macOS with Node 24 may need `CXXFLAGS` for initial `npm install` (see README)
- First build on large vaults (1000+ notes) takes ~100ms — subsequent rebuilds are faster
- Global vault (`~/.zed/global/`) is separate from project vault
