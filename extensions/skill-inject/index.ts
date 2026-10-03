import type {
  ExtensionAPI,
  ToolResultEvent,
} from "@earendil-works/pi-coding-agent";
import {
  loadEntries,
  registerSkillRoots,
  type SkillEntry,
  titleOf,
} from "../_shared/resources.ts";
import { selectSkills } from "./select.ts";

// Per-turn tool-skill card selection: error-recovery > recency > intent.
//
// Skill files come from `before_agent_start` → `systemPromptOptions.skills`,
// which is the set pi actually resolved for this session (ours plus anything
// the user or project added). We only ever read `systemPrompt` off the event
// and write it back through the handler's return value — pi's runner builds a
// fresh event per handler and discards in-place mutations
// (core/extensions/runner.js), so mutating `event.systemPrompt` is a no-op.

const MAX_TRACKED_TOOLS = 12;

let recentTools: string[] = [];
let failedTools: string[] = [];

function remember(list: string[], name: string): void {
  if (!name || list.includes(name)) return;
  list.unshift(name);
  if (list.length > MAX_TRACKED_TOOLS) list.length = MAX_TRACKED_TOOLS;
}

export function renderCards(entries: readonly SkillEntry[]): string {
  if (entries.length === 0) return "";
  const body = entries.map((entry) => {
    const title = titleOf(entry);
    return entry.body.trim()
      ? `### ${title}\n\n${entry.body.trim()}`
      : `### ${title}\n\n(empty skill file)`;
  }).join("\n\n");
  return `## Tool Usage Guidance\n\n${body}`;
}

export default function (pi: ExtensionAPI) {
  registerSkillRoots(pi);

  // Cache parsed skill bodies — re-reading every file on every turn is pure
  // waste. Keyed on the resolved file list so a session swap re-reads.
  let cacheKey = "";
  let cached: SkillEntry[] = [];

  pi.on("session_start", async () => {
    recentTools = [];
    failedTools = [];
    cacheKey = "";
    cached = [];
  });

  // Recency signal.
  pi.on("tool_execution_start", async (event) => {
    remember(recentTools, event.toolName);
  });

  // Error-recovery signal. A blocked or failed call reaches the model as an
  // errored tool result, which is also the only place we can observe it —
  // `ToolCallEvent` carries no `blocked` flag.
  pi.on("tool_result", async (event: ToolResultEvent) => {
    if (event.isError) remember(failedTools, event.toolName);
  });

  pi.on("before_agent_start", async (event) => {
    const skills = event.systemPromptOptions.skills ?? [];
    if (skills.length === 0) return;

    // loadEntries classifies by baseDir basename, so we hand it everything
    // and let it keep only the `tools` category. Do not string-match the path
    // here — separators are platform-dependent.
    const key = skills.map((s) => s.filePath).join("\0");
    if (key !== cacheKey) {
      cached = loadEntries(skills, "tools");
      cacheKey = key;
    }
    if (cached.length === 0) return;

    const selected = selectSkills({
      entries: cached,
      failedTools,
      recentTools,
      prompt: event.prompt,
      allowedTools: event.systemPromptOptions.selectedTools,
    });
    const cards = renderCards(selected);
    if (!cards) return;

    // Chain onto whatever the previously-registered extension left us with.
    return { systemPrompt: `${event.systemPrompt}\n\n---\n${cards}` };
  });
}
