// JSON repair + text-based tool-call extraction from assistant response text.
// Small models often embed tool calls as fenced ```tool blocks or <tool_call> tags
// instead of using native tool-call channel. This parser extracts them.

export interface ExtractedCall {
  name: string;
  input: unknown;
}

/**
 * Try to repair broken JSON before parsing. Handles:
 * - Trailing commas
 * - Single quotes → double quotes (for keys/values outside strings)
 * - Missing closing braces/brackets
 * - Trailing garbage after valid JSON
 */
export function repairJson(text: string): string {
  let s = text.trim();

  // Step 1: Find the end of valid JSON by tracking brace/bracket depth
  let bd = 0, bkt = 0;
  let inString = false;
  let escapeNext = false;
  let lastCompleteIdx = -1;
  let insideStructure = false; // track if we were ever inside { or [

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (ch === "\\") {
      escapeNext = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    const bDelta = ch === "{" ? 1 : ch === "}" ? -1 : 0;
    const bkDelta = ch === "[" ? 1 : ch === "]" ? -1 : 0;
    bd += bDelta;
    bkt += bkDelta;

    if (bd > 0 || bkt > 0) insideStructure = true;

    // Track the last point where we completed a balanced structure
    // Only count it if we were previously inside a { or [
    if (insideStructure && bd <= 0 && bkt <= 0) {
      lastCompleteIdx = i + 1;
      break; // Found a complete balanced JSON structure — stop scanning
    }
  }

  // Use the last complete JSON boundary, or fall back to full string
  if (lastCompleteIdx > 0) {
    s = s.slice(0, lastCompleteIdx);
  }

  // Step 2: Remove trailing commas before } or ]
  s = s.replace(/,\s*([}\]])/g, "$1");

  // Step 3: Add missing closing braces/brackets
  let openBd = 0, openBkt = 0;
  for (const ch of s) {
    if (ch === "{") openBd++;
    else if (ch === "}") openBd--;
    else if (ch === "[") openBkt++;
    else if (ch === "]") openBkt--;
  }
  while (openBd > 0) {
    s += "}";
    openBd--;
  }
  while (openBkt > 0) {
    s += "]";
    openBkt--;
  }

  // Step 4: Replace single quotes with double quotes for keys/values
  // Only replace quotes that are NOT inside a string literal
  let result = "";
  inString = false;
  escapeNext = false;
  for (const ch of s) {
    if (escapeNext) {
      result += ch;
      escapeNext = false;
      continue;
    }
    if (ch === "\\") {
      result += ch;
      escapeNext = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      result += ch;
      continue;
    }
    if (!inString && ch === "'") {
      // Check context: is this a key or value quote?
      // Replace single quotes with double quotes
      result += '"';
    } else {
      result += ch;
    }
  }
  s = result;

  return s;
}

/**
 * Parse a JSON string with repair fallback. Returns the parsed value or
 * an object with _raw: originalText to signal malformed input downstream.
 */
export function safeParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const repaired = repairJson(text);
    // Also try single-quote replacement as a second attempt
    let altRepaired: string | undefined;
    try {
      altRepaired = repaired.replace(/'/g, '"');
      return JSON.parse(altRepaired);
    } catch {
      // no-op — fall through to _raw sentinel
    }

    if (repaired !== text) {
      try {
        return JSON.parse(repaired);
      } catch {
        // no-op
      }
    }

    return { _raw: text };
  }
}

/**
 * Extract tool calls from fenced ```tool blocks:
 * ```tool
 * {"name": "Bash", "arguments": {"command": "ls"}}
 * ```
 */
