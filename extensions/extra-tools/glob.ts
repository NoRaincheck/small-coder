// Bounded glob walk with heavy-dir pruning.
// Avoids node_modules, .git, and other large directories by default.

import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const DEFAULT_IGNORE = new Set([
  "node_modules",
  ".git",
  ".svn",
  ".hg",
  ".DS_Store",
  "__pycache__",
  ".tox",
  ".nox",
  ".venv",
  "venv",
  "dist",
  "build",
  ".next",
  ".nuxt",
  ".output",
]);

interface GlobOptions {
  baseDir?: string;
  pattern?: string; // simple glob: *.ts, src/**/*.js, etc.
  maxDepth?: number;
  ignoreDirs?: Set<string>;
}

/**
 * Simple glob matcher supporting *, **, and extension patterns.
 */
function matchesPattern(name: string, pattern: string): boolean {
  if (pattern === "*") return true;
  if (pattern.endsWith("/**/*")) {
    const prefix = pattern.slice(0, -4); // remove /**/*
    return name.startsWith(prefix + "/");
  }
  if (pattern.includes("**")) {
    // Handle **/something patterns
    const parts = pattern.split("**").filter(Boolean);
    return parts.every((p) => name.includes(p));
  }
  if (pattern.includes("*") && !pattern.includes("/")) {
    // Simple extension/wildcard match: *.ts, test*.js
    const regex = new RegExp("^" + pattern.replace(/\*/g, ".*") + "$");
    return regex.test(name);
  }
  return name === pattern;
}

/**
 * Walk a directory tree and return matching file paths.
 */
export function globWalk(
  dir: string,
  options: GlobOptions = {},
): string[] {
  const {
    baseDir = dir,
    pattern = "*",
    maxDepth = 20,
    ignoreDirs = DEFAULT_IGNORE,
  } = options;

  const results: string[] = [];

  function walk(currentDir: string, depth: number): void {
    if (depth > maxDepth) return;

    let entries: string[];
    try {
      entries = readdirSync(currentDir);
    } catch {
      return; // skip unreadable dirs
    }

    for (const entry of entries) {
      const fullPath = join(currentDir, entry);
      const stat = safeStat(fullPath);
      if (!stat) continue;

      if (stat.isDirectory() && ignoreDirs.has(entry)) continue;
      if (stat.isDirectory()) {
        walk(fullPath, depth + 1);
      } else if (matchesPattern(entry, pattern)) {
        results.push(fullPath);
      }
    }
  }

  walk(dir, 0);
  return results;
}

function safeStat(path: string): { isDirectory(): boolean } | null {
  try {
    const s = statSync(path);
    return { isDirectory: () => s.isDirectory() };
  } catch {
    return null;
  }
}
