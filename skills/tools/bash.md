---
name: bash
description: Shell command best practices
priority: 8
tags: ["bash", "shell", "command"]
error_recovery_tags: ["permission_blocked", "timeout"]
---

# Bash Tool — Best Practices

## Timeout management

- Default timeout is **30 seconds** for bash commands
- For slow operations (npm install, builds, tests), explicitly set `timeout` to
  120–300

## Permission gating

- Commands are checked against a whitelist (`LITTLE_CODER_PERMISSION_MODE`)
- Common allowed: ls, cat, git log/status/diff, find, grep, cp, mv, mkdir, npm
  install, pip install
- If blocked, use an allowed alternative or request permission in manual mode

## Safe patterns

```
Bash(command: "ls -la src/")
Bash(command: "npm test", timeout: 120)
Bash(command: "git diff --stat")
```
