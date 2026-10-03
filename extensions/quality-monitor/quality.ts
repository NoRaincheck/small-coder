export interface ToolCall {
  name: string;
  input: unknown;
}

export type QualityResult =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * The tool names the harness will actually accept. Injected rather than
 * hardcoded so the correction message can never advertise a tool that isn't
 * registered (pi's built-ins are lowercase: read/write/edit/bash/grep/find/ls).
 */
export interface ToolRegistry {
  has(name: string): boolean;
  list(): string[];
}

export function assessResponse(
  text: string,
  toolCalls: ToolCall[],
  recentToolCalls: ToolCall[],
  registry: ToolRegistry,
): QualityResult {
  // 1. Empty response with no tool calls
  if (!text.trim() && toolCalls.length === 0) {
    return { ok: false, reason: "empty_response" };
  }

  // 2. Hallucinated tool names. Always checked — the registry is populated
  //    from session start, so turn 1 is covered too.
  const known = registry.list();
  for (const tc of toolCalls) {
    if (!tc.name) return { ok: false, reason: "empty_tool_name" };
    if (known.length > 0 && !registry.has(tc.name)) {
      return { ok: false, reason: `unknown_tool:${tc.name}` };
    }
  }

  // 3. Repeated tool call loop (exact name+input match with previous turn)
  if (toolCalls.length > 0 && recentToolCalls.length > 0) {
    for (const tc of toolCalls) {
      for (const prev of recentToolCalls) {
        if (
          tc.name === prev.name &&
          JSON.stringify(tc.input) === JSON.stringify(prev.input)
        ) {
          return { ok: false, reason: "repeated_tool_call" };
        }
      }
    }
  }

  // 4. Malformed arguments sentinel from repairJson fallback
  for (const tc of toolCalls) {
    if (tc.input && typeof tc.input === "object" && "_raw" in tc.input) {
      return { ok: false, reason: `malformed_args:${tc.name || "?"}` };
    }
  }

  return { ok: true };
}

export function buildCorrectionMessage(
  reason: string,
  registry?: ToolRegistry,
): string {
  const available = registry?.list() ?? [];

  if (reason.startsWith("unknown_tool:")) {
    const toolName = reason.slice("unknown_tool:".length);
    const known = available.length > 0
      ? `Available tools are: ${available.join(", ")}.`
      : "";
    return (
      `Tool '${toolName}' does not exist. ${known} ` +
      "Please use one of these."
    );
  }
  if (reason.startsWith("malformed_args:")) {
    const toolName = reason.slice("malformed_args:".length);
    return (
      `The arguments for tool '${toolName}' were malformed (not valid JSON). ` +
      "Please provide the arguments as a proper JSON object."
    );
  }

  const corrections: Record<string, string> = {
    empty_response:
      "Your previous response was empty. Please respond with either " +
      "text or a tool call to make progress on the task.",
    empty_tool_name: available.length > 0
      ? "Your tool call had an empty name. Please specify a valid tool name. " +
        `Available tools are: ${available.join(", ")}.`
      : "Your tool call had an empty name. Please specify a valid tool name.",
    repeated_tool_call:
      "You just made the exact same tool call as your previous turn. " +
      "This suggests you may be stuck in a loop. Please try a different " +
      "approach or explain what you're trying to accomplish.",
  };

  return corrections[reason] ?? `Issue detected: ${reason}. Please try again.`;
}

export function phraseForUser(reason: string): string {
  if (reason.startsWith("unknown_tool:")) {
    return `the model called a tool that doesn't exist (${
      reason.slice("unknown_tool:".length)
    })`;
  }
  if (reason.startsWith("malformed_args:")) {
    return `the model's tool arguments were malformed (${
      reason.slice("malformed_args:".length)
    })`;
  }
  const phrases: Record<string, string> = {
    empty_response: "the model returned an empty response",
    empty_tool_name: "the model emitted a tool call with no name",
    repeated_tool_call: "the model repeated its previous tool call verbatim",
  };
  return phrases[reason] ?? `quality issue (${reason})`;
}
