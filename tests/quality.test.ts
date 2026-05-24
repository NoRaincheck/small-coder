import { describe, expect, it } from "vitest";
import {
  assessResponse,
  buildCorrectionMessage,
  phraseForUser,
  type ToolCall,
} from "../extensions/quality-monitor/quality.ts";

describe("assessResponse", () => {
  it("returns ok for valid response with text and tool calls", () => {
    const result = assessResponse(
      "Let me check the file.",
      [{ name: "Read", input: { path: "file.txt" } }],
      [],
      new Set(["Read", "Write"]),
    );
    expect(result).toEqual({ ok: true });
  });

  it("detects empty response", () => {
    const result = assessResponse("", [], [], new Set());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("empty_response");
  });

  it("detects unknown tool names when registry populated", () => {
    const calls: ToolCall[] = [{ name: "NonExistentTool", input: {} }];
    const result = assessResponse("", calls, [], new Set(["Read", "Write"]));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/^unknown_tool:/);
  });

  it("detects repeated tool call loops", () => {
    const prev: ToolCall[] = [{ name: "Bash", input: { command: "ls" } }];
    const curr: ToolCall[] = [{ name: "Bash", input: { command: "ls" } }];
    const result = assessResponse("", curr, prev, new Set(["Bash"]));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("repeated_tool_call");
  });

  it("allows same tool name with different input", () => {
    const prev: ToolCall[] = [{ name: "Bash", input: { command: "ls" } }];
    const curr: ToolCall[] = [{ name: "Bash", input: { command: "pwd" } }];
    const result = assessResponse("", curr, prev, new Set(["Bash"]));
    expect(result).toEqual({ ok: true });
  });

  it("detects malformed arguments", () => {
    const calls: ToolCall[] = [{
      name: "Bash",
      input: { _raw: "broken json" },
    }];
    const result = assessResponse("", calls, [], new Set());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/^malformed_args:/);
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

  it("handles malformed args", () => {
    const msg = buildCorrectionMessage("malformed_args:Bash");
    expect(msg).toContain("Bash");
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
