---
description: Create a decision record (Architecture Decision Record)
---

Help the user create a decision record. The topic is: "$ARGUMENTS"

If the user provided a topic, ask them brief clarifying questions to fill in:
1. **Context**: What is the problem or situation?
2. **Decision**: What was decided?
3. **Alternatives**: What other options were considered?
4. **Consequences**: What are the trade-offs?

Then use the `zed_decide` MCP tool to create the record with all fields.

If no topic was provided, ask the user what decision they'd like to document.

After creating the record, run `zed related <record-title>` via the Bash tool to check if this decision connects to any existing knowledge.
