import { describe, expect, it } from "vitest";
import {
  extractBody,
  parseFrontmatter,
} from "../extensions/skill-inject/frontmatter.ts";

describe("parseFrontmatter", () => {
  it("parses basic frontmatter", () => {
    const content = `---
name: Binary Search
description: Efficient search in sorted data
priority: 8
tags: ["binary search", "sorted"]
---
Body text here`;

    const fm = parseFrontmatter(content);
    expect(fm.name).toBe("Binary Search");
    expect(fm.description).toBe("Efficient search in sorted data");
    expect(fm.priority).toBe(8);
    expect(fm.tags).toEqual(["binary search", "sorted"]);
  });

  it("returns empty object for content without frontmatter", () => {
    const fm = parseFrontmatter("Just plain text.\nNo frontmatter here.");
    expect(fm).toEqual({});
  });

  it("parses single-quoted values", () => {
    const content = `---
name: 'My Skill'
priority: "5"
---\nBody`;
    const fm = parseFrontmatter(content);
    expect(fm.name).toBe("My Skill");
    expect(fm.priority).toBe(5);
  });

  it("handles missing frontmatter fields gracefully", () => {
    const content = `---
name: Minimal
---\nBody`;
    const fm = parseFrontmatter(content);
    expect(fm.name).toBe("Minimal");
    expect(fm.description).toBeUndefined();
    expect(fm.priority).toBeUndefined();
  });
});

describe("extractBody", () => {
  it("returns body after frontmatter delimiters", () => {
    const content = `---\nname: Test\n---\nThis is the body.`;
    expect(extractBody(content)).toBe("This is the body.");
  });

  it("strips trailing newlines from body start", () => {
    const content = `---\nname: Test\n---\n\n\nBody with blank lines.`;
    expect(extractBody(content).trim()).toBe("Body with blank lines.");
  });

  it("returns full content when no frontmatter", () => {
    const content = "No frontmatter at all.";
    expect(extractBody(content)).toBe(content);
  });
});
