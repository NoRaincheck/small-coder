import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

// Intercepts Write tool calls to:
// 1. Normalize root-bare paths (/foo.md → <cwd>/foo.md)
// 2. Refuse writes to existing files (forces Edit instead)
// 3. Notify the model with an Edit suggestion on refusal

function normalizePath(inputPath: string, cwd: string): string {
  // Strip leading / to make it relative to cwd
  const cleaned = inputPath.replace(/^\/+/, "");
  if (!cleaned) return inputPath;
  return resolve(cwd, cleaned);
}

export default function (pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => {
    if (!isToolCallEventType("write", event)) return;

    const inputPath = event.input.path as string;
    if (typeof inputPath !== "string") return;

    // Normalize: strip leading / so "/foo.md" → cwd/foo.md
    const normalized = normalizePath(inputPath, ctx.cwd);
    if (normalized !== inputPath) {
      event.input.path = normalized;
    }

    // Refuse write to existing file — suggest Edit instead
    if (existsSync(normalized)) {
      return {
        block: true,
        reason:
          `Write refuses on existing file "${inputPath}". Use Edit with exact old_string / new_string to modify it. Read the file first for line numbers and precision.`,
      };
    }
  });
}
