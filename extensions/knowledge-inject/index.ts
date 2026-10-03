import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  loadEntries,
  registerSkillRoots,
  type SkillEntry,
  titleOf,
} from "../_shared/resources.ts";
import { selectKnowledge } from "./score.ts";

// Per-turn algorithm cheat sheets, scored against the user prompt.
//
// Same contract as skill-inject: read the resolved skill list off
// `systemPromptOptions.skills`, write the system prompt back through the
// handler's return value. In-place mutation of `event.systemPrompt` is
// discarded by pi's runner.

export function renderReference(entries: readonly SkillEntry[]): string {
  if (entries.length === 0) return "";
  const body = entries.map((entry) => {
    const title = titleOf(entry);
    return entry.body.trim()
      ? `### ${title}\n\n${entry.body.trim()}`
      : `### ${title}\n\n(empty)`;
  }).join("\n\n");
  return `## Algorithm Reference\n\n${body}`;
}

export default function (pi: ExtensionAPI) {
  registerSkillRoots(pi);

  let cacheKey = "";
  let cached: SkillEntry[] = [];

  pi.on("session_start", async () => {
    cacheKey = "";
    cached = [];
  });

  pi.on("before_agent_start", async (event) => {
    const skills = event.systemPromptOptions.skills ?? [];
    if (skills.length === 0) return;

    const key = skills.map((s) => s.filePath).join("\0");
    if (key !== cacheKey) {
      cached = loadEntries(skills, "knowledge");
      cacheKey = key;
    }
    if (cached.length === 0) return;

    const selected = selectKnowledge(cached, event.prompt);
    const reference = renderReference(selected.map((s) => s.entry));
    if (!reference) return;

    return { systemPrompt: `${event.systemPrompt}\n\n---\n${reference}` };
  });
}
