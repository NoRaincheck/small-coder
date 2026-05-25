import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getString } from "../_shared/config.ts";

// Blocks tools not in allowedTools. Publishes the allowed list
// on systemPromptOptions for skill-inject filtering.
// Config: ~/.pi/agent/small-coder.json → { allowedTools }

function getAllowedTools(): Set<string> | null {
  const raw = getString("allowedTools");
  if (!raw) return null; // no gating when unset
  return new Set(raw.split(",").map((t) => t.trim()).filter(Boolean));
}

export default function (pi: ExtensionAPI) {
  const allowed = getAllowedTools();
  if (!allowed) return; // nothing to gate

  pi.on("before_agent_start", async (event, ctx) => {
    // Publish the allowed list so skill-inject can filter tool cards
    const opts = event.systemPromptOptions as unknown as
      | Record<string, unknown>
      | undefined;
    if (opts) {
      opts._allowedTools = Array.from(allowed);
    }
  });

  pi.on("tool_call", async (event, ctx) => {
    if (!allowed.has(event.toolName)) {
      const available = Array.from(allowed).join(", ");
      return {
        block: true,
        reason:
          `Tool '${event.toolName}' is not in the allowed list. Allowed tools: ${available}`,
      };
    }
  });

  // Also filter active tools at session start for cleaner system prompt
  pi.on("session_start", async () => {
    try {
      const allTools = pi.getAllTools?.() || [];
      const enabled = allTools.filter((t: any) => allowed.has(t.name));
      pi.setActiveTools?.(enabled.map((t: any) => t.name));
    } catch {
      // setActiveTools may not exist in older pi versions — no-op
    }
  });
}
