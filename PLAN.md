# small-coder — Plan

A pi package that replicates little-coder's "scaffold-model fit" secret sauce
for small local models. Everything ships as a proper `npm install`able pi
package — no forking pi, no Python substrate, just extensions + skills +
AGENTS.md.

## What we're stealing (the "secret sauce")

little-coder is literally: **pi + 20+ TypeScript extensions + 30 skill markdown
files + one launcher script**. The entire innovation is in how those extensions
hook pi's lifecycle events to correct small-model failure modes. We cherry-pick
the load-bearing pieces.

### Tier 1 — Core (non-negotiable, from the paper)

These are the mechanisms that moved a 9.7B model from 19% → 45% on Aider
Polyglot:

| Extension           | Role                                                                                                                                                       | Source file(s)           |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| **output-parser**   | Detects fenced ```tool / <tool_call> blocks in assistant text; queues a follow-up nudge to use native tool calls instead                                   | `parser.ts`, `index.ts`  |
| **quality-monitor** | Empty response, hallucinated tool names, repeated tool call loops → sends correction steer messages with a 2-strike cap                                    | `quality.ts`, `index.ts` |
| **write-guard**     | Write refuses on existing files; rewrites `/foo.md` root-bare paths to `<cwd>/foo.md`; returns Edit recipe on refusal                                      | `index.ts`               |
| **thinking-budget** | Caps thinking tokens per turn; forces off + queues "commit to implementation" nudge on breach; survives session replacement via synchronous abort recovery | `index.ts`               |

### Tier 2 — Context Integrity (high impact for small models)

Small context windows make these critical:

| Extension            | Role                                                                                                                                   | Source file(s)               |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| **read-guard**       | Trims oversized read results to first 30 lines + directive to grep/find instead; prevents single-file reads from evicting conversation | `index.ts`                   |
| **skill-inject**     | Per-turn tool-skill selection (error recovery > recency > intent prediction); budget-guarded, cached                                   | `index.ts`, `frontmatter.ts` |
| **knowledge-inject** | Algorithm cheat-sheet scoring (word=1.0, bigram=2.0) against user prompt; adds `## Algorithm Reference` block to system prompt         | `index.ts`                   |

### Tier 3 — Safety & Control

| Extension           | Role                                                                                                                 | Source file(s) |
| ------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------- |
| **permission-gate** | Bash whitelist (ls, cat, git log/status/diff, find, grep, cp, mv, mkdir…) via `LITTLE_CODER_PERMISSION_MODE` env var | `index.ts`     |
| **tool-gating**     | Blocks tools not in `LITTLE_CODER_ALLOWED_TOOLS`; publishes list on `systemPromptOptions` for skill-inject filtering | `index.ts`     |
| **turn-cap**        | Max turns per agent run; aborts via `ctx.abort()` when exceeded                                                      | `index.ts`     |
| **checkpoint**      | Backs up files before Write/Edit to `~/.small-coder/checkpoints/<session>/`                                          | `index.ts`     |

### Tier 4 — Extras (nice-to-have)

| Extension       | Role                                                                    | Source file(s)        |
| --------------- | ----------------------------------------------------------------------- | --------------------- |
| **extra-tools** | Glob, WebFetch, WebSearch tools (pi ships grep/find but not glob/web)   | `index.ts`, `glob.ts` |
| **branding**    | Replaces pi's startup header with small-coder branding + terminal title | `index.ts`            |

### Shared infrastructure

| File                      | Role                                                                                                                    |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `_shared/intervention.ts` | Uniform "harness intervention: …" notification — every scaffolding override surfaces as one consistent line to the user |
| `skills/` directory       | Skill markdown files (tool guidance + knowledge cheat sheets) with YAML frontmatter                                     |

---

## Architecture

