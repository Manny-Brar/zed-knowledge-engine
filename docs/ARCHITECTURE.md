# ZED Architecture

## Data Flow

```
User Prompt
    |
    +- SessionStart hook fires
    |   +- Rebuilds graph, shows stats, loads soul doc
    |
    +- Rules auto-inject (zed-first, zed-capture, zed-verify)
    |
    +- Behavior Controller skill evaluates mode
    |   +- Light: silent search -> work -> maybe capture
    |   +- Full: deep load -> work -> evaluate -> capture
    |   +- Evolve: gate cycle -> work -> capture -> handoff -> loop
    |
    +- PostToolUse hook tracks edits
    |
    +- PreCompact hook reminds to flush
    |
    +- Stop hook
        +- No loop: session-end cleanup -> allow
        +- Active loop: enforce capture + handoff + drift -> block/allow
```

## Knowledge Graph

```
Markdown Notes (.md)
    |
    +- FileLayer: parse frontmatter, body, wikilinks
    +- GraphLayer: build nodes + edges in SQLite
    +- SearchLayer: FTS5 index with graph-boosted ranking
    +- KnowledgeEngine: coordinates all layers
        |
        +- Project vault: ~/.zed-data/vault/
        +- Global vault: ~/.zed/global/
        +- Database: ~/.zed-data/knowledge.db
```

## Hook Enforcement Chain

```
SessionStart ----> PostToolUse ----> PreCompact ----> Stop
    |                  |                 |              |
    |                  |                 |              +- Capture gate
    |                  |                 |              +- Handoff gate
    |                  |                 |              +- Drift gate
    |                  |                 |              +- Loop continuation
    |                  |                 |
    |                  |                 +- Flush reminder
    |                  |
    |                  +- Edit tracker + drift warning
    |
    +- Graph rebuild + soul doc + vault stats + yesterday's items
```
