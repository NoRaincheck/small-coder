---
name: read
description: Reading files efficiently
priority: 10
tags: ["read", "file", "inspect"]
error_recovery_tags: ["empty_response", "missing_context"]
---

# Read Tool

Use `Read` to examine file contents. Always provide the full path.

## Tips for small models

- **Start narrow**: Read specific files, not directories. Use Grep to find
  content first.
- **Line ranges**: If a file is large, read in chunks using offset/limit
  parameters.
- **First 30 lines**: The read-guard extension automatically trims oversized
  reads — use this to your advantage by grepping for relevant sections before
  reading.

## Common patterns

```
Read(path: "src/utils.ts")
Read(path: "config.json", offset: 0, limit: 50)
```