function extractFencedToolBlocks(text: string): ExtractedCall[] {
  const results: ExtractedCall[] = [];

  // Match ```tool ... ``` or ```json ... ``` blocks that look like tool calls
  const fencedRegex = /```(?:tool|json)\s*\n([\s\S]*?)```/g;
  let match;

  while ((match = fencedRegex.exec(text)) !== null) {
    const inner = match[1].trim();
    // Try to find a JSON object within the block
    const objStart = inner.indexOf("{");
    if (objStart === -1) continue;
    const objStr = inner.slice(objStart);

    const parsed = safeParseJson(objStr);
    if (!parsed || typeof parsed !== "object" || "_raw" in parsed) {
      // Try extracting name and arguments from a more lenient pattern
      const nameMatch = objStr.match(/["']?name["']?\s*:\s*["'](.*?)["']/);
      const argsMatch = objStr.match(
        /["']?(?:arguments|input)["']?\s*:\s*(\{[\s\S]*\})/,
      );
      if (nameMatch) {
        results.push({
          name: nameMatch[1],
          input: argsMatch ? safeParseJson(argsMatch[1]) : {},
        });
      }
      continue;
    }

    const obj = parsed as Record<string, unknown>;
    const name = typeof obj.name === "string" ? obj.name : "";
    if (!name) continue;

    let input: unknown = {};
    if (typeof obj.arguments === "object") {
      input = obj.arguments;
    } else if (typeof obj.input === "object") {
      input = obj.input;
    } else if (typeof obj.parameters === "object") {
      input = obj.parameters;
    }

    results.push({ name, input });
  }

  return results;
}

/**
 * Extract tool calls from XML-style <tool_call> tags:
 * <tool>bash</tool><args>{"command": "ls"}</args>
 */
function extractXmlToolTags(text: string): ExtractedCall[] {
  const results: ExtractedCall[] = [];

  // Match <tool>name</tool>...<args>...</args> or <arguments>...</arguments> patterns
  const toolTagRegex = /<tool>\s*(\w+)\s*<\/tool>/g;
  let match;

  while ((match = toolTagRegex.exec(text)) !== null) {
    const name = match[1];
    // Look for args/arguments after the tool tag
    const rest = text.slice(match.index + match[0].length);
    const argsMatch = rest.match(
      /<(?:args|arguments)\s*>\s*(\{[\s\S]*?\})\s*<\/(?:args|arguments)>/,
    );

    let input: unknown = {};
    if (argsMatch) {
      input = safeParseJson(argsMatch[1]);
    }

    results.push({ name, input });
  }

  return results;
}

/**
 * Extract tool calls from markdown code blocks with inline language hints:
 * ```bash
 * command here
 * ``` (for Bash tool specifically)
 */
function extractMarkdownToolHints(text: string): ExtractedCall[] {
  const results: ExtractedCall[] = [];

  // Look for patterns like "tool call: Bash(...)" or explicit mentions
  const inlineRegex =
    /(?:tool\s*call|execute|run)\s*[:(]\s*(\w+)\s*\(([\s\S]*?)\)/gi;
  let match;

  while ((match = inlineRegex.exec(text)) !== null) {
    const name = match[1];
    // Skip if it looks like natural language, not a tool call
    if (
      ["please", "can", "could", "should", "would"].includes(name.toLowerCase())
    ) {
      continue;
    }
    results.push({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      input: {},
    });
  }

  return results;
}

/**
 * Main extraction function — tries multiple strategies and deduplicates.
 */
export function parseTextToolCalls(text: string): ExtractedCall[] {
  const all: Map<string, ExtractedCall> = new Map();

  for (const call of extractFencedToolBlocks(text)) {
    const key = `${call.name}:${JSON.stringify(call.input)}`;
    if (!all.has(key)) all.set(key, call);
  }

  for (const call of extractXmlToolTags(text)) {
    const key = `${call.name}:${JSON.stringify(call.input)}`;
    if (!all.has(key)) all.set(key, call);
  }

  for (const call of extractMarkdownToolHints(text)) {
    const key = `${call.name}:${JSON.stringify(call.input)}`;
    if (!all.has(key)) all.set(key, call);
  }

  return Array.from(all.values());
}
