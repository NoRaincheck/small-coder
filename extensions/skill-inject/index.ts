import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  extractBody,
  parseFrontmatter,
  type SkillFrontmatter,
} from "./frontmatter.ts";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Per-turn tool-skill card selection algorithm:
// error-recovery > recency > intent prediction.
// Budget-guarded and cached to avoid per-turn filesystem reads.

interface SkillEntry {
  path: string;
  frontmatter: SkillFrontmatter;
  body: string;
}

const MAX_INJECTED_SKILLS = 3; // max skill cards to inject per turn (token budget guard)
const SKILL_DIRS = ["tools", "knowledge"]; // directories under skills/

// Cache loaded skills on first use
let cachedSkills: SkillEntry[] | null = null;

function loadSkills(skillPaths: string[]): SkillEntry[] {
  const all: SkillEntry[] = [];

  for (const baseDir of skillPaths) {
    for (const subDir of SKILL_DIRS) {
      const dirPath = join(baseDir, subDir);
      if (!existsSync(dirPath)) continue;

      try {
        const files = readdirSync(dirPath).sort();
        for (const file of files) {
          if (!file.endsWith(".md")) continue;
          const filePath = join(dirPath, file);
          let content: string;
          try {
            content = readFileSync(filePath, "utf-8");
          } catch {
            continue; // skip unreadable files
          }

          const fm = parseFrontmatter(content);
          if (!fm.name && !subDir) continue; // skip entries with no identity

          all.push({
            path: filePath,
            frontmatter: fm,
            body: extractBody(content),
          });
        }
      } catch {
        // skip unreadable directories
      }
    }
  }

  return all.sort((a, b) =>
    (b.frontmatter.priority ?? 0) - (a.frontmatter.priority ?? 0)
  );
}

/**
 * Build a skill card string from an entry. Skips empty bodies.
 */
function buildCard(entry: SkillEntry): string {
  const title = entry.frontmatter.name ||
    entry.path.split("/").pop()?.replace(".md", "") || "unknown";
  if (!entry.body.trim()) {
    return `## Tool Usage Guidance\n- **${title}**: (empty skill file)`;
  }
  return `## Tool Usage Guidance\n### ${title}\n\n${entry.body}`;
}

/**
 * Score a skill against the user prompt for intent matching.
 * Simple keyword match: each tag that appears in the prompt scores +1.
 */
function scoreByIntent(prompt: string, entry: SkillEntry): number {
  if (!prompt || !entry.frontmatter.tags) return 0;
  const lowerPrompt = prompt.toLowerCase();
  let score = 0;
  for (const tag of entry.frontmatter.tags) {
    if (lowerPrompt.includes(tag.toLowerCase())) score++;
  }
  return score;
}

// Track previous turn's failed tools for error-recovery injection
let previousFailedTools: string[] = [];

export default function (pi: ExtensionAPI) {
  let allSkills: SkillEntry[] = [];

  pi.on("session_start", async () => {
    previousFailedTools = [];
    cachedSkills = null; // reset cache on new session
  });

  pi.on("tool_call", async (event, ctx) => {
    // Track blocked tool calls for error-recovery injection
    const evt = event as unknown as Record<string, unknown>;
    if (evt.blocked) {
      const name = event.toolName;
      if (typeof name === "string" && !previousFailedTools.includes(name)) {
        previousFailedTools.push(name);
      }
    }
  });

  pi.on("before_agent_start", async (event, ctx) => {
    // Load skills lazily on first use
    const skillPaths = ((event as any).skillPaths as string[]) || [];
    if (!cachedSkills) {
      allSkills = loadSkills(skillPaths);
      cachedSkills = allSkills;
    }

    if (!allSkills.length) return;

    const prompt = (event as any).prompt || "";
    let selected: SkillEntry[] = [];
    let injected = new Set<string>(); // avoid duplicates by path

    // 1. Error recovery — highest priority
    for (const skill of allSkills) {
      if (selected.length >= MAX_INJECTED_SKILLS) break;
      if (injected.has(skill.path)) continue;

      for (const failedTool of previousFailedTools) {
        const lowerName = failedTool.toLowerCase();
        const skillTags = skill.frontmatter.tags || [];
        // Match by tool name in tags or skill body mentions
        if (
          skillTags.some((t) => t.toLowerCase() === lowerName) ||
          skill.body.toLowerCase().includes(failedTool.toLowerCase())
        ) {
          selected.push(skill);
          injected.add(skill.path);
          break;
        }
      }
    }

    // 2. Recency — inject skills for tools that were used recently in the session
    if (selected.length < MAX_INJECTED_SKILLS) {
      const entries = ctx.sessionManager?.getEntries?.() || [];
      const recentToolNames = new Set<string>();

      for (const entry of entries.slice(-10)) { // last 10 entries
        const e = entry as unknown as Record<string, unknown>;
        if (e.type === "toolResult" && typeof e.toolName === "string") {
          recentToolNames.add(e.toolName);
        }
      }

      for (const skill of allSkills) {
        if (selected.length >= MAX_INJECTED_SKILLS) break;
        if (injected.has(skill.path)) continue;

        const skillTags = skill.frontmatter.tags || [];
        if (skillTags.some((t) => recentToolNames.has(t))) {
          selected.push(skill);
          injected.add(skill.path);
        }
      }
    }

    // 3. Intent prediction — match skills to the current prompt
    if (selected.length < MAX_INJECTED_SKILLS && prompt) {
      const scored = allSkills
        .filter((s) => !injected.has(s.path))
        .map((s) => ({ skill: s, score: scoreByIntent(prompt, s) }))
        .sort((a, b) => (b.score as number) - (a.score as number));

      for (const { skill } of scored.slice(0, 3)) {
        if (
          selected.length >= MAX_INJECTED_SKILLS || (skill as any).score <= 0
        ) break;
        selected.push(skill);
        injected.add(skill.path);
      }
    }

    // Inject the selected skills into the system prompt
    if (selected.length > 0) {
      const cards = selected.map(buildCard).join("\n\n");
      event.systemPrompt += `\n\n---\n## Tool Usage Guidance\n${cards}`;
    }
  });
}
