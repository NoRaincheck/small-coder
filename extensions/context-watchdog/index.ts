import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// Mid-run context watchdog.
//
// pi only evaluates auto-compaction at a *user-turn boundary* — its
// `_checkCompaction` runs inside `_handlePostAgentRun`, which fires only after
// `agent.prompt()` has fully returned (i.e. once the model stops requesting
// tools and goes idle). During one long autonomous run this boundary is never
// reached: small models routinely chain dozens of tool-call turns before
// yielding, so context grows unchecked and can blow straight past the window —
// pi then only reacts to the *overflow error* after the fact.
//
// pi does expose the levers to fix this from an extension: `ctx.getContextUsage()`
// reports live token usage against the active model's window, and `ctx.compact()`
// triggers pi's own compaction without awaiting it. This extension watches usage
// at every turn boundary and, once it crosses a threshold, proactively kicks off
// compaction — so a long single run compacts *before* it overflows, at roughly
// the same point pi would have if the model had yielded.
//
// Tuning / opt-out:
//   SMALL_CODER_COMPACT_AT_PERCENT   trigger threshold, percent of the context
//                                    window (default 80). <=0 or >=100 disables.
//   SMALL_CODER_NO_COMPACT_WATCHDOG=1  hard off.
//   The legacy LITTLE_CODER_* names are honored as fallbacks.
//
// This is complementary to pi's end-of-run compaction, not a replacement — the
// `compacting` guard below keeps us from re-firing while a compaction is already
// in flight, and pi's own threshold/overflow paths still run at run boundaries.
//
// ── Compaction-loop guard ────────────────────────────────────────────────
// A failed or futile second compaction (only the tiny post-compaction tail
// remains to summarize) can wedge a session with "Nothing to compact". The
// wrapper-side guard breaks that loop: after each compaction we measure the
// first known post-compaction usage, and if it's still at/above the threshold
// we PAUSE automatic compaction and tell the user, instead of firing a doomed
// second compact(). It re-arms automatically once usage drops back below the
// threshold (a manual /clear, /compact, or a genuinely smaller turn). A failed
// compaction (onError) pauses the same way rather than silently retrying.

export interface ContextUsageLike {
  tokens: number | null;
  contextWindow: number;
  percent: number | null;
}

const DEFAULT_PERCENT = 80;

// How many percentage points of headroom a compaction must open up to count as
// "made progress". If a compaction leaves usage within this margin of the
// threshold (or still above it), firing again would only try to summarize the
// tiny post-compaction tail. Also the hysteresis band for re-arming after a
// pause.
export const MIN_PROGRESS_PCT = 5;

// Did the just-finished compaction open up enough headroom to keep going, or is
// automatic compaction now futile (→ pause)? `postPercent` is the first known
// usage reading after the compaction. It "helped" only if usage now sits at
// least MIN_PROGRESS_PCT below the threshold. Pure so the decision is
// unit-testable.
export function compactionHelped(postPercent: number, pct: number): boolean {
  return postPercent <= pct - MIN_PROGRESS_PCT;
}

// Resolve the trigger threshold (percent of context window). Checks the
// SMALL_CODER_* env names with the legacy LITTLE_CODER_* as fallback.
// Non-numeric or missing → default. Returns 0 to mean "disabled" for
// out-of-band values (<=0 disables outright; >=100 leaves it to pi's own
// overflow recovery).
export function thresholdPercent(env: NodeJS.ProcessEnv = process.env): number {
  if (
    env.SMALL_CODER_NO_COMPACT_WATCHDOG === "1" ||
    env.LITTLE_CODER_NO_COMPACT_WATCHDOG === "1"
  ) return 0;
  const raw = env.SMALL_CODER_COMPACT_AT_PERCENT ??
    env.LITTLE_CODER_COMPACT_AT_PERCENT;
  if (raw === undefined || raw.trim() === "") return DEFAULT_PERCENT;
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_PERCENT;
  if (n <= 0 || n >= 100) return 0;
  return n;
}

// Pure decision: should we kick off compaction on this turn? True only when the
// watchdog is enabled, no compaction is already in flight, and we have a real
// usage reading at or above the threshold. `tokens == null` (e.g. right after a
// compaction, before the next LLM response) is treated as "unknown" → no-op.
export function shouldCompactNow(
  usage: ContextUsageLike | undefined,
  pct: number,
  compacting: boolean,
): boolean {
  if (pct <= 0) return false;
  if (compacting) return false;
  if (!usage) return false;
  if (usage.contextWindow <= 0) return false;
  if (usage.tokens === null || usage.percent === null) return false;
  return usage.percent >= pct;
}

