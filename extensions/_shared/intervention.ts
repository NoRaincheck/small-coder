// Shared presentation for "harness intervention" events — the moments where
// small-coder's scaffolding overrides or redirects the model rather than the
// model deciding for itself (thinking-budget cap, write-guard redirect,
// turn-cap, quality-monitor corrections, output-parser nudges).
//
// This helper gives every such message a single, uniformly-formatted voice:
//
//     harness intervention: the model has thought long enough — forcing it to
//     start implementing.

export interface InterventionUI {
  notify(message: string, type?: "info" | "warning" | "error"): void;
}

export interface InterventionCtx {
  ui: InterventionUI;
}

/**
 * Surface a single, uniformly-formatted harness-intervention line to the user.
 */
export function harnessIntervention(
  ctx: InterventionCtx,
  message: string,
): void {
  ctx.ui.notify(`harness intervention: ${message}`, "info");
}
