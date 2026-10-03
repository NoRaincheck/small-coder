// Pure read-trimming policy.
//
// pi's own read tool already truncates at 2000 lines / 50 KB
// (core/tools/truncate.ts) and offers `offset`/`limit` as an escape hatch, so
// this layer only intervenes on the gap pi leaves: a single read that fits
// pi's limits but still swamps a small model's context window.
//
// Two rules keep it from making things worse:
//   - an explicit `offset`/`limit` means the model already bounded the read
//   - content pi already truncated is left alone rather than double-trimmed
//
// Kept free of pi types so it is directly unit-testable.

export const DEFAULT_MAX_CHARS = 12_000;

/** Fraction of the budget kept from the head; the rest is kept from the tail. */
const HEAD_RATIO = 0.7;

export interface TrimOptions {
  maxChars?: number;
  /** The model supplied offset and/or limit — honor it, never trim. */
  explicitRange?: boolean;
  /** pi's own truncation already fired — don't double-trim. */
  alreadyTruncated?: boolean;
  /** Original file path, used to name a concrete follow-up read. */
  path?: string;
}

/**
 * Decide whether to trim, and to what. Returns `undefined` for "leave the
 * result alone", which the caller turns into a no-op handler return.
 */
export function planReadTrim(
  text: string,
  options: TrimOptions = {},
): string | undefined {
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
  if (maxChars <= 0) return undefined;
  if (options.explicitRange) return undefined;
  if (options.alreadyTruncated) return undefined;
  if (text.length <= maxChars) return undefined;

  const headLen = Math.max(1, Math.floor(maxChars * HEAD_RATIO));
  const tailLen = Math.max(0, maxChars - headLen);
  // Precondition is text.length > maxChars, and headLen + tailLen === maxChars,
  // so head and tail cannot overlap and the omitted count is exact.
  const omitted = text.length - maxChars;

  const head = text.slice(0, headLen);
  const tail = tailLen > 0 ? text.slice(text.length - tailLen) : "";

  const where = options.path ? ` of ${options.path}` : "";
  const retry = options.path
    ? ` Re-read the omitted middle with read("${options.path}", offset=N, limit=M).`
    : " Re-read the omitted middle with read(path, offset=N, limit=M).";

  const marker = `\n\n[... ${omitted} chars omitted${where} ...]${retry}\n\n`;

  return tail ? `${head}${marker}${tail}` : `${head}${marker}`;
}
