import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Backs up files before write/edit to ~/.small-coder/checkpoints/<session>/

const CHECKPOINT_DIR = join(
  process.env.HOME || "",
  ".small-coder",
  "checkpoints",
);

function getCheckpointSessionDir(): string | null {
  // Try to extract session ID from the environment or generate one
  const sessionId = process.env.PI_SESSION_ID;
  if (!sessionId) return null;
  return join(CHECKPOINT_DIR, `session_${sessionId}`);
}

/**
 * Create a checkpoint backup of a file before it's modified.
 */
function createCheckpoint(filePath: string): void {
  const cleanPath = typeof filePath === "string"
    ? filePath.replace(/^\/+/, "")
    : "";
  if (!cleanPath) return;

  if (!existsSync(cleanPath)) return;

  try {
    const dir = getCheckpointSessionDir();
    if (!dir) return; // can't determine session — skip

    mkdirSync(dir, { recursive: true });

    const safeName = cleanPath.replace(/[^a-zA-Z0-9._-]/g, "_");
    const checkpointPath = join(dir, `${safeName}.bak`);

    mkdirSync(join(checkpointPath, ".."), { recursive: true });
    writeFileSync(checkpointPath, readFileSync(cleanPath));
  } catch {
    // Best-effort — don't fail the operation if checkpointing fails
  }
}

export default function (pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => {
    const evt = event as any;
    if (event.toolName === "write" && typeof evt.input?.path === "string") {
      createCheckpoint(evt.input.path);
    } else if (
      event.toolName === "edit" && typeof evt.input?.path === "string"
    ) {
      createCheckpoint(evt.input.path);
    } else if (Array.isArray(evt.input?.paths)) {
      // Batch edit — checkpoint first path only (best-effort)
      for (const p of evt.input.paths) {
        if (typeof p === "string") {
          createCheckpoint(p);
        }
      }
    }
  });

  pi.on("session_start", async () => {
    // Ensure checkpoint directory exists for this session
    const dir = getCheckpointSessionDir();
    if (dir) {
      try {
        mkdirSync(dir, { recursive: true });
      } catch {
        // best-effort
      }
    }
  });
}
