import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getNumber } from "../_shared/config.ts";

// Caps thinking tokens per assistant turn. On breach: forces thinking off and
// queues a "commit to implementation" nudge so the model stops deliberating
// and starts coding.
//
// Token source: pi's `Usage.reasoning` (pi-ai/dist/types.ts) — the reasoning
// breakdown, which providers report when they expose one. It is a subset of
// `output`, so when a provider leaves it undefined we cannot tell reasoning
// apart from ordinary output and correctly do nothing rather than guessing.
//
// Config: ~/.pi/agent/small-coder.json → { thinkingBudget }
// Override: SMALL_CODER_THINKING_BUDGET

const DEFAULT_BUDGET = 4096;

function loadBudget(): number {
  const env = process.env.SMALL_CODER_THINKING_BUDGET;
  if (env) {
    const n = Number(env);
    if (Number.isFinite(n) && n > 0) return n;
  }
  const configured = getNumber("thinkingBudget");
  return typeof configured === "number" && configured > 0
    ? configured
    : DEFAULT_BUDGET;
}

/**
 * Extract reasoning tokens from a pi usage record.
 * Returns undefined when the provider reported no reasoning breakdown.
 */
export function reasoningTokensOf(usage: unknown): number | undefined {
  if (!usage || typeof usage !== "object") return undefined;
  const reasoning = (usage as { reasoning?: unknown }).reasoning;
  return typeof reasoning === "number" && reasoning >= 0
    ? reasoning
    : undefined;
}

export default function (pi: ExtensionAPI) {
  const budget = loadBudget();
  let intervened = false;

  pi.on("session_start", async () => {
    intervened = false;
  });

  pi.on("message_end", async (event) => {
    if (intervened) return;
    if (event.message.role !== "assistant") return;

    const thinkingTokens = reasoningTokensOf(event.message.usage);
    // Provider gave us no reasoning breakdown — nothing to measure.
    if (thinkingTokens === undefined || thinkingTokens <= budget) return;

    intervened = true;
    pi.setThinkingLevel("off");
    pi.sendUserMessage(
      `You have thought long enough (${thinkingTokens} reasoning tokens > ${budget} budget). ` +
        `Stop deliberating and commit to an implementation. Start coding now.`,
      { deliverAs: "steer" },
    );
  });
}
