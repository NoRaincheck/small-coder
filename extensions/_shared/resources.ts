// Shared skill-resource plumbing for small-coder's per-turn injectors.
//
// pi resolves skills through the `resources_discover` event and reports the
// resulting set on `before_agent_start` → `systemPromptOptions.skills`. That
// array is the authoritative list of skill files pi actually loaded — it
// includes user- and project-supplied skills, not just ours — so both
// injectors read their file list from there instead of re-walking the
// filesystem and guessing at roots.
//
// The package manifest declares `skills: ["./skills"]`, but pi's discovery
// rules (core/skills.js::loadSkillsFromDirInternal) only pick up direct `.md`
// children of a root or `SKILL.md` files in subdirectories. Our layout is
// `skills/<category>/<name>.md`, so `./skills` on its own resolves to nothing.
// We therefore contribute the three category roots explicitly.

import { readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI, Skill } from "@earendil-works/pi-coding-agent";
import {
  extractBody,
  parseFrontmatter,
  type SkillFrontmatter,
} from "../skill-inject/frontmatter.ts";

export type SkillCategory = "tools" | "knowledge" | "protocols";

const CATEGORY_ROOTS: readonly SkillCategory[] = [
  "tools",
  "knowledge",
  "protocols",
];

// extensions/_shared/resources.ts → package root
const PACKAGE_ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

export function skillsRoot(): string {
  return join(PACKAGE_ROOT, "skills");
}

/** Map a skill's containing directory back to one of our categories. */
export function categorize(baseDir: string): SkillCategory | null {
  // Normalize separators so a Windows-style baseDir classifies the same way on
  // POSIX, where basename() would otherwise treat the whole path as one segment.
  const name = basename(baseDir.replace(/\\/g, "/"));
  return (CATEGORY_ROOTS as readonly string[]).includes(name)
    ? (name as SkillCategory)
    : null;
}

let rootsRegistered = false;

/**
 * Contribute small-coder's three skill category roots to pi's resource
 * discovery so they land in `systemPromptOptions.skills`.
 *
 * Both injectors import this module, so the module-level flag makes the
 * handler register exactly once no matter how many extensions call it.
 */
export function registerSkillRoots(pi: ExtensionAPI): void {
  if (rootsRegistered) return;
  rootsRegistered = true;
  pi.on("resources_discover", () => ({
    skillPaths: CATEGORY_ROOTS.map((c) => join(skillsRoot(), c)),
  }));
}

/** Reset the registration guard. Test-only. */
export function resetSkillRootsForTesting(): void {
  rootsRegistered = false;
}

export interface SkillEntry {
  filePath: string;
  category: SkillCategory;
  frontmatter: SkillFrontmatter;
  body: string;
}

/**
 * Read and parse every skill in `files` whose baseDir maps to `category`.
 * Sorted by frontmatter priority, highest first.
 */
export function loadEntries(
  files: readonly Pick<Skill, "filePath" | "baseDir">[],
  category: SkillCategory,
): SkillEntry[] {
  const entries: SkillEntry[] = [];
  for (const file of files) {
    const cat = categorize(file.baseDir);
    if (cat !== category) continue;
    let content: string;
    try {
      content = readFileSync(file.filePath, "utf-8");
    } catch {
      continue;
    }
    entries.push({
      filePath: file.filePath,
      category: cat,
      frontmatter: parseFrontmatter(content),
      body: extractBody(content),
    });
  }
  return entries.sort((a, b) =>
    (b.frontmatter.priority ?? 0) - (a.frontmatter.priority ?? 0)
  );
}

/**
 * Human-readable heading for a card. `name` has to stay a slug for pi's
 * validator, so cards prefer the explicit `title` when a skill declares one.
 */
export function titleOf(entry: SkillEntry): string {
  return entry.frontmatter.title ??
    entry.frontmatter.name ??
    basename(entry.filePath).replace(/\.md$/, "");
}

/** True when the skill's tags name any of `names` (case-insensitive). */
export function tagsMention(
  entry: SkillEntry,
  names: Iterable<string>,
): boolean {
  const tags = (entry.frontmatter.tags ?? []).map((t) => t.toLowerCase());
  for (const name of names) {
    if (tags.includes(name.toLowerCase())) return true;
  }
  return false;
}

/** True when the skill body mentions any of `names` as a whole word. */
export function bodyMentions(
  entry: SkillEntry,
  names: Iterable<string>,
): boolean {
  const body = entry.body.toLowerCase();
  for (const name of names) {
    const needle = name.toLowerCase();
    if (needle.length === 0) continue;
    const at = body.indexOf(needle);
    if (at !== -1) {
      const before = at === 0 ? "" : body[at - 1];
      const after = body[at + needle.length] ?? " ";
      const isWord = (c: string) => /[a-z0-9]/.test(c);
      if (!isWord(before) && !isWord(after)) return true;
    }
  }
  return false;
}
