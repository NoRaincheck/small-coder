---
name: grep
description: Searching file contents efficiently
priority: 9
tags: ["grep", "search", "find"]
error_recovery_tags: ["missing_context", "empty_response"]
---

# Grep Tool — Efficient Search

## Use cases

- Find function/class definitions across a codebase
- Locate error messages, TODOs, FIXMEs
- Search for patterns in configuration files

## Tips

- **Before reading**: Use Grep to find relevant lines before using Read on large
  files
- The read-guard extension trims reads to 30 lines — grep first, then read
  targeted sections
- Combine with `find` for file discovery + content search workflow

```
Grep(pattern: "class.*Auth", path: "src/")
Grep(pattern: "TODO|FIXME", recursive: true)
```
