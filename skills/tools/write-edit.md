---
name: Write vs Edit Decision
description: When to use Write vs Edit
priority: 10
tags: ["write", "edit", "file"]
error_recovery_tags: ["write_refused", "existing_file"]
---

# Write vs Edit — Which to Use?

## `write` — Create new files only

- Creates a file that **does not exist yet**
- Fails (with guidance) if the file already exists
- Path normalization: `/foo.md` → `<cwd>/foo.md`

## `edit` — Modify existing files (recommended for changes)

- Requires exact `old_string` / `new_string` matching
- **Read first**: Always use Read before Edit to get line numbers and precision
- Multiple edits in one call using overlapping-free regions
- If old_string appears multiple times, add surrounding context or use
  `replace_all: true`

## Common mistake pattern (small models)

❌ Trying to Write an existing file → refusal ✅ Instead: Read the file, then
Edit with exact matches