```
small-coder/
├── package.json              # npm package; "pi" manifest declares extensions/skills/prompts paths
├── tsconfig.json
├── .gitignore
├── AGENTS.md                 # System prompt (the little-coder persona + runtime invariants)
├── README.md                 # This is what the user sees first
├── PLAN.md                   # ← you are here
├── bin/
│   └── small-coder.mjs       # Launcher: spawns pi with --no-extensions, wires in bundled set
├── extensions/               # All extension source (auto-discovered via "pi" manifest)
│   ├── _shared/              # Library code (NOT an extension — skipped by auto-discovery)
│   │   └── intervention.ts   # Uniform harness-intervention UI helper
│   ├── output-parser/
│   │   ├── index.ts
│   │   └── parser.ts         # JSON repair + text-based tool-call extraction
│   ├── quality-monitor/
│   │   ├── index.ts
│   │   └── quality.ts        # assessResponse + buildCorrectionMessage + phraseForUser
│   ├── write-guard/
│   │   └── index.ts          # normalizeWritePath + Write refusal on existing files
│   ├── read-guard/
│   │   └── index.ts          # Oversized read trimming to 30 lines
│   ├── thinking-budget/
│   │   └── index.ts          # Thinking token cap + forced-off recovery
│   ├── skill-inject/
│   │   ├── index.ts          # Error-recovery > recency > intent skill selection
│   │   └── frontmatter.ts    # Minimal YAML frontmatter parser
│   ├── knowledge-inject/
│   │   └── index.ts          # Keyword/bigram scoring + algorithm cheat-sheet injection
│   ├── permission-gate/
│   │   └── index.ts          # Bash whitelist enforcement
│   ├── tool-gating/
│   │   └── index.ts          # LITTLE_CODER_ALLOWED_TOOLS enforcement
│   ├── turn-cap/
│   │   └── index.ts          # Max turns abort
│   ├── checkpoint/
│   │   └── index.ts          # Pre-write backups to ~/.small-coder/checkpoints/
│   └── extra-tools/
│       ├── index.ts          # Glob + WebFetch + WebSearch tools
│       └── glob.ts           # Bounded glob walk with heavy-dir pruning
├── skills/
│   ├── tools/                # 14 tool-usage cards (read, write, edit, bash, grep, etc.)
│   └── knowledge/            # Algorithm cheat sheets (binary search, DP, DFS/BFS…)
└── .pi/
    └── settings.json         # Per-model profiles (thinking_budget, temperature, budgets)
```

---

## Implementation Phases

### Phase 1 — Foundation (Week 1)

- [x] Initialize repo with PLAN.md + README.md
- [x] `package.json` with `"pi"` manifest, proper dependencies
      (`@earendil-works/pi-coding-agent`, `@sinclair/typebox`)
- [x] `tsconfig.json` for TypeScript support (jiti handles runtime transpilation
      but TS helps during dev)
- [x] `_shared/intervention.ts` — the uniform notification helper
- [x] `AGENTS.md` — the system prompt (little-coder persona + Write/Read/Edit
      invariants)
- [x] `bin/small-coder.mjs` — launcher script (Node.js ≥22 preflight, resolves
      pi entry, auto-discovers extensions, spawns pi with
      `--no-context-files --no-extensions`)

### Phase 2 — Core Extensions (Week 1-2)

- [x] **output-parser** — `parser.ts` (JSON repair + text tool-call
      extraction) + `index.ts` (turn_end handler)
- [x] **quality-monitor** — `quality.ts` (assessResponse,
      buildCorrectionMessage) + `index.ts` (turn_end handler with
      consecutive-failure cap)
- [x] **write-guard** — path normalization + Write refusal on existing files via
      `tool_call` interception
- [x] **thinking-budget** — per-turn thinking token counting, forced-off
      recovery on breach

### Phase 3 — Context Integrity (Week 2-3)

- [x] **read-guard** — oversized read trimming with context-window awareness
- [x] **skill-inject** — frontmatter parser + error-recovery/recency/intent
      selection algorithm
- [x] **knowledge-inject** — keyword/bigram scoring + system prompt injection

### Phase 4 — Safety & Extras (Week 3-4)

- [x] **permission-gate** — bash whitelist enforcement with env var
      customization
- [x] **tool-gating** — allowed-tools enforcement
- [x] **turn-cap** — max turns abort
- [x] **checkpoint** — pre-write file backups
- [x] **extra-tools** — glob, webfetch, websearch tools

