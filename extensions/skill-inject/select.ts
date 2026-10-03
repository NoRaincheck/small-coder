// Pure per-turn tool-skill card selection.
//
// Priority is error-recovery > recency > intent, capped by a token budget so
// a small model's context window is never spent on guidance it can't use.
// Kept free of pi types so it is directly unit-testable.

import {
  bodyMentions,
  type SkillEntry,
  tagsMention,
} from "../_shared/resources.ts";

/** True when any needle appears in any haystack entry (case-insensitive). */
function matchesAny(
  needles: readonly string[],
  haystacks: readonly string[],
): boolean {
  if (needles.length === 0 || haystacks.length === 0) return false;
  const lowered = new Set(haystacks.map((h) => h.toLowerCase()));
  return needles.some((n) => lowered.has(n.toLowerCase()));
}

export const MAX_INJECTED_SKILLS = 3;

export interface SelectionInput {
  entries: readonly SkillEntry[];
  /** Tools whose last invocation errored or was blocked this session. */
  failedTools?: readonly string[];
  /** Tools invoked recently, most recent last. */
  recentTools?: readonly string[];
  /** The current user prompt. */
  prompt?: string;
  /**
   * When present, only cards naming one of these tools are eligible. Empty
   * array means "no tools enabled" and therefore no cards.
   */
  allowedTools?: readonly string[] | undefined;
  limit?: number;
}

/** True when a card is usable given the currently enabled tool set. */
function eligible(
  entry: SkillEntry,
  allowedTools: readonly string[] | undefined,
): boolean {
  if (allowedTools === undefined) return true;
  return tagsMention(entry, allowedTools) || bodyMentions(entry, allowedTools);
}

/** Simple intent match: each frontmatter tag found in the prompt scores +1. */
export function scoreByIntent(
  prompt: string,
  entry: SkillEntry,
): number {
  const tags = entry.frontmatter.tags;
  if (!prompt || !tags || tags.length === 0) return 0;
  const haystack = prompt.toLowerCase();
  let score = 0;
  for (const tag of tags) {
    if (haystack.includes(tag.toLowerCase())) score++;
  }
  return score;
}

export function selectSkills(input: SelectionInput): SkillEntry[] {
  const limit = input.limit ?? MAX_INJECTED_SKILLS;
  if (limit <= 0) return [];

  const allowedTools = input.allowedTools;
  const pool = input.entries.filter((e) => eligible(e, allowedTools));
  if (pool.length === 0) return [];

  const failedTools = input.failedTools ?? [];
  const recentTools = input.recentTools ?? [];
  const prompt = input.prompt ?? "";

  const selected: SkillEntry[] = [];
  const injected = new Set<string>();
  const take = (entry: SkillEntry) => {
    if (selected.length >= limit || injected.has(entry.filePath)) return false;
    selected.push(entry);
    injected.add(entry.filePath);
    return true;
  };

  // 1. Error recovery — the model just got burned by this tool; show the card.
  //    `error_recovery_tags` is the explicit hook (e.g. write-guard refusing a
  //    write maps to "existing_file"); tags/body are the fuzzy fallback.
  for (const entry of pool) {
    if (selected.length >= limit) break;
    const hooks = entry.frontmatter.errorRecoveryTags ?? [];
    if (
      matchesAny(hooks, failedTools) ||
      tagsMention(entry, failedTools) ||
      bodyMentions(entry, failedTools)
    ) {
      take(entry);
    }
  }

  // 2. Recency — tools used in the recent past are probably still in play.
  if (selected.length < limit && recentTools.length > 0) {
    for (const entry of pool) {
      if (selected.length >= limit) break;
      if (tagsMention(entry, recentTools)) take(entry);
    }
  }

  // 3. Intent — match the highest-scoring remaining cards to the prompt.
  if (selected.length < limit && prompt) {
    const scored = pool
      .filter((e) => !injected.has(e.filePath))
      .map((entry) => ({ entry, score: scoreByIntent(prompt, entry) }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score);

    for (const { entry } of scored) {
      if (selected.length >= limit) break;
      take(entry);
    }
  }

  return selected;
}
