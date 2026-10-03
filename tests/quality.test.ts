import { describe, expect, it } from "vitest";
import {
  assessResponse,
  buildCorrectionMessage,
  phraseForUser,
  type ToolCall,
  type ToolRegistry,
} from "../extensions/quality-monitor/quality.ts";

// pi's built-in tool names are lowercase; the registry is now supplied by the
// extension from pi.getAllTools(), so these tests use the real names.
function registry(...names: (string | string[])[]): ToolRegistry {
  const list = names.flat().filter(Boolean);
  return { has: (n) => list.includes(n), list: () => list };
}

describe("assessResponse", () => {
  it("returns ok for valid response with text and tool calls", () => {
    const result = assessResponse(
      "Let me check the file.",
      [{ name: "read", input: { path: "file.txt" } }],
      [],
      registry(["read", "write"]),
    );
    expect(result).toEqual({ ok: true });
  });

  it("detects empty response", () => {
    const result = assessResponse("", [], [], registry());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("empty_response");
  });

  it("detects unknown tool names when registry populated", () => {
    const calls: ToolCall[] = [{ name: "NonExistentTool", input: {} }];
    const result = assessResponse("", calls, [], registry(["read", "write"]));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/^unknown_tool:/);
  });

  it("detects unknown tool on the very first call, not just later turns", () => {
    // Regression: the registry used to be seeded from tool_execution_start, so
    // a turn-1 hallucination slipped through.
    const calls: ToolCall[] = [{ name: "Grep2", input: {} }];
    const result = assessResponse("", calls, [], registry(["read", "bash"]));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("unknown_tool:Grep2");
  });

  it("detects repeated tool call loops", () => {
    const prev: ToolCall[] = [{ name: "bash", input: { command: "ls" } }];
    const curr: ToolCall[] = [{ name: "bash", input: { command: "ls" } }];
    const result = assessResponse("", curr, prev, registry(["bash"]));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("repeated_tool_call");
  });

  it("allows same tool name with different input", () => {
    const prev: ToolCall[] = [{ name: "bash", input: { command: "ls" } }];
    const curr: ToolCall[] = [{ name: "bash", input: { command: "pwd" } }];
    const result = assessResponse("", curr, prev, registry(["bash"]));
    expect(result).toEqual({ ok: true });
  });

  it("detects malformed arguments", () => {
    const calls: ToolCall[] = [{
      name: "bash",
      input: { _raw: "broken json" },
    }];
    const result = assessResponse("", calls, [], registry());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/^malformed_args:/);
  });

  it("skips the name check entirely when the registry is empty", () => {
    const calls: ToolCall[] = [{ name: "whatever", input: {} }];
    const result = assessResponse("", calls, [], registry());
    expect(result).toEqual({ ok: true });
  });
});

describe("buildCorrectionMessage", () => {
  it("generates message for empty response", () => {
    const msg = buildCorrectionMessage("empty_response");
    expect(msg).toContain("empty");
    expect(msg).toContain("tool call");
  });

  it("generates message for unknown tool", () => {
    const msg = buildCorrectionMessage("unknown_tool:FooBar");
    expect(msg).toContain("FooBar");
    expect(msg).toContain("does not exist");
  });

  it("lists the real registered tools, never a hardcoded set", () => {
    const msg = buildCorrectionMessage(
      "unknown_tool:FooBar",
      registry(["read", "write", "bash", "grep"]),
    );
    expect(msg).toContain("read, write, bash, grep");
    // The old hardcoded list advertised capitalized names pi does not register.
    expect(msg).not.toContain("WebFetch");
    expect(msg).not.toContain("Read,");
  });

  it("omits the available-tools clause when the registry is unknown", () => {
    const msg = buildCorrectionMessage("unknown_tool:FooBar");
    expect(msg).not.toContain("Available tools are:");
  });

  it("lists real tools in the empty-name correction", () => {
    const msg = buildCorrectionMessage(
      "empty_tool_name",
      registry(["read", "bash"]),
    );
    expect(msg).toContain("read, bash");
  });

  it("handles malformed args", () => {
    const msg = buildCorrectionMessage("malformed_args:bash");
    expect(msg).toContain("bash");
    expect(msg).toContain("malformed");
  });

  it("has fallback for unknown reasons", () => {
    const msg = buildCorrectionMessage("some_unknown_issue");
    expect(msg).toContain("Issue detected: some_unknown_issue");
  });
});

describe("phraseForUser", () => {
  it("produces readable phrases", () => {
    expect(phraseForUser("empty_response")).toBe(
      "the model returned an empty response",
    );
    expect(phraseForUser("repeated_tool_call")).toBe(
      "the model repeated its previous tool call verbatim",
    );
    expect(phraseForUser("unknown_tool:BadTool")).toContain("BadTool");
  });

  it("has fallback for unknown reasons", () => {
    expect(phraseForUser("weird_issue")).toContain("quality issue");
  });
});
