import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getString } from "../_shared/config.ts";

// Blocks tools not in allowedTools, and narrows the advertised tool set so the
// model never sees a schema it isn't allowed to call.
// Config: ~/.pi/agent/small-coder.json → { allowedTools }
//
// The allowed list reaches skill-inject through the system prompt's own
// `selectedTools` (BuildSystemPromptOptions), which pi fills from the active
// tool set — no side channel needed.

function getAllowedTools(): Set<string> | null {
  const raw = getString("allowedTools");
  if (!raw) return null; // no gating when unset
  return new Set(raw.split(",").map((t) => t.trim()).filter(Boolean));
}

export default function (pi: ExtensionAPI) {
  const allowed = getAllowedTools();
  if (!allowed) return; // nothing to gate

  pi.on("tool_call", async (event) => {
    if (allowed.has(event.toolName)) return;
    const available = Array.from(allowed).join(", ");
    return {
      block: true,
      reason:
        `Tool '${event.toolName}' is not in the allowed list. Allowed tools: ${available}`,
    };
  });

  // Narrow the advertised set so the model never plans around a blocked tool.
  pi.on("session_start", async () => {
    const allTools = pi.getAllTools();
    const enabled = allTools.filter((t) => allowed.has(t.name));
    pi.setActiveTools(enabled.map((t) => t.name));
  });
}
