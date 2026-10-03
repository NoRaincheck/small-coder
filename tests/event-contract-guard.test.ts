import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { reasoningTokensOf } from "../extensions/thinking-budget/index.ts";

// Regression guard for the bug class that shipped three no-op extensions.
//
// pi's extension runner (core/extensions/runner.js):
//   - `tool_call` shares one mutable event across handlers, so `event.input`
//     mutation is documented and works
//   - every other event gets a FRESH object per handler, and only the
//     handler's RETURN VALUE is applied
//
// So writing to `event.systemPrompt`, `event.content`, `event.details` or
// `event.isError` is silently discarded. These tests fail the build if anyone
// reintroduces that pattern.

const EXTENSIONS_DIR = join(process.cwd(), "extensions");

// Mutation of these is legitimate — the SDK documents it.
const ALLOWED = [
  // write-guard rewrites a write target before the tool runs
  /event\.input\b[^\n]*=[^=]/,
  // read-guard-edit is the only other place that touches event.input
  /event\.input\.path\s*=/,
];

function collect(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "_shared" && dir === EXTENSIONS_DIR) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collect(full, out);
    } else if (entry.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

function offendingLines(file: string, pattern: RegExp): string[] {
  const lines = readFileSync(file, "utf-8").split("\n");
  const hits: string[] = [];
  lines.forEach((line, i) => {
    const code = line.replace(/\/\/.*$/, "");
    if (!pattern.test(code)) return;
    if (ALLOWED.some((allowed) => allowed.test(code))) return;
    hits.push(`${file}:${i + 1}: ${line.trim()}`);
  });
  return hits;
}

describe("extension event contract", () => {
  const files = collect(EXTENSIONS_DIR);

  it("finds the extensions directory", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it("no extension mutates event.systemPrompt in place", () => {
    const hits = files.flatMap((f) =>
      offendingLines(f, /\b\w+\.systemPrompt\s*\+?=/)
    );
    expect(hits).toEqual([]);
  });

  it("no extension mutates a tool_result in place", () => {
    const hits = files.flatMap((f) => offendingLines(f, /\b\w+\.content\s*=/));
    expect(hits).toEqual([]);
  });

  it("no extension reads skillPaths off before_agent_start", () => {
    // skillPaths is the RETURN value of resources_discover; it is not a field
    // on BeforeAgentStartEvent, so reading it there always yields undefined.
    const hits: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, "utf-8");
      if (!/before_agent_start/.test(src)) continue;
      if (/event\s*(as\s*\w+\s*)?\??\.\s*skillPaths/.test(src)) {
        hits.push(file);
      }
    }
    expect(hits).toEqual([]);
  });
});

describe("reasoningTokensOf", () => {
  it("reads pi's documented Usage.reasoning field", () => {
    expect(reasoningTokensOf({ reasoning: 1200 })).toBe(1200);
  });

  it("returns zero rather than undefined for an explicit zero", () => {
    expect(reasoningTokensOf({ reasoning: 0 })).toBe(0);
  });

  it("returns undefined when the provider reported no breakdown", () => {
    expect(reasoningTokensOf({ input: 10, output: 20 })).toBeUndefined();
    expect(reasoningTokensOf(undefined)).toBeUndefined();
    expect(reasoningTokensOf(null)).toBeUndefined();
    expect(reasoningTokensOf("nope")).toBeUndefined();
  });

  it("ignores the legacy cost.totalThoughts path pi never populated", () => {
    expect(reasoningTokensOf({ cost: { totalThoughts: 900 } })).toBeUndefined();
  });
});
