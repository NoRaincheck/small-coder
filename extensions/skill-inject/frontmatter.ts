// Minimal YAML-like frontmatter parser for skill markdown files.
// Reads --- delimited blocks at the top of a file and parses key: value pairs.

export interface SkillFrontmatter {
  name?: string;
  description?: string;
  priority?: number; // higher = more important
  tags?: string[];
  errorRecoveryTags?: string[]; // tags that trigger this skill on error recovery
}

/**
 * Parse frontmatter from a markdown file.
 * Expects content starting with "---", then key: value lines, then "---".
 */
export function parseFrontmatter(content: string): SkillFrontmatter {
  const trimmed = content.trimStart();
  if (!trimmed.startsWith("---")) return {};

  const endIdx = trimmed.indexOf("\n---\n");
  if (endIdx === -1) return {};

  const fmText = trimmed.slice(3, endIdx).trim();
  const fm: SkillFrontmatter = {};

  for (const line of fmText.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;

    const key = line.slice(0, colonIdx).trim().toLowerCase();
    const value = line.slice(colonIdx + 1).trim();

    switch (key) {
      case "name":
        fm.name = value.replace(/^["']|["']$/g, "");
        break;
      case "description":
        fm.description = value.replace(/^["']|["']$/g, "");
        break;
      case "priority": {
        const cleaned = value.replace(/^['"]|['"]$/g, "");
        const n = parseInt(cleaned, 10);
        if (!isNaN(n)) fm.priority = n;
        break;
      }
      case "tags":
      case "error_recovery_tags":
      case "errorRecoveryTags": {
        // Parse comma-separated or YAML list
        const cleaned = value.replace(/^\[|\]$/g, "");
        fm.tags = cleaned
          .split(",")
          .map((t) => t.trim().replace(/^["']|["']$/g, ""))
          .filter(Boolean);
        break;
      }
    }
  }

  return fm;
}

/**
 * Extract the body text after frontmatter delimiter.
 */
export function extractBody(content: string): string {
  const trimmed = content.trimStart();
  if (!trimmed.startsWith("---")) return trimmed;

  const endIdx = trimmed.indexOf("\n---\n");
  if (endIdx === -1) return "";

  // Skip past the closing --- and any blank line after it
  let bodyStart = endIdx + 4;
  while (bodyStart < content.length && content[bodyStart] === "\n") {
    bodyStart++;
  }
  return trimmed.slice(bodyStart);
}
