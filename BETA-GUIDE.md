# Nelson Knowledge Engine v6 — Beta Tester Guide

Thanks for testing the Nelson Knowledge Engine! Here's how to get started.

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
/ke:activate KE6-XXXX-XXXX-XXXX-XXXX
```

Use one of your assigned beta keys. Each key works on one machine.

## Quick Start (2 minutes)

1. **See your vault**: `/ke:overview`
2. **Record a decision**: `/ke:decide "Why we chose React over Vue"`
3. **Import project docs**: `/ke:import ./docs` (if you have a docs/ directory)
4. **Search**: `/ke:search authentication`
5. **Check health**: `/ke:health`

## Key Things to Test

### Does it work?
- [ ] Plugin loads without errors
- [ ] MCP tools appear (Claude can use `ke_search`, `ke_decide`, etc.)
- [ ] Commands work (`/ke:status`, `/ke:daily`, etc.)

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
| `/ke:overview` | Full dashboard |
| `/ke:search <query>` | Search knowledge |
| `/ke:decide <title>` | Record a decision |
| `/ke:daily` | Today's session note |
| `/ke:template <type> <title>` | Create from template |
| `/ke:health` | Vault quality score |
| `/ke:tags` | Browse by tags |
| `/ke:graph` | Visualize the graph |
| `/ke:import <dir>` | Import existing markdown |
| `/ke:promote <note>` | Move to global vault |
| `/ke:status` | Quick stats |
| `/ke:help` | Full help guide |
| `/ke:activate <key>` | Activate license |

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
- Global vault (`~/.nelson-ke/global/`) is separate from project vault
