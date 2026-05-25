import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getNumber } from "../_shared/config.ts";

// Max turns per agent run; aborts via ctx.abort() when exceeded.
// Config: ~/.pi/agent/small-coder.json → { maxTurns }
// negative or zero means unlimited.

const DEFAULT_CAP = 50;

function getTurnCap(): number | null {
  const raw = getNumber("maxTurns");
  if (typeof raw === "number" && raw > 0) return raw;
  // negative / zero → unlimited
  return null;
}

export default function (pi: ExtensionAPI) {
  const cap = getTurnCap();

  pi.on("session_start", async () => {
    // Turn counter resets per session — no state to maintain, just the cap value
  });

  pi.on("turn_end", async (event, ctx) => {
    if (cap === null) return; // unlimited
    const turnIndex = (event as any).turnIndex;
    if (typeof turnIndex === "number" && turnIndex >= cap) {
      ctx.ui.notify(
        `harness intervention: turn limit reached (${cap} turns). Agent aborted.`,
        "warning",
      );
      ctx.abort();
    }
  });
}
