import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

// Backs up files before write/edit to ~/.small-coder/checkpoints/<session>/
//
// The session id comes from pi's own session manager. PI_SESSION_ID is not set
// by pi, so keying off it alone meant checkpointing silently no-op'd in normal
// use; it is kept only as a fallback for out-of-band invocations.

const CHECKPOINT_ROOT = join(
  process.env.HOME || "",
  ".small-coder",
  "checkpoints",
);

export function sessionIdFor(ctx: ExtensionContext): string | null {
  return ctx.sessionManager?.getSessionId?.() ??
    process.env.PI_SESSION_ID ??
    null;
}

function checkpointDir(ctx: ExtensionContext): string | null {
  const sessionId = sessionIdFor(ctx);
  if (!sessionId) return null;
  return join(CHECKPOINT_ROOT, `session_${sessionId.replace(/[^\w.-]/g, "_")}`);
}

/** Create a backup of a file before it is modified. Best-effort. */
export function createCheckpoint(
  filePath: string,
  ctx: ExtensionContext,
): void {
  if (typeof filePath !== "string" || !filePath) return;
  if (!existsSync(filePath)) return;

  const dir = checkpointDir(ctx);
  if (!dir) return;

  try {
    mkdirSync(dir, { recursive: true });
    const safeName = filePath.replace(/^\/+/, "").replace(
      /[^a-zA-Z0-9._-]/g,
      "_",
    );
    const target = join(dir, safeName);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, readFileSync(filePath));
  } catch {
    // Best-effort — don't fail the operation if checkpointing fails
  }
}

export default function (pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => {
    const name = event.toolName;
    if (name !== "write" && name !== "edit") return;
    const input = (event as { input?: Record<string, unknown> }).input ?? {};
    if (typeof input.path === "string") {
      createCheckpoint(input.path, ctx);
      return;
    }
    // Batch edit — checkpoint every listed path.
    if (Array.isArray(input.paths)) {
      for (const p of input.paths) {
        if (typeof p === "string") createCheckpoint(p, ctx);
      }
    }
  });
}
