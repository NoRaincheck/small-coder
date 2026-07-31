import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// Blocks tool calls with malformed paths starting with "Users/" (without leading /).
// These should be absolute ("/Users/...") or relative paths.

function findMalformedPath(
  input: Record<string, unknown>,
): string | null {
  for (const value of Object.values(input)) {
    if (typeof value === "string" && /^Users\//.test(value)) {
      return value;
    }
  }
  return null;
}

export default function (pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => {
    const input = event.input as Record<string, unknown> | undefined;
    if (!input) return;

    const malformed = findMalformedPath(input);
    if (!malformed) return;

    return {
      block: true,
      reason: `Malformed path detected: "${malformed}"\n` +
        `Use absolute paths (e.g. "/${malformed}") or relative paths ` +
        `(from current directory: ${ctx.cwd}).`,
    };
  });
}
