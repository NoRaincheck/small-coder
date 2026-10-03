import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadSkillsFromDir } from "@earendil-works/pi-coding-agent";
import {
  type SkillCategory,
  skillsRoot,
} from "../extensions/_shared/resources.ts";

// Loads the bundled cards through pi's own loader so the assertions come from
// pi's validator, not a reimplementation of it that could drift.

const CATEGORIES: SkillCategory[] = ["tools", "knowledge", "protocols"];

describe("pi loads our cards without diagnostics", () => {
  for (const category of CATEGORIES) {
    it(`${category}/ produces no warnings`, () => {
      const { skills, diagnostics } = loadSkillsFromDir({
        dir: join(skillsRoot(), category),
        source: "small-coder",
      });

      expect(
        diagnostics.map((d) => `${d.path?.split("/").pop()}: ${d.message}`),
      ).toEqual([]);
      expect(skills).toHaveLength(
        readdirSync(join(skillsRoot(), category)).length,
      );
    });
  }

  it("every card carries the name, description and disable flag", () => {
    for (const category of CATEGORIES) {
      const { skills } = loadSkillsFromDir({
        dir: join(skillsRoot(), category),
        source: "small-coder",
      });
      for (const skill of skills) {
        expect(skill.name, skill.filePath).toBeTruthy();
        expect(skill.description, skill.filePath).toBeTruthy();
        // Keeps pi from also advertising the card for on-demand `read`.
        expect(skill.disableModelInvocation, skill.filePath).toBe(true);
      }
    }
  });
});