### Phase 5 — Polish (Week 4)

- [x] Skills directory: tool cards (read, write-edit, bash, grep) + knowledge
      cheat sheets (binary-search, dp, dfs-bfs, two-pointers, hash-map)
- [x] `.pi/settings.json` with per-model profiles and budget defaults
- [x] `branding` extension for startup header
- [x] Tests for core parser/quality/frontmatter logic (vitest — 30 tests, all
      passing)
- [ ] npm publish readiness + README completion

---

## Key Design Decisions vs. little-coder

| Aspect                 | little-coder                                              | small-coder                                                                                                   | Rationale                                                                                                                        |
| ---------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Distribution           | Global npm binary (`little-coder` CLI wrapper)            | **pi package** (`npm install -g`, then `pi` auto-discovers via `.pi/extensions/`)                             | Users already have pi; no need for a separate launcher binary. The "pi + extensions" model is the native distribution mechanism. |
| Launcher script        | Yes — `bin/little-coder.mjs` wraps pi with custom argv    | **Optional** — can also ship as a wrapper for users who want the exact little-coder CLI experience            | Give both options: pure pi package (recommended) and launcher (compatibility).                                                   |
| Provider registration  | Bundled `llama-cpp-provider` extension from `models.json` | Skip by default; let pi handle providers natively. Users register local models via `~/.pi/agent/models.json`. | Reduces scope; pi already supports 20+ providers including llama.cpp, Ollama, LM Studio.                                         |
| Benchmark harness      | Python-based RPC client + test drivers                    | **Out of scope**                                                                                              | This project focuses on the agent scaffolding, not benchmarking.                                                                 |
| Browser/Evidence tools | Playwright browser automation + evidence store            | Out of scope for initial release; can be added later as optional extensions.                                  | Specialized research use case; not core to small-model coding.                                                                   |
| ShellSession backend   | tmux-proxy + subprocess backends                          | Use pi's built-in `bash` tool                                                                                 | ShellSession is a specialized benchmark tool; the standard bash tool works fine for day-to-day.                                  |

---

## Migration Path (for existing little-coder users)

A user who currently runs:

```bash
little-coder --model llamacpp/qwen3.6-35b-a3b
```

Can switch to small-coder by:

```bash
npm install -g @your-scope/small-coder
pi --model llamacpp/qwen3.6-35b-a3b
```

The extensions auto-discover from `.pi/extensions/` in the package, and
`AGENTS.md` is loaded via the system prompt mechanism. No launcher script needed
— pi handles everything natively.

For users who want the exact little-coder CLI wrapper (with its update-check,
quietStartup patching, etc.), we also ship `bin/small-coder.mjs` as an optional
drop-in replacement.

---

## Risks & Mitigations

1. **pi API surface changes** — We depend on `@earendil-works/pi-coding-agent`.
   If extension APIs change, our extensions break.
   - _Mitigation:_ Pin to a specific pi version in `package.json`; monitor
     upstream releases; write tests against the extension event types.

2. **TypeBox compatibility** — Extensions use TypeBox for tool parameter
   schemas. Must match the TypeBox version bundled with pi.
   - _Mitigation:_ Use `@sinclair/typebox` (the same package) as a peer
     dependency, matching pi's version.

3. **Jiti runtime transpilation limits** — Extensions are loaded by jiti without
   compilation. Some TS features may not work in all environments.
   - _Mitigation:_ Keep extensions simple; avoid advanced TS features; test on
     the minimum Node.js version (22.x).

4. **Skill/knowledge injection performance** — Loading and scoring hundreds of
   skill files per `before_agent_start` could slow startup.
   - _Mitigation:_ Lazy-load entries once at first use; cache scored blocks; cap
     total injected tokens via budget params.

5. **Session replacement footguns** — The thinking-budget extension's
   synchronous recovery pattern was needed because pi replaces sessions on
   abort. Other extensions must follow the same pattern.
   - _Mitigation:_ Document this pattern in a shared doc; review all extensions
     for stale-ctx risks.
