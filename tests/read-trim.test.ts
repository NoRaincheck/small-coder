import { describe, expect, it } from "vitest";
import { planReadTrim } from "../extensions/read-guard/trim.ts";

describe("planReadTrim", () => {
  it("leaves small content alone", () => {
    expect(planReadTrim("short", { maxChars: 100 })).toBeUndefined();
  });

  it("leaves content exactly at the budget alone", () => {
    const text = "x".repeat(100);
    expect(planReadTrim(text, { maxChars: 100 })).toBeUndefined();
  });

  it("never trims when the model asked for a bounded range", () => {
    const text = "x".repeat(100_000);
    expect(planReadTrim(text, { maxChars: 100, explicitRange: true }))
      .toBeUndefined();
  });

  it("never double-trims what pi already truncated", () => {
    const text = "x".repeat(100_000);
    expect(planReadTrim(text, { maxChars: 100, alreadyTruncated: true }))
      .toBeUndefined();
  });

  it("trims to roughly the budget, keeping head and tail", () => {
    const head = "H".repeat(70);
    const tail = "T".repeat(30);
    const out = planReadTrim(head + "M".repeat(5000) + tail, { maxChars: 100 });
    expect(out).toBeDefined();
    expect(out!.startsWith("H".repeat(70))).toBe(true);
    expect(out!.endsWith("T".repeat(30))).toBe(true);
  });

  it("reports how much was omitted", () => {
    const text = "A".repeat(60) + "B".repeat(440) + "C".repeat(60);
    const out = planReadTrim(text, { maxChars: 100 })!;
    const match = out.match(/\[\.\.\. (\d+) chars omitted/);
    expect(match).not.toBeNull();
    expect(Number(match![1])).toBe(text.length - 100);
  });

  it("names the file and gives a concrete retry command", () => {
    const out = planReadTrim("x".repeat(5000), {
      maxChars: 100,
      path: "src/app.ts",
    })!;
    expect(out).toContain("src/app.ts");
    expect(out).toContain('read("src/app.ts", offset=N, limit=M)');
  });

  it("falls back to a generic retry hint with no path", () => {
    const out = planReadTrim("x".repeat(5000), { maxChars: 100 })!;
    expect(out).toContain("read(path, offset=N, limit=M)");
  });

  it("treats a zero or negative budget as disabled", () => {
    expect(planReadTrim("x".repeat(5000), { maxChars: 0 })).toBeUndefined();
    expect(planReadTrim("x".repeat(5000), { maxChars: -1 })).toBeUndefined();
  });

  it("handles content shorter than twice the budget", () => {
    const out = planReadTrim("y".repeat(150), { maxChars: 100 })!;
    expect(out).toContain("50 chars omitted");
  });
});
