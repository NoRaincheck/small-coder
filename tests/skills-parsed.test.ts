import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  loadEntries,
  type SkillCategory,
  skillsRoot,
} from "../extensions/_shared/resources.ts";

const CATEGORIES: SkillCategory[] = ["tools", "knowledge", "protocols"];

// The bundled skill files are the fixtures the injectors actually run against,
// so their frontmatter is asserted here rather than only in unit tests. A
// malformed tag list silently disables a card at runtime with no other signal.

const base = skillsRoot();

function filesIn(category: string) {
  const dir = join(base, category);
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => ({ filePath: join(dir, f), baseDir: dir }));
}

describe("bundled skill files", () => {
  it("every category directory resolves from the package root", () => {
    for (const category of CATEGORIES) {
      expect(filesIn(category).length).toBeGreaterThan(0);
    }
  });

  for (const category of CATEGORIES) {
    describe(category, () => {
      const entries = loadEntries(filesIn(category), category);

      it("loads every file in the directory", () => {
        expect(entries).toHaveLength(filesIn(category).length);
      });

      it("has a name, description and tags on every card", () => {
        for (const entry of entries) {
          const name = entry.filePath.split("/").pop();
          expect(entry.frontmatter.name, `${name} name`).toBeTruthy();
          expect(entry.frontmatter.description, `${name} description`)
            .toBeTruthy();
          expect(
            (entry.frontmatter.tags ?? []).length,
            `${name} tags — error_recovery_tags must not overwrite these`,
          ).toBeGreaterThan(0);
        }
      });

      it("keeps error_recovery_tags separate from tags", () => {
        for (const entry of entries) {
          const name = entry.filePath.split("/").pop();
          const tags = entry.frontmatter.tags ?? [];
          const errTags = entry.frontmatter.errorRecoveryTags ?? [];
          for (const t of errTags) {
            expect(tags, `${name}: "${t}" leaked into tags`).not.toContain(t);
          }
        }
      });

      it("has a non-empty body on every card", () => {
        for (const entry of entries) {
          expect(
            entry.body.trim().length,
            `${entry.filePath} body`,
          ).toBeGreaterThan(0);
        }
      });
    });
  }

  // pi renders an <available_skills> index for every card it discovers and
  // tells the model to `read` the file on demand. small-coder injects the same
  // bodies eagerly, so without this flag every card is delivered twice.
  it("sets disable-model-invocation on every card", () => {
    for (const category of CATEGORIES) {
      for (const file of filesIn(category)) {
        const raw = readFileSync(file.filePath, "utf-8");
        expect(
          raw,
          `${category}/${file.filePath.split("/").pop()} is missing ` +
            "disable-model-invocation: true — pi would double-inject this card",
        ).toMatch(/^disable-model-invocation:\s*true$/m);
      }
    }
  });

  // Mirrors pi's validateName (core/skills.js): a non-slug name makes pi emit
  // an "invalid characters" diagnostic for every card on every load.
  it("uses a slug name pi will accept", () => {
    for (const category of CATEGORIES) {
      for (const file of filesIn(category)) {
        const { name } = loadEntries([file], category)[0]!.frontmatter;
        const where = `${category}/${file.filePath.split("/").pop()}`;
        expect(name, `${where} has no name`).toBeTruthy();
        expect(name!, `${where}: "${name}" has non-slug characters`)
          .toMatch(/^[a-z0-9-]+$/);
        expect(name!.length, `${where}: name exceeds 64 chars`)
          .toBeLessThanOrEqual(64);
        expect(name!.startsWith("-"), `${where}: leading hyphen`).toBe(false);
        expect(name!.endsWith("-"), `${where}: trailing hyphen`).toBe(false);
        expect(name!.includes("--"), `${where}: consecutive hyphens`).toBe(
          false,
        );
      }
    }
  });

  it("declares a readable title on every card", () => {
    for (const category of CATEGORIES) {
      for (const entry of loadEntries(filesIn(category), category)) {
        expect(
          entry.frontmatter.title,
          `${entry.filePath} needs a title — its name "${entry.frontmatter.name}" ` +
            "is a slug and would be rendered as the card heading",
        ).toBeTruthy();
        expect(entry.frontmatter.title!.trim()).not.toBe("");
      }
    }
  });

  it("titles are single-line so they cannot break card rendering", () => {
    for (const category of CATEGORIES) {
      for (const entry of loadEntries(filesIn(category), category)) {
        expect(
          entry.frontmatter.title,
          `${entry.filePath} title contains a newline`,
        ).not.toMatch(/[\r\n]/);
      }
    }
  });
});
