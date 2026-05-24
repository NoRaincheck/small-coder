# small-coder

**A coding agent tuned for small local language models, built on top of
[pi](https://pi.dev).**

small-coder ships as a proper pi package — no separate launcher binary, no
Python substrate. Just extensions + skills + AGENTS.md that auto-discover when
you install via npm.

## What is this?

pi ships with four tools (read / write / edit / bash) and a ~1000-token system
prompt. That's great for frontier models but leaves small local models
floundering — they produce malformed tool calls, loop on identical actions, read
entire files that blow their context window, over-think instead of implementing,
and call tools that don't exist.

small-coder fixes all of these with **20+ TypeScript extensions** that hook pi's
lifecycle events:

- **output-parser**: Detects fenced ```tool blocks and <tool_call> tags in
  assistant text; nudges the model back to native tool calls
- **quality-monitor**: Catches empty responses, hallucinated tools, repeated
  action loops — sends correction messages with a 2-strike cap
- **write-guard**: Write refuses on existing files (forces Edit), rewrites
  root-bare `/foo.md` paths to `<cwd>/foo.md`
- **thinking-budget**: Caps thinking tokens per turn; forces off + queues
  "commit to implementation" nudge on breach
- **read-guard**: Trims oversized read results to first 30 lines before they
  overflow the context window
- **skill-inject**: Per-turn tool-skill cards selected by error recovery >
  recency > intent prediction (budget-guarded)
- **knowledge-inject**: Algorithm cheat sheets scored against user prompt via
  keyword/bigram matching
- **permission-gate**: Bash command whitelist (`ls`, `cat`,
  `git log/status/diff`…) — configurable per deployment
- **tool-gating**: Blocks tools not in an allowed list (useful for benchmark
  runs)
- **turn-cap**: Maximum turns per agent run; aborts when exceeded
- **checkpoint**: Backs up files before Write/Edit to a session-scoped
  checkpoint directory
- **extra-tools**: Glob, WebFetch, WebSearch (pi ships grep/find but not these)

## Install

```bash
npm install -g small-coder
```

That's it. No launcher script needed — pi auto-discovers the extensions from
`.pi/extensions/` in your installed package.

> **Alternative: project-local install (npm)**
>
> ```bash
> cd ~/your-project
> npm install small-coder
> # Extensions live in node_modules/small-coder/.pi/extensions/ and are discovered by pi
> ```

> **Alternative: install from GitHub**
>
> ```bash
> cd ~/your-project
> pi install https://github.com/NoRaincheck/small-coder.git
> # Extensions live in .pi/extensions/small-coder/ and are auto-discovered
> ```

## Run

```bash
cd ~/your-project
pi --model llamacpp/qwen3.6-35b-a3b "Refactor the auth module"
```

Small-coder's extensions kick in automatically for every session. The system
prompt from bundled `AGENTS.md` is loaded, and all 20+ extensions are active.

### Local model setup (examples)

**llama.cpp:**

```bash
export LLAMACPP_API_KEY=noop
pi --model llamacpp/qwen3.6-35b-a3b
```

**Ollama:**

```bash
export OLLAMA_API_KEY=noop
ollama pull qwen3.5          # 9.7B — the paper's model
# or: ollama pull qwen3.6-35b-a3b
pi --model ollama/qwen3.5
```

**LM Studio:**

```bash
export LMSTUDIO_API_KEY=noop
pi --model lmstudio/local-model
```

Cloud models work the same way — extensions auto-disable for large/cloud models
so they don't interfere:

```bash
pi --model anthropic/claude-haiku-4-5 "What does this codebase do?"
```

## How it works

small-coder ships as a **pi package** with a `pi` manifest in its
`package.json`:

```json
{
  "name": "small-coder",
  "keywords": ["pi-package"],
  "pi": {
    "extensions": ["./extensions"],
    "skills": ["./skills"],
    "prompts": ["./prompts"]
  }
}
```

When you `npm install -g small-coder`, pi discovers the extensions from:

- Global: `~/.nvm/versions/node/vXX/node_modules/small-coder/.pi/extensions/`
- Project-local: `<project>/node_modules/small-coder/.pi/extensions/`

Each extension is a TypeScript module that exports a default factory function
receiving `ExtensionAPI`. Extensions hook events like `turn_end`, `tool_call`,
`before_agent_start`, and `context` to implement the small-model corrections.

### The "harness intervention" pattern

Every scaffolding override surfaces as one consistent line to the user:

```
harness intervention: the model has thought long enough — forcing it to start implementing.
```

This unified voice makes it clear when pi (not the model) is making a decision.

## Configuration

Per-model profiles control thinking budgets, temperatures, and skill/knowledge
injection budgets:

```json
// .pi/settings.json (project-local) or ~/.pi/agent/settings.json (global)
{
  "quietStartup": true,
  "compaction": { "enabled": true },
  "retry": { "enabled": true, "maxRetries": 2 }
}
```

Environment variables for deployment customization:

| Variable                       | Values                                     | Effect                                                   |
| ------------------------------ | ------------------------------------------ | -------------------------------------------------------- |
| `SMALL_CODER_PERMISSION_MODE`  | `auto` (default) / `accept-all` / `manual` | Bash whitelist enforcement mode                          |
| `SMALL_CODER_BASH_ALLOW`       | comma-separated prefixes                   | Extra bash allow-prefixes merged with built-in list      |
| `SMALL_CODER_ALLOWED_TOOLS`    | comma-separated tool names                 | Tool gating — only these tools can be called             |
| `SMALL_CODER_MAX_TURNS`        | integer                                    | Maximum turns per agent run (overrides turn-cap default) |

## Removing extensions

Since small-coder is a pi package, you can disable specific extensions in your
project-local settings:

```json
// .pi/settings.json
{
  "packages": ["npm:small-coder"],
  "extensions": {
    "npm:small-coder": [
      "write-guard",
      "quality-monitor",
      "thinking-budget"
      // disable others by omitting them
    ]
  }
}
```

Or simply delete extension directories after install. The pi package model means
extensions are just files on disk — remove what you don't need.

## What it does

small-coder is a focused extension stack that drops benchmark-specific
infrastructure (browser automation, evidence capture, custom ShellSession)
and focuses on what actually moves the needle for small-model coding:
output repair, quality correction, write guards, thinking budgets,
context management, and skill/knowledge injection.