// The instruction sent to the model to pick the task back up after a mid-run
// compaction. pi's threshold compaction is deliberately "compact, then let the
// user continue manually" — so an autonomous run left mid-task would otherwise
// just sit at the prompt. This user message resumes it automatically; the
// compaction summary immediately above it preserves what was already done.
export const RESUME_MESSAGE =
  "Your context was automatically compacted mid-task to stay within the model's window. " +
  "Continue the task from where you left off — the summary above preserves the work done so far. " +
  "Do not restart from scratch or re-ask the user; just carry on. " +
  "Rely on the summary and the files already in context — do NOT re-read files " +
  "you have already read or re-explore the project from scratch.";

export default function (pi: ExtensionAPI) {
  const pct = thresholdPercent();
  if (pct <= 0) return; // disabled — register nothing

  // In flight from the turn_start that fires compaction until compaction
  // resolves (onComplete/onError), so a burst of turn_start events can't stack
  // multiple compaction calls on top of each other.
  let compacting = false;
  // Set true after a compaction completes; the next turn_start with a known
  // usage reading measures whether it actually opened headroom.
  let measurePending = false;
  // Usage percent captured at the moment we fire compaction, for the "freed N%"
  // notice once we can measure the result.
  let preCompactPercent: number | null = null;
  // Latched once a compaction fails to free enough (or errors): the watchdog
  // stops firing until usage falls back below the threshold's hysteresis band,
  // so it can never spin the futile-compaction loop that wedges a session.
  let paused = false;

  pi.on("before_agent_start", async () => {
    // Each fresh user turn (including the auto-resume below) is a clean boundary;
    // drop any stale flag so a cancelled/failed compaction can't wedge the
    // watchdog off permanently. `paused` is intentionally NOT reset here — it
    // clears on usage recovery in turn_start, not on every turn boundary.
    compacting = false;
  });

  pi.on("turn_start", async (_event, ctx) => {
    const usage = ctx.getContextUsage?.();

    // (1) Measure the last compaction's effect the first time usage is known
    // again (it reads null right after compaction, until a post-compaction
    // response re-establishes a token count). If it freed too little, pause —
    // firing again would only chase the tiny tail into a futile compaction.
    if (measurePending && usage && usage.percent !== null) {
      measurePending = false;
      if (!compactionHelped(usage.percent, pct)) {
        paused = true;
        const freed = preCompactPercent !== null
          ? ` (freed only ~${
            Math.max(0, Math.round(preCompactPercent - usage.percent))
          }%)`
          : "";
        ctx.ui.notify(
          `context still at ${
            Math.round(usage.percent)
          }% after compaction${freed} — ` +
            `automatic compaction paused to avoid a loop. ` +
            `Free space with /clear or a shorter task, or use a larger-context model; ` +
            `it re-arms once usage drops below ${
              Math.round(pct - MIN_PROGRESS_PCT)
            }%.`,
          "warning",
        );
      }
    }

    // (2) Re-arm once context has genuinely recovered (manual /clear, /compact,
    // or a smaller turn brought usage back under the hysteresis band).
    if (
      paused &&
      usage &&
      usage.percent !== null &&
      usage.percent < pct - MIN_PROGRESS_PCT
    ) {
      paused = false;
    }
    if (paused) return;

    if (!shouldCompactNow(usage, pct, compacting)) return;
    compacting = true;
    preCompactPercent = usage!.percent;
    const windowK = Math.round((usage!.contextWindow / 1000) * 10) / 10;
    ctx.ui.notify(
      `context at ${
        Math.round(usage!.percent!)
      }% of ${windowK}k — compacting mid-run to stay under the window`,
      "info",
    );
    // pi's public compact() is the *manual* path: it aborts the in-flight run,
    // summarizes, then reconnects the agent and leaves it idle (no auto-retry).
    // On its own that strands an autonomous task at the prompt — so we resume it
    // from onComplete once the agent is back and idle. sendUserMessage always
    // triggers a turn, driving the run forward on the freshly-compacted context.
    ctx.compact({
      onComplete: () => {
        measurePending = true;
        pi.sendUserMessage(RESUME_MESSAGE);
        compacting = false;
      },
      // Failed / cancelled compaction: pause rather than silently retrying.
      onError: (err?: { message?: string }) => {
        compacting = false;
        paused = true;
        const why = err?.message ? ` (${err.message})` : "";
        ctx.ui.notify(
          `automatic compaction could not proceed${why} — paused to avoid a loop. ` +
            `Free space with /clear or use a larger-context model.`,
          "warning",
        );
      },
    });
  });
}
