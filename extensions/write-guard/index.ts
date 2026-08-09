import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";
import { existsSync } from "node:fs";
import { isAbsolute, join } from "node:path";

// Intercepts Write tool calls to:
// 1. Normalize root-bare paths (/foo.md → <cwd>/foo.md)
// 2. Rewrite dropped-slash macOS home paths (Users/foo.md → /Users/foo.md)
// 3. Refuse writes to existing files (forces Edit instead)
// 4. Notify the model with an Edit suggestion on refusal

/**
 * Resolve a write `path` argument to a concrete on-disk path.
 *
 * Three deterministic rewrites:
 *
 * 1. `"/<single-segment>"` (e.g. `/foo.md`) → `<cwd>/<single-segment>`.
 *    A root + bare filename is almost always a model mistake (anchoring at
 *    filesystem root); genuine system paths include an intermediate directory.
 *
 * 2. `"Users/<rest>"` (macOS, leading slash dropped) → `/Users/<rest>`.
 *    A non-absolute path whose first segment is exactly `Users` is almost
 *    always an absolute path the model anchored at `/Users/` without the slash
 *    (e.g. `Users/crn/…`); left alone it would create a `Users/` folder in cwd.
 *
 * 3. Bare filename / relative path (no leading slash) → resolved against cwd.
 *
 * Anything else (absolute path with at least one intermediate directory) is
 * left untouched.
 */
export function normalizeWritePath(
  filePath: string,
  cwd: string = process.cwd(),
): { path: string; rewrittenFrom?: string } {
  if (/^\/[^/]+$/.test(filePath)) {
    return { path: join(cwd, filePath.slice(1)), rewrittenFrom: filePath };
  }
  if (/^Users(?:\/|$)/.test(filePath)) {
    return { path: `/${filePath}`, rewrittenFrom: filePath };
  }
  if (!isAbsolute(filePath)) {
    return { path: join(cwd, filePath) };
  }
  return { path: filePath };
}

export default function (pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => {
    if (!isToolCallEventType("write", event)) return;

    const inputPath = event.input.path as string;
    if (typeof inputPath !== "string") return;

    // Normalize: "/foo.md" → cwd/foo.md, relative paths → cwd-resolved
    const { path: resolved } = normalizeWritePath(inputPath, ctx.cwd);
    if (resolved !== inputPath) {
      event.input.path = resolved;
    }

    // Refuse write to existing file — suggest Edit instead
    if (existsSync(resolved)) {
      return {
        block: true,
        reason:
          `Write refuses on existing file "${inputPath}". Use edit with exact old_string / new_string to modify it. Read the file first for line numbers and precision.`,
      };
    }
  });
}
