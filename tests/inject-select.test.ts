import { describe, expect, it } from "vitest";
import {
  scoreByIntent,
  selectSkills,
} from "../extensions/skill-inject/select.ts";
import {
  scoreEntry,
  selectKnowledge,
  tokenize,
} from "../extensions/knowledge-inject/score.ts";
import type { SkillEntry } from "../extensions/_shared/resources.ts";

function entry(
  name: string,
  tags: string[],
  body = "body text",
  priority?: number,
): SkillEntry {
  return {
    filePath: `/skills/${name}.md`,
    category: "tools",
    frontmatter: { name, tags, priority },
    body,
  };
}

describe("selectSkills", () => {
  const read = entry(
    "read",
    ["read", "file", "inspect"],
    "Use read to inspect",
    10,
  );
  const bash = entry("bash", ["bash", "shell", "command"], "Use bash", 8);
  const grep = entry("grep", ["grep", "search"], "Use grep to search", 9);

  it("returns nothing when there are no entries", () => {
    expect(selectSkills({ entries: [] })).toEqual([]);
  });

  it("prefers error recovery over everything else", () => {
    const selected = selectSkills({
      entries: [read, bash, grep],
      failedTools: ["grep"],
      recentTools: ["read"],
      prompt: "bash shell command",
    });
    expect(selected[0]?.frontmatter.name).toBe("grep");
  });

  it("falls back to recency when nothing failed", () => {
    const selected = selectSkills({
      entries: [read, bash, grep],
      recentTools: ["read"],
      prompt: "",
    });
    expect(selected[0]?.frontmatter.name).toBe("read");
  });

  it("falls back to intent when there is no history", () => {
    const selected = selectSkills({
      entries: [read, bash, grep],
      prompt: "please run a shell command",
    });
    expect(selected[0]?.frontmatter.name).toBe("bash");
  });

  it("never exceeds the budget", () => {
    const many = Array.from(
      { length: 10 },
      (_, i) => entry(`tool${i}`, [`tool${i}`]),
    );
    const failed = many.map((m) => m.frontmatter.name!);
    expect(selectSkills({ entries: many, failedTools: failed, limit: 3 }))
      .toHaveLength(3);
    expect(
      selectSkills({ entries: many, failedTools: failed, limit: 0 }),
    ).toHaveLength(0);
  });

  it("never returns the same card twice", () => {
    const selected = selectSkills({
      entries: [read],
      failedTools: ["read"],
      recentTools: ["read"],
      prompt: "read the file",
    });
    expect(selected).toHaveLength(1);
  });

  it("drops cards for tools that are not enabled", () => {
    const selected = selectSkills({
      entries: [read, bash, grep],
      recentTools: ["read", "bash", "grep"],
      prompt: "",
      allowedTools: ["bash"],
    });
    expect(selected.map((s) => s.frontmatter.name)).toEqual(["bash"]);
  });

  it("returns nothing when the allowed tool set is empty", () => {
    const selected = selectSkills({
      entries: [read, bash],
      recentTools: ["read", "bash"],
      allowedTools: [],
    });
    expect(selected).toEqual([]);
  });

  it("scores intent by tag occurrence", () => {
    expect(scoreByIntent("run a shell command", bash)).toBe(2); // bash? no: shell+command
    expect(scoreByIntent("", bash)).toBe(0);
  });
});

describe("tokenize", () => {
  it("collects words and adjacent bigrams", () => {
    const t = tokenize("two pointers sliding window");
    expect(t.words.has("two")).toBe(true);
    expect(t.bigrams.has("two pointers")).toBe(true);
    expect(t.bigrams.has("pointers sliding")).toBe(true);
  });

  it("is case and punctuation insensitive", () => {
    expect(tokenize("Two-Pointers!").words.has("two")).toBe(true);
  });

  it("handles empty input", () => {
    const t = tokenize("");
    expect(t.words.size).toBe(0);
    expect(t.bigrams.size).toBe(0);
  });
});

describe("scoreEntry", () => {
  const twoPointers = {
    filePath: "/k/tp.md",
    category: "knowledge" as const,
    frontmatter: {
      name: "Two Pointers",
      tags: ["two pointers", "sliding window"],
    },
    body: "",
  };
  const dfs = {
    filePath: "/k/dfs.md",
    category: "knowledge" as const,
    frontmatter: { name: "DFS & BFS", tags: ["dfs", "bfs", "graph"] },
    body: "",
  };

  it("weights a bigram match above a single word", () => {
    const tokens = tokenize("solve this with two pointers");
    const withBigram = scoreEntry(twoPointers, tokens);
    const single = scoreEntry(dfs, tokens);
    expect(withBigram).toBeGreaterThan(single);
    // "two pointers" scores 2 words + 1 bigram(2.0) from the tag, and the
    // same again from the sheet name.
    expect(withBigram).toBe(8);
  });

  it("scores zero for an unrelated prompt", () => {
    expect(scoreEntry(dfs, tokenize("update the readme"))).toBe(0);
  });

  it("matches on the sheet name even without the tag", () => {
    const named = {
      filePath: "/k/x.md",
      category: "knowledge" as const,
      frontmatter: { name: "Binary Search", tags: [] },
      body: "",
    };
    expect(scoreEntry(named, tokenize("use binary search here")))
      .toBeGreaterThan(0);
  });
});

describe("selectKnowledge", () => {
  const tp = {
    filePath: "/k/tp.md",
    category: "knowledge" as const,
    frontmatter: { name: "Two Pointers", tags: ["two pointers"] },
    body: "",
  };
  const dp = {
    filePath: "/k/dp.md",
    category: "knowledge" as const,
    frontmatter: { name: "Dynamic Programming", tags: ["dynamic programming"] },
    body: "",
  };

  it("returns nothing for an empty prompt", () => {
    expect(selectKnowledge([tp, dp], "")).toEqual([]);
    expect(selectKnowledge([tp, dp], "   ")).toEqual([]);
  });

  it("returns only non-zero scores, highest first", () => {
    const selected = selectKnowledge([tp, dp], "solve it with two pointers");
    expect(selected).toHaveLength(1);
    expect(selected[0]?.entry.frontmatter.name).toBe("Two Pointers");
  });

  it("respects the limit", () => {
    expect(selectKnowledge([tp, dp], "two pointers and dynamic programming", 1))
      .toHaveLength(1);
  });
});
