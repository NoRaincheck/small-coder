import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  extractBody,
  parseFrontmatter,
  type SkillFrontmatter,
} from "../skill-inject/frontmatter.ts";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Algorithm cheat-sheet scoring (word=1.0, bigram=2.0) against user prompt;
// adds ## Algorithm Reference block to system prompt for the top matches.

interface KnowledgeEntry {
  path: string;
  frontmatter: SkillFrontmatter;
  body: string;
}

const MAX_INJECTED = 3; // max cheat sheets per turn (token budget guard)
const BIGRAM_WEIGHT = 2.0;
const WORD_WEIGHT = 1.0;

// Cache loaded knowledge entries on first use
let cachedKnowledge: KnowledgeEntry[] | null = null;

function loadKnowledge(skillPaths: string[]): KnowledgeEntry[] {
  const all: KnowledgeEntry[] = [];

  for (const baseDir of skillPaths) {
    const dirPath = join(baseDir, "knowledge");
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
          continue;
        }

        const fm = parseFrontmatter(content);
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

  return all;
}

/**
 * Tokenize a prompt into words and bigrams for scoring.
 */
function tokenize(text: string): { words: Set<string>; bigrams: Set<string> } {
  const lower = text.toLowerCase();
  const tokens = lower.match(/[a-z]+/g) || [];
  const words = new Set(tokens);

  const bigrams = new Set<string>();
  for (let i = 0; i < tokens.length - 1; i++) {
    bigrams.add(`${tokens[i]}_${tokens[i + 1]}`);
  }

  return { words, bigrams };
}

/**
 * Score a knowledge entry against the tokenized prompt.
 */
function scoreEntry(
  entry: KnowledgeEntry,
  tokens: ReturnType<typeof tokenize>,
): number {
  if (!entry.frontmatter.tags) return 0;

  let score = 0;
  const lowerBody = entry.body.toLowerCase();

  for (const tag of entry.frontmatter.tags) {
    const lowerTag = tag.toLowerCase();
    // Check as word match against prompt tokens
    if (tokens.words.has(lowerTag)) {
      score += WORD_WEIGHT *
        countOccurrences(textToTokens(lowerTag), [...tokens.words].join(" "));
    }

    // Also check entry body for keyword matches
    const tagTokens = textToTokens(lowerTag);
    for (const token of tagTokens) {
      if (lowerBody.includes(token) && tokens.words.has(token)) {
        score += WORD_WEIGHT * 0.5;
      }
    }
  }

  return score;
}

function countOccurrences(tokens: string[], haystack: string): number {
  if (tokens.length === 0 || haystack.length === 0) return 0;
  let count = 0;
  const pattern = tokens.join("");
  for (let i = 0; i <= haystack.length - pattern.length; i++) {
    if (haystack.slice(i, i + pattern.length) === pattern) count++;
  }
  return count;
}

function textToTokens(text: string): string[] {
  return text.match(/[a-z]+/g) || [];
}

/**
 * Build an algorithm reference card from a knowledge entry.
 */
function buildReferenceCard(entry: KnowledgeEntry): string {
  const title = entry.frontmatter.name ||
    entry.path.split("/").pop()?.replace(".md", "") || "algorithm";
  if (!entry.body.trim()) {
    return `## Algorithm Reference\n- **${title}**: (empty)`;
  }
  return `## Algorithm Reference\n### ${title}\n\n${entry.body}`;
}

export default function (pi: ExtensionAPI) {
  let allKnowledge: KnowledgeEntry[] = [];

  pi.on("session_start", async () => {
    cachedKnowledge = null; // reset cache on new session
  });

  pi.on("before_agent_start", async (event, ctx) => {
    // Load knowledge entries lazily on first use
    const skillPaths = ((event as any).skillPaths as string[]) || [];
    if (!cachedKnowledge) {
      allKnowledge = loadKnowledge(skillPaths);
      cachedKnowledge = allKnowledge;
    }

    if (!allKnowledge.length) return;

    const prompt = (event as any).prompt || "";
    if (!prompt.trim()) return;

    const tokens = tokenize(prompt);

    // Score all entries and sort by score descending
    const scored = allKnowledge
      .map((entry) => ({ entry, score: scoreEntry(entry, tokens) }))
      .sort((a, b) => (b.score as number) - (a.score as number));

    // Take top N with non-zero scores
    const selected = scored.filter((s) => (s.score as number) > 0).slice(
      0,
      MAX_INJECTED,
    );

    if (selected.length === 0) return;

    // Inject the cheat sheets into the system prompt
    const cards = selected.map(({ entry }) => buildReferenceCard(entry)).join(
      "\n\n",
    );
    event.systemPrompt += `\n\n---\n## Algorithm Reference\n${cards}`;
  });
}
