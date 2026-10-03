import {
  type ExtensionAPI,
  type ExtensionContext,
  isReadToolResult,
} from "@earendil-works/pi-coding-agent";
import { DEFAULT_MAX_CHARS, planReadTrim } from "./trim.ts";

// Trims an oversized read result to head+tail so one large file can't evict
// the whole conversation from a small context window.
//
// pi's runner only applies a `tool_result` modification when the handler
// *returns* one (core/extensions/runner.js: a handler returning nothing leaves
// `modified` false and the result is discarded), so this must return
// `{ content }` — assigning to `event.content` is a silent no-op.

/** Cap as a fraction of the model's context window. */
const WINDOW_FRACTION = 0.15;

/** Resolve the char budget for the active model. */
export function budgetFor(ctx: ExtensionContext): number {
  const window = ctx.getContextUsage?.()?.contextWindow ?? 0;
  if (window > 0) {
    return Math.max(
      2000,
      Math.min(DEFAULT_MAX_CHARS, Math.floor(window * WINDOW_FRACTION)),
    );
  }
  return DEFAULT_MAX_CHARS;
}

export default function (pi: ExtensionAPI) {
  pi.on("tool_result", async (event, ctx) => {
    if (!isReadToolResult(event)) return;

    const input = event.input;
    const explicitRange = input?.offset !== undefined ||
      input?.limit !== undefined;
    const alreadyTruncated = Boolean(event.details?.truncation?.truncated);

    const text = event.content
      .filter((c): c is { type: "text"; text: string } => c.type === "text")
      .map((c) => c.text)
      .join("\n");
    if (!text) return;

    const trimmed = planReadTrim(text, {
      maxChars: budgetFor(ctx),
      explicitRange,
      alreadyTruncated,
      path: typeof input?.path === "string" ? input.path : undefined,
    });
    if (trimmed === undefined) return;

    return { content: [{ type: "text" as const, text: trimmed }] };
  });
}
