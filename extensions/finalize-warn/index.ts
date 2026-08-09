import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getNumber } from "../_shared/config.ts";
import { harnessIntervention } from "../_shared/intervention.ts";

// Pre-cap finalize-warn: when the agent has WARN_REMAINING turns left
// (this turn included), inject a follow-up user message reminding it to
// emit `Answer: <value>` before the cap aborts.
//
// Why this exists: a recurring small-model failure mode is "ran out of
// turns mid-thought, never produced final-answer line, extract_final_answer
// fell back to last line of prose and returned garbage." The warning fires
// once per agent run, only when the cap is large enough for the warning
// to give the model real headroom (cap > WARN_REMAINING).
//
// This is intentionally a separate extension from turn-cap so that the
// abort policy and the warn policy stay independent and can be tuned /
// disabled separately. The cap is read from the same small-coder.json
// `maxTurns` setting that turn-cap uses.
//
// pi.sendUserMessage(...,{deliverAs:"followUp"}) queues the message for the
// NEXT user turn — so a warning fired at turn 39 only reaches the model at
// turn 40, leaving 1 useful turn of headroom (then turn 41 = abort). Raised
// to 5 so the message lands ~4 turns before cap, giving the model real room.

const WARN_REMAINING = 5;

let turnsThisRun = 0;
let capForRun = 0;
let warnedThisRun = false;

export default function (pi: ExtensionAPI) {
  pi.on("before_agent_start", async () => {
    turnsThisRun = 0;
    warnedThisRun = false;
    const raw = getNumber("maxTurns");
    capForRun = typeof raw === "number" && raw > 0 ? raw : 0;
  });

  pi.on("turn_start", async (_event, ctx) => {
    if (capForRun <= 0) return;
    turnsThisRun++;
    if (warnedThisRun) return;
    if (capForRun <= WARN_REMAINING) return;

    // Fire once when the agent is starting the turn that leaves it
    // exactly WARN_REMAINING turns to play with. For cap=40, that's
    // turn 39 — the agent then has turn 39 and turn 40 before the
    // abort at turn 41.
    if (turnsThisRun !== capForRun - WARN_REMAINING + 1) return;

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
    try {
      pi.sendUserMessage(msg, { deliverAs: "followUp" });
    } catch {
      // SDK without sendUserMessage — silently no-op rather than break the run
    }
  });
}
