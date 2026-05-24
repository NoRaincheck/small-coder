import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Caps thinking tokens per turn. On breach: forces thinking off and queues a
// "commit to implementation" nudge so the model stops deliberating and starts coding.

const DEFAULT_BUDGET = 4096; // tokens — reasonable for small models

function loadBudget(): number {
  const home = process.env.HOME || "";
  // Check project-local .pi/settings.json first, then global ~/.pi/agent/settings.json
  const paths = [
    join(process.cwd(), ".pi", "settings.json"),
    join(home, ".pi", "agent", "settings.json"),
  ];

  for (const p of paths) {
    if (!existsSync(p)) continue;
    try {
      const data = JSON.parse(readFileSync(p, "utf-8"));
      // Per-model profile: top-level thinking_budget or in profiles object
      if (typeof data?.thinking_budget === "number") {
        return data.thinking_budget;
      }
      if (data?.profiles && typeof data.profiles === "object") {
        for (const [_key, profile] of Object.entries(data.profiles)) {
          const tb = (profile as Record<string, unknown>)?.thinking_budget as
            | number
            | undefined;
          if (typeof tb === "number" && tb > 0) return tb;
        }
      }
    } catch {
      // skip unreadable config
    }
  }

  return DEFAULT_BUDGET;
}

export default function (pi: ExtensionAPI) {
  const budget = loadBudget();

  pi.on("session_start", async () => {
    // Reset state on new session — thinking tokens tracked per turn via message_end
  });

  pi.on("message_end", async (event) => {
    if (event.message.role !== "assistant") return;

    const usage = event.message.usage;
    if (!usage) return;

    // Extract thinking/reasoning tokens — varies by provider but commonly under cost.totalThoughts or reasoning_tokens
    let thinkingTokens = 0;
    const u = usage as unknown as Record<string, unknown>;
    if (typeof u.cost === "object" && u.cost !== null) {
      thinkingTokens = (u.cost as Record<string, number>)?.totalThoughts ?? 0;
    }

    // Fallback: check for reasoning_tokens or similar at top level
    if (thinkingTokens === 0) {
      thinkingTokens = (u.reasoningTokens as number) ??
        (u.totalThoughts as number) ?? 0;
    }

    if (thinkingTokens <= budget) return;

    // Breach detected — force thinking off and nudge to implement
    try {
      pi.setThinkingLevel?.("off");
    } catch {
      // setThinkingLevel may not be available in all pi versions — no-op
    }

    // Queue nudge for next turn: "commit to implementation"
    pi.sendUserMessage(
      `You have thought long enough (${thinkingTokens} tokens > ${budget} budget). ` +
        `Stop deliberating and commit to an implementation. Start coding now.`,
      { deliverAs: "steer" },
    );
  });
}
