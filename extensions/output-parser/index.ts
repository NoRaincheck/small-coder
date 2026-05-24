import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { type ExtractedCall, parseTextToolCalls } from "./parser.ts";

// Detects malformed/fenced tool calls in assistant text and nudges the model
// back onto native tool-calling. When extracted calls ARE detected, we log
// them via ctx.ui.notify and queue a follow-up nudge for the next turn.

function extractAssistantText(message: any): string {
  if (!message) return "";
  const content = message.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.filter((c) => c?.type === "text").map((c) => c.text).join(
      "\n",
    );
  }
  return "";
}

function hasNativeToolCalls(message: any): boolean {
  const content = message?.content;
  if (!Array.isArray(content)) return false;
  return content.some((c: any) => c?.type === "toolCall");
}

export default function (pi: ExtensionAPI) {
  pi.on("turn_end", async (event, ctx) => {
    const message = (event as any).message;
    if (!message) return;
    // If pi already detected native tool calls, nothing to rescue.
    if (hasNativeToolCalls(message)) return;
    const text = extractAssistantText(message);
    if (!text) return;

    const calls: ExtractedCall[] = parseTextToolCalls(text);
    if (calls.length === 0) return;

    const names = calls.map((c) => c.name).join(", ");
    ctx.ui.notify(
      `harness intervention: the model wrote ${calls.length} tool call(s) as text [${names}] — nudging it back to native tool calls.`,
      "info",
    );

    // Queue a follow-up that will be delivered after the agent finishes.
    pi.sendUserMessage(
      "Your previous response embedded tool calls inside text (e.g. fenced ```tool blocks or <tool_call> tags). " +
        "Please re-issue them as NATIVE tool calls. If the intended calls were: " +
        calls.map((c) => `${c.name}(${JSON.stringify(c.input)})`).join("; ") +
        " — please execute them now using your tool-call channel, not text.",
      { deliverAs: "followUp" },
    );
  });
}
