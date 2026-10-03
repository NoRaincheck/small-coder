// Pure algorithm-cheat-sheet scoring against the user prompt.
//
// Word hits score 1.0, adjacent-word-pair (bigram) hits score 2.0 — a bigram
// match is much stronger evidence that the sheet is relevant than two
// scattered words. Kept free of pi types so it is directly unit-testable.

import type { SkillEntry } from "../_shared/resources.ts";

export const MAX_INJECTED = 3;
export const BIGRAM_WEIGHT = 2.0;
export const WORD_WEIGHT = 1.0;

export interface Tokens {
  words: Set<string>;
  bigrams: Set<string>;
}

export function tokenize(text: string): Tokens {
  const tokens = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const words = new Set(tokens);
  const bigrams = new Set<string>();
  for (let i = 0; i < tokens.length - 1; i++) {
    bigrams.add(`${tokens[i]} ${tokens[i + 1]}`);
  }
  return { words, bigrams };
}

function textTokens(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

function bigramsOf(tokens: readonly string[]): Set<string> {
  const bigrams = new Set<string>();
  for (let i = 0; i < tokens.length - 1; i++) {
    bigrams.add(`${tokens[i]} ${tokens[i + 1]}`);
  }
  return bigrams;
}

/**
 * Score one entry against tokenized prompt text.
 *
 * A sheet scores on its frontmatter tags (the primary handle) plus its title,
 * so "sort the array" can match a `Two Pointers & Sliding Window` sheet via
 * the name even when the prompt never says "two pointers".
 */
export function scoreEntry(entry: SkillEntry, prompt: Tokens): number {
  let score = 0;

  const scoreText = (text: string) => {
    const tokens = textTokens(text);
    for (const token of tokens) {
      if (prompt.words.has(token)) score += WORD_WEIGHT;
    }
    const tagBigrams = bigramsOf(tokens);
    for (const bigram of tagBigrams) {
      if (prompt.bigrams.has(bigram)) score += BIGRAM_WEIGHT;
    }
  };

  for (const tag of entry.frontmatter.tags ?? []) {
    scoreText(tag);
  }
  scoreText(entry.frontmatter.name ?? "");

  return score;
}

export interface KnowledgeSelection {
  entry: SkillEntry;
  score: number;
}

/** Top `limit` sheets with a non-zero score, highest first. */
export function selectKnowledge(
  entries: readonly SkillEntry[],
  prompt: string,
  limit: number = MAX_INJECTED,
): KnowledgeSelection[] {
  if (!prompt.trim() || limit <= 0) return [];
  const tokens = tokenize(prompt);
  return entries
    .map((entry) => ({ entry, score: scoreEntry(entry, tokens) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
