import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getSessionStore } from "../evidence/index.ts";

// Evidence-preservation contract for compaction.
//
// Evidence entries live in extension-state (evidence/index.ts `stores` map),
// so they survive message-array compaction automatically.
//
// This extension preserves the BEHAVIORAL contract: after compaction, the
// model sees an assistant-side bridge reminding it that its evidence is
// still addressable via EvidenceList/EvidenceGet. The exact bridge string
// matches the upstream little-coder version so replay stays deterministic.

const BRIDGE_TEMPLATE = (n: number): string =>
  `[Preserved evidence from earlier in the conversation follows.] ` +
  `${n} evidence entr${n === 1 ? "y remains" : "ies remain"} available via ` +
  `EvidenceList and EvidenceGet.`;

export default function (pi: ExtensionAPI) {
  pi.on("session_compact", async (_event, ctx) => {
    const store = getSessionStore();
    if (store.length === 0) return;
    ctx.ui.notify(
      `evidence-compact: ${store.length} evidence entries preserved across compaction`,
      "info",
    );
    pi.sendUserMessage(BRIDGE_TEMPLATE(store.length), {
      deliverAs: "followUp",
    });
  });
}
