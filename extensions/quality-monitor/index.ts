import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  assessResponse,
  buildCorrectionMessage,
  phraseForUser,
  type ToolCall,
  type ToolRegistry,
} from "./quality.ts";

// Inspects the assistant message after each turn and, on a detected failure
// mode, sends a correction user message with deliverAs:"steer" so the model
// gets it immediately on its next turn rather than waiting for user input.
//
// The tool registry is read from pi itself (pi.getAllTools) rather than
// hardcoded, so a hallucinated-name correction can only ever advertise tools
// that are actually registered — and it is populated from session start, so a
// turn-1 hallucination is caught too.
//
// pi-ai's content-part types are not re-exported by pi-coding-agent, so the
// message union is narrowed structurally instead.

interface TextPart {
  type: "text";
  text: string;
}

interface ToolCallPart {
  type: "toolCall";
  name: string;
  arguments?: Record<string, unknown>;
}

function isTextPart(part: unknown): part is TextPart {
  return typeof part === "object" && part !== null &&
    (part as { type?: unknown }).type === "text";
}

function isToolCallPart(part: unknown): part is ToolCallPart {
  return typeof part === "object" && part !== null &&
    (part as { type?: unknown }).type === "toolCall";
}

let previousToolCalls: ToolCall[] = [];
let consecutiveFailures = 0;
const MAX_CONSECUTIVE_CORRECTIONS = 2;

export default function (pi: ExtensionAPI) {
  const registry: ToolRegistry = {
    has: (name) => registry.list().includes(name),
    list: () => pi.getAllTools().map((t) => t.name),
  };

  pi.on("session_start", async () => {
    previousToolCalls = [];
    consecutiveFailures = 0;
  });

  pi.on("turn_end", async (event, ctx) => {
    const message = event.message as unknown as Record<string, unknown>;
    if (!message) return;
    if (message.role !== "assistant") return;

    // Skip aborted turns — partial/empty content is legitimate for interrupts.
    if (message.stopReason === "aborted") return;

    const content = Array.isArray(message.content) ? message.content : [];

    const currentCalls: ToolCall[] = content
      .filter(isToolCallPart)
      .map((c) => ({ name: c.name, input: c.arguments ?? {} }));

    const text = content
      .filter(isTextPart)
      .map((c) => c.text ?? "")
      .join("\n");

    const verdict = assessResponse(
      text,
      currentCalls,
      previousToolCalls,
      registry,
    );

    // Update rolling state for next turn regardless of verdict
    previousToolCalls = currentCalls;

    if (verdict.ok) {
      consecutiveFailures = 0;
      return;
    }

    consecutiveFailures++;
    if (consecutiveFailures > MAX_CONSECUTIVE_CORRECTIONS) {
      ctx.ui.notify(
        `harness intervention: ${
          phraseForUser(verdict.reason)
        } — backing off after ${consecutiveFailures} in a row.`,
        "info",
      );
      return;
    }

    ctx.ui.notify(
      `harness intervention: ${
        phraseForUser(verdict.reason)
      } — redirecting the model.`,
      "info",
    );
    pi.sendUserMessage(buildCorrectionMessage(verdict.reason, registry), {
      deliverAs: "steer",
    });
  });
}
