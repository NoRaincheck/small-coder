import { describe, expect, it } from "vitest";
import { normalizeWritePath } from "../extensions/write-guard/index.ts";

describe("normalizeWritePath", () => {
  const cwd = "/home/me/proj";

  it("rewrites dropped-slash macOS home paths to /Users/", () => {
    expect(normalizeWritePath("Users/foo.md", cwd)).toEqual({
      path: "/Users/foo.md",
      rewrittenFrom: "Users/foo.md",
    });
  });

  it("rewrites nested Users paths instead of creating a Users/ folder in cwd", () => {
    expect(
      normalizeWritePath("Users/crn/dev/git/small-coder/deno.json", cwd),
    ).toEqual({
      path: "/Users/crn/dev/git/small-coder/deno.json",
      rewrittenFrom: "Users/crn/dev/git/small-coder/deno.json",
    });
  });

  it("rewrites a bare Users to /Users", () => {
    expect(normalizeWritePath("Users", cwd)).toEqual({
      path: "/Users",
      rewrittenFrom: "Users",
    });
  });

  it("resolves plain relative paths against cwd", () => {
    expect(normalizeWritePath("src/a.ts", cwd)).toEqual({
      path: "/home/me/proj/src/a.ts",
    });
  });

  it("resolves root-bare paths against cwd", () => {
    expect(normalizeWritePath("/foo.md", cwd)).toEqual({
      path: "/home/me/proj/foo.md",
      rewrittenFrom: "/foo.md",
    });
  });

  it("leaves genuine absolute paths untouched", () => {
    expect(normalizeWritePath("/Users/foo.md", cwd)).toEqual({
      path: "/Users/foo.md",
    });
  });

  it("does not hijack paths whose first segment merely starts with Users", () => {
    expect(normalizeWritePath("Usersfoo/bar.md", cwd)).toEqual({
      path: "/home/me/proj/Usersfoo/bar.md",
    });
  });

  it("keeps lowercase users/ paths cwd-relative", () => {
    expect(normalizeWritePath("users/foo.md", cwd)).toEqual({
      path: "/home/me/proj/users/foo.md",
    });
  });
});
