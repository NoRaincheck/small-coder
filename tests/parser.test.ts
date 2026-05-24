import { describe, expect, it } from "vitest";
import {
  type ExtractedCall,
  parseTextToolCalls,
  repairJson,
  safeParseJson,
} from "../extensions/output-parser/parser.ts";

describe("repairJson", () => {
  it("handles trailing commas", () => {
    const result = repairJson('{ "a": 1, "b": 2, }');
    expect(() => JSON.parse(result)).not.toThrow();
    expect(JSON.parse(result)).toEqual({ a: 1, b: 2 });
  });

  it("replaces single quotes with double quotes", () => {
    const result = repairJson("{ 'name': 'test', }");
    expect(() => JSON.parse(result)).not.toThrow();
    expect(JSON.parse(result)).toEqual({ name: "test" });
  });

  it("adds missing closing braces", () => {
    const result = repairJson('{ "key": "value"');
    expect(() => JSON.parse(result)).not.toThrow();
    expect(JSON.parse(result)).toEqual({ key: "value" });
  });

  it("strips trailing garbage after valid JSON", () => {
    const result = repairJson('{"a":1} some trailing text');
    expect(() => JSON.parse(result)).not.toThrow();
    expect(JSON.parse(result)).toEqual({ a: 1 });
  });
});

describe("safeParseJson", () => {
  it("parses valid JSON directly", () => {
    expect(safeParseJson('{"a": 1}')).toEqual({ a: 1 });
  });

  it("repairs and parses broken JSON", () => {
    const result = safeParseJson("{ 'key': 'val', }");
    expect(result).toEqual({ key: "val" });
  });

  it("returns _raw sentinel for unrepairable JSON", () => {
    const result = safeParseJson("not json at all {{{");
    expect(result).toHaveProperty("_raw");
  });
});

describe("parseTextToolCalls", () => {
  it("extracts fenced tool blocks", () => {
    const text = `Here's my plan:
\`\`\`tool
{"name": "Bash", "arguments": {"command": "ls -la"}}
\`\`\`
Let me execute that.`;

    const calls = parseTextToolCalls(text);
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0].name).toBe("Bash");
  });

  it("extracts XML-style tool tags", () => {
    const text =
      `I'll run bash: <tool>bash</tool><args>{"command": "echo hello"}</args>`;
    const calls = parseTextToolCalls(text);
    expect(calls.length).toBeGreaterThan(0);
  });

  it("deduplicates identical calls", () => {
    const text = `
\`\`\`tool
{"name": "Bash", "arguments": {"command": "ls"}}
\`\`\`
And also:
\`\`\`tool
{"name": "Bash", "arguments": {"command": "ls"}}
\`\`\``;

    const calls = parseTextToolCalls(text);
    // Should deduplicate — only one Bash("ls") call
    expect(calls.filter((c) => c.name === "Bash").length).toBeLessThanOrEqual(
      1,
    );
  });

  it("returns empty array for text without tool calls", () => {
    const text =
      "I think we should refactor the auth module to use JWT tokens.";
    const calls = parseTextToolCalls(text);
    expect(calls.length).toBe(0);
  });
});
