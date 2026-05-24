import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// Max turns per agent run; aborts via ctx.abort() when exceeded.
// Default: 50 turns (configurable via LITTLE_CODER_MAX_TURNS env var).

const DEFAULT_CAP = 50;

function getTurnCap(): number {
  const raw = process.env.LITTLE_CODER_MAX_TURNS;
  if (!raw) return DEFAULT_CAP;
  const n = parseInt(raw, 10);
  return isNaN(n) || n <= 0 ? DEFAULT_CAP : n;
}

export default function (pi: ExtensionAPI) {
  const cap = getTurnCap();

  pi.on("session_start", async () => {
    // Turn counter resets per session — no state to maintain, just the cap value
  });

  pi.on("turn_end", async (event, ctx) => {
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
