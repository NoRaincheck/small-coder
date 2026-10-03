export interface AllowDecision {
  allowed: boolean;
  /** The first segment that failed, when allowed is false. */
  offender?: string;
}

/**
 * Split a shell command into independently-checked segments.
 *
 * A plain `startsWith` prefix check is trivially defeated — `ls; rm -rf ~`
 * passes a `ls` allow-list. We split on the operators that let a second
 * command ride along with an allowed first one (`;`, `&&`, `||`, `|`, `&`,
 * newline) and require every segment to clear the bar.
 *
 * Redirections are deliberately NOT split on: `> file` changes what a segment
 * writes without introducing a new program, and splitting it off would reject
 * ordinary `echo hi > out.txt`.
 *
 * Operators inside quotes, and escaped characters, are left alone.
 */
export function segmentize(command: string): string[] {
  const segments: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;

  for (let i = 0; i < command.length; i++) {
    const ch = command[i]!;

    if (quote) {
      current += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === "\\") {
      current += ch + (command[i + 1] ?? "");
      i++;
      continue;
    }

    // Two-character operators first so `&&` isn't consumed as `&`.
    const two = command.slice(i, i + 2);
    if (two === "&&" || two === "||") {
      segments.push(current);
      current = "";
      i++;
      continue;
    }

    if (ch === ";" || ch === "|" || ch === "\n" || ch === "&") {
      segments.push(current);
      current = "";
      continue;
    }

    current += ch;
  }

  segments.push(current);
  return segments.map((s) => s.trim()).filter((s) => s.length > 0);
}

/**
 * Does a segment match an allowed prefix?
 *
 * Matching the whole segment rather than just its first token keeps multi-word
 * prefixes like `git log` working, while the word-boundary requirement stops
 * `rm` from admitting `rmdir`.
 */
export function segmentMatches(segment: string, prefix: string): boolean {
  const p = prefix.trim();
  if (!p) return false;
  if (segment === p) return true;
  if (!segment.startsWith(p)) return false;
  const next = segment[p.length];
  return next === undefined || /\s/.test(next);
}

/**
 * Check every segment against the allow-list.
 */
export function checkSegments(
  segments: readonly string[],
  prefixes: Iterable<string>,
): AllowDecision {
  const list = [...prefixes];
  for (const segment of segments) {
    if (list.some((p) => segmentMatches(segment, p))) continue;
    return { allowed: false, offender: segment };
  }
  return { allowed: true };
}

export function isCommandAllowed(
  command: string,
  prefixes: Iterable<string>,
): AllowDecision {
  return checkSegments(segmentize(command), prefixes);
}
