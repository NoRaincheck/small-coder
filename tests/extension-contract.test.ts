import { describe, expect, it } from "vitest";
import type {
  BeforeAgentStartEvent,
  ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import skillInject, { renderCards } from "../extensions/skill-inject/index.ts";
import knowledgeInject from "../extensions/knowledge-inject/index.ts";
import {
  categorize,
  resetSkillRootsForTesting,
  skillsRoot,
} from "../extensions/_shared/resources.ts";
import { join } from "node:path";

// Contract tests for pi's extension event contract.
//
// pi's runner (core/extensions/runner.js) builds a *fresh* event object per
// handler and propagates only the handler's **return value**: in-place
// mutation of `event.systemPrompt` or `event.content` is silently discarded.
// These tests exist because three extensions shipped that did exactly that,
// and because the unit tests around them all passed anyway.

type Handler = (event: unknown, ctx: unknown) => unknown;

function fakePi() {
  const handlers = new Map<string, Handler[]>();
  const api = {
    on(event: string, handler: Handler) {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
    },
    sendUserMessage() {},
  } as unknown as ExtensionAPI;
  return { api, handlers };
}

async function fire(
  handlers: Map<string, Handler[]>,
  event: string,
  payload: unknown,
): Promise<unknown[]> {
  const results: unknown[] = [];
  for (const handler of handlers.get(event) ?? []) {
    results.push(await handler(payload, {}));
  }
  return results;
}

function agentStartEvent(
  systemPrompt: string,
  skills: { filePath: string; baseDir: string }[],
): BeforeAgentStartEvent {
  return {
    type: "before_agent_start",
    prompt: "read the file, then grep to search it",
    systemPrompt,
    systemPromptOptions: { cwd: process.cwd(), skills },
  } as unknown as BeforeAgentStartEvent;
}

const base = skillsRoot();
const TOOL_SKILLS = [
  { filePath: join(base, "tools", "read.md"), baseDir: join(base, "tools") },
  { filePath: join(base, "tools", "bash.md"), baseDir: join(base, "tools") },
  { filePath: join(base, "tools", "grep.md"), baseDir: join(base, "tools") },
];
const KNOWLEDGE_SKILLS = [
  {
    filePath: join(base, "knowledge", "two-pointers.md"),
    baseDir: join(base, "knowledge"),
  },
  {
    filePath: join(base, "knowledge", "binary-search.md"),
    baseDir: join(base, "knowledge"),
  },
];

describe("categorize", () => {
  it("maps known category directories", () => {
    expect(categorize("/pkg/skills/tools")).toBe("tools");
    expect(categorize("/pkg/skills/knowledge")).toBe("knowledge");
    expect(categorize("/pkg/skills/protocols")).toBe("protocols");
  });

  it("returns null for anything else", () => {
    expect(categorize("/pkg/skills")).toBeNull();
    expect(categorize("/home/me/.pi/skills")).toBeNull();
  });

  it("handles Windows separators", () => {
    expect(categorize("C:\\pkg\\skills\\tools")).toBe("tools");
  });
});

describe("skill-inject before_agent_start contract", () => {
  it("returns a new systemPrompt that chains onto the incoming one", async () => {
    resetSkillRootsForTesting();
    const { api, handlers } = fakePi();
    skillInject(api);

    const [result] = await fire(
      handlers,
      "before_agent_start",
      agentStartEvent("BASE-PROMPT", TOOL_SKILLS),
    ) as { systemPrompt?: string }[];

    expect(result?.systemPrompt).toBeDefined();
    expect(result?.systemPrompt?.startsWith("BASE-PROMPT")).toBe(true);
    expect(result?.systemPrompt).toContain("## Tool Usage Guidance");
  });

  it("does not mutate the event in place", async () => {
    resetSkillRootsForTesting();
    const { api, handlers } = fakePi();
    skillInject(api);

    const event = agentStartEvent("BASE-PROMPT", TOOL_SKILLS);
    await fire(handlers, "before_agent_start", event);

    // pi discards in-place mutation, so this must be untouched.
    expect(event.systemPrompt).toBe("BASE-PROMPT");
  });

  it("returns undefined when there are no skills at all", async () => {
    resetSkillRootsForTesting();
    const { api, handlers } = fakePi();
    skillInject(api);

    const results = await fire(
      handlers,
      "before_agent_start",
      agentStartEvent("BASE-PROMPT", []),
    );
    expect(results[0]).toBeUndefined();
  });

  it("emits a single Tool Usage Guidance header for multiple cards", async () => {
    const cards = renderCards([
      {
        filePath: "/x/a.md",
        category: "tools",
        frontmatter: { name: "Alpha" },
        body: "body a",
      },
      {
        filePath: "/x/b.md",
        category: "tools",
        frontmatter: { name: "Beta" },
        body: "body b",
      },
    ]);
    expect(cards.match(/## Tool Usage Guidance/g)).toHaveLength(1);
    expect(cards).toContain("### Alpha");
    expect(cards).toContain("### Beta");
  });

  it("registers its skill roots exactly once even if two extensions load", async () => {
    resetSkillRootsForTesting();
    const { api, handlers } = fakePi();
    skillInject(api);
    knowledgeInject(api);

    const results = await fire(handlers, "resources_discover", {
      type: "resources_discover",
      cwd: process.cwd(),
      reason: "startup",
    }) as { skillPaths?: string[] }[];

    expect(results).toHaveLength(1);
    expect(results[0]?.skillPaths).toHaveLength(3);
    expect(results[0]?.skillPaths?.every((p) => p.startsWith(base))).toBe(true);
  });
});

describe("knowledge-inject before_agent_start contract", () => {
  it("returns a chained systemPrompt and leaves the event untouched", async () => {
    resetSkillRootsForTesting();
    const { api, handlers } = fakePi();
    knowledgeInject(api);

    const event = agentStartEvent("BASE-PROMPT", KNOWLEDGE_SKILLS);
    const [result] = await fire(handlers, "before_agent_start", event) as {
      systemPrompt?: string;
    }[];

    expect(result?.systemPrompt?.startsWith("BASE-PROMPT")).toBe(true);
    expect(event.systemPrompt).toBe("BASE-PROMPT");
  });

  it("both injectors compose instead of clobbering each other", async () => {
    resetSkillRootsForTesting();
    const { api, handlers } = fakePi();
    skillInject(api);
    knowledgeInject(api);

    const event = agentStartEvent("BASE-PROMPT", [
      ...TOOL_SKILLS,
      ...KNOWLEDGE_SKILLS,
    ]);
    // pi feeds each handler the running value, exactly as runner.js does.
    let current = event.systemPrompt;
    for (const handler of handlers.get("before_agent_start") ?? []) {
      const out = await handler(
        { ...event, systemPrompt: current },
        {},
      ) as { systemPrompt?: string } | undefined;
      if (out?.systemPrompt !== undefined) current = out.systemPrompt;
    }

    expect(current.startsWith("BASE-PROMPT")).toBe(true);
    expect(current).toContain("## Tool Usage Guidance");
    expect(current).toContain("## Algorithm Reference");
  });
});
