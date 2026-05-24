import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// Trims oversized read results to first 30 lines + directive to grep/find.
// Prevents a single large file from evicting the entire conversation context.

const MAX_LINES = 30;

export default function (pi: ExtensionAPI) {
  pi.on("tool_result", async (event, ctx) => {
    const evt = event as any;
    if (evt.toolName !== "read") return;

    const contentArr = Array.isArray(evt.content) ? evt.content : [];
    const textParts = contentArr.filter((c: any) => c?.type === "text").map((
      c: any,
    ) => c.text ?? "");
    const fullText = textParts.join("\n");

    if (!fullText) return;

    const lines = fullText.split("\n");
    if (lines.length <= MAX_LINES) return;

    // Trim to first 30 lines
    const trimmed = lines.slice(0, MAX_LINES).join("\n");
    const remaining = lines.length - MAX_LINES;

    evt.content = [
      {
        type: "text",
        text:
          `${trimmed}\n\n---\n[TRIMMED: ${remaining} more lines omitted. Use Grep or Find to locate specific content.]`,
      },
    ];
  });
}
