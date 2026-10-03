import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getNumber } from "../_shared/config.ts";
import { harnessIntervention } from "../_shared/intervention.ts";

// Pre-cap finalize-warn: when the agent is WARN_REMAINING turns from the cap,
// inject a follow-up user message reminding it to emit `Answer: <value>`.
//
// Why this exists: a recurring small-model failure mode is "ran out of turns
// mid-thought, never produced a final-answer line, and the extractor fell back
// to the last line of prose and returned garbage." The warning fires once per
// agent run, only when the cap leaves real headroom.
//
// This is intentionally separate from turn-cap so the abort policy and the
// warn policy stay independently tunable. Both read the same `maxTurns`.
//
// The turn count comes from `event.turnIndex` — the same counter turn-cap uses.
// Maintaining a second, independent counter here meant the two could drift.

const WARN_REMAINING = 5;

let warnedThisRun = false;

export default function (pi: ExtensionAPI) {
  pi.on("before_agent_start", async () => {
    warnedThisRun = false;
  });

  pi.on("turn_start", async (event, ctx) => {
    if (warnedThisRun) return;

    const raw = getNumber("maxTurns");
    const cap = typeof raw === "number" && raw > 0 ? raw : 0;
    if (cap <= WARN_REMAINING) return;

    // Fire on the turn that leaves exactly WARN_REMAINING turns to play with.
    // `turnIndex` is 0-based (agent-session.js resets it to 0 on agent_start
    // and increments on turn_end) and turn-cap aborts at turnIndex >= cap, so
    // the last executable index is `cap` and the count remaining at index i
    // is `cap - i + 1`. Solving for WARN_REMAINING gives i = cap - WARN + 1.
    if (event.turnIndex !== cap - WARN_REMAINING + 1) return;

    warnedThisRun = true;
    const msg =
      `You have ${WARN_REMAINING} turns left. Produce your final reply now, ` +
      `ending with a single line: \`Answer: <value>\`. ` +
      `Do not start new tool chains; if you need a fact you don't have, ` +
      `answer with your best supported guess from EvidenceList rather than ` +
      `leaving it blank.`;
    harnessIntervention(
      ctx,
      `${WARN_REMAINING} turns left — telling the model to finalize its answer now.`,
    );
    pi.sendUserMessage(msg, { deliverAs: "followUp" });
  });
}
