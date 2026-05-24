import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { globWalk } from "./glob.ts";
import { existsSync, readdirSync, statSync } from "node:fs";
import { isAbsolute, join } from "node:path";

// Extra tools not shipped by pi: Glob, WebFetch, WebSearch.
// These fill gaps in the default tool set for small-model coding workflows.

export default function (pi: ExtensionAPI) {
  // --- Glob Tool ---
  pi.registerTool({
    name: "glob",
    label: "Glob",
    description:
      "Find files matching a glob pattern. Supports *.ts, src/**/*.js, etc.",
    parameters: Type.Object({
      pattern: Type.String({
        description: "Glob pattern (e.g., '*.ts', 'src/**/*.js')",
      }),
      path: Type.Optional(
        Type.String({
          description: "Directory to search in (defaults to cwd)",
        }),
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const dir = params.path
        ? (isAbsolute(params.path)
          ? params.path
          : join(process.cwd(), params.path))
        : process.cwd();

      if (!existsSync(dir)) {
        return {
          content: [{
            type: "text",
            text: `Error: directory '${dir}' does not exist.`,
          }],
          isError: true,
          details: {},
        };
      }

      const results = globWalk(dir, { pattern: params.pattern });
      return {
        content: [{
          type: "text",
          text: results.length === 0
            ? "(no matches)"
            : results.join("\n") + `\n\n(${results.length} file(s))`,
        }],
        details: { count: results.length },
      };
    },
  });

  // --- WebFetch Tool ---
  pi.registerTool({
    name: "webfetch",
    label: "Web Fetch",
    description: "Fetch content from a URL. Returns the response body as text.",
    parameters: Type.Object({
      url: Type.String({ format: "uri", description: "URL to fetch" }),
      method: Type.Optional(
        Type.String({ default: "GET", description: "HTTP method (GET, POST)" }),
      ),
      headers: Type.Optional(Type.Record(Type.String(), Type.String())),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      try {
        const response = await fetch(params.url, {
          method: params.method || "GET",
          headers: params.headers ||
            { Accept: "text/html,application/xhtml+xml" },
        });

        if (!response.ok) {
          return {
            content: [{
              type: "text",
              text: `HTTP ${response.status}: ${response.statusText}`,
            }],
            isError: true,
            details: {},
          };
        }

        const text = await response.text();
        // Truncate very large responses to prevent context overflow
        const truncated = text.length > 10000
          ? text.slice(0, 10000) +
            `\n\n[TRUNCATED: ${text.length - 10000} more chars]`
          : text;

        return {
          content: [{ type: "text", text: truncated }],
          details: { status: response.status, size: text.length },
        };
      } catch (err) {
        return {
          content: [{
            type: "text",
            text: `Web fetch failed: ${(err as Error).message}`,
          }],
          isError: true,
          details: {},
        };
      }
    },
  });

  // --- WebSearch Tool ---
  pi.registerTool({
    name: "websearch",
    label: "Web Search",
    description:
      "Search the web using a search engine. Returns top results with snippets.",
    parameters: Type.Object({
      query: Type.String({ description: "Search query" }),
      maxResults: Type.Optional(
        Type.Number({ default: 5, minimum: 1, maximum: 20 }),
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      // Use a simple search approach — in production this would use an API key
      // For now, fall back to fetching DuckDuckGo HTML results
      try {
        const encodedQuery = encodeURIComponent(params.query);
        // Try SearXNG public instance first (open source, no API key needed)
        const instances = [
          "https://search.sapti.me",
          "https://searx.tiekoeter.com",
          "https://searx.be",
        ];

        for (const base of instances) {
          try {
            const url =
              `${base}/search?q=${encodedQuery}&format=json&language=en`;
            const response = await fetch(url, {
              signal: AbortSignal.timeout(5000),
            });
            if (!response.ok) continue;

            const data = (await response.json()) as any;
            const results = (data.results || []).slice(
              0,
              params.maxResults || 5,
            );

            if (results.length === 0) continue;

            const formatted = results.map((r: any, i: number) =>
              `${i + 1}. ${r.title}\n   ${
                (r.content as string)?.slice(0, 200)
              }\n   ${r.url}`
            ).join("\n\n");

            return {
              content: [{ type: "text", text: formatted }],
              details: {},
            };
          } catch {
            continue; // try next instance
          }
        }

        return {
          content: [{
            type: "text",
            text:
              "Web search unavailable — all instances failed. Try WebFetch for direct URL access.",
          }],
          details: {},
        };
      } catch (err) {
        return {
          content: [{
            type: "text",
            text: `Web search failed: ${(err as Error).message}`,
          }],
          isError: true,
          details: {},
        };
      }
    },
  });
}
