/**
 * @file Unit tests for SkillLoader.
 */

import { Vault } from "obsidian";
import { SkillLoader } from "../../../src/core/claude-compat/skill-loader";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockVault(overrides: {
  exists?: jest.Mock;
  read?: jest.Mock;
  list?: jest.Mock;
}): Vault {
  return {
    adapter: {
      exists: overrides.exists ?? jest.fn().mockResolvedValue(false),
      read: overrides.read ?? jest.fn().mockResolvedValue(""),
      list: overrides.list ?? jest.fn().mockResolvedValue({ files: [], folders: [] }),
    },
  } as unknown as Vault;
}

function skillMd(name?: string, description?: string): string {
  const nameLine = name !== undefined ? `name: ${name}\n` : "";
  const descLine = description !== undefined ? `description: ${description}\n` : "";
  const hasFrontmatter = nameLine || descLine;
  if (!hasFrontmatter) {
    return "# No frontmatter here\n";
  }
  return `---\n${nameLine}${descLine}---\n\nFull skill content here (not loaded during discovery)\n`;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SkillLoader", () => {
  describe("loadSkills()", () => {
    it("returns empty array when .claude/skills/ does not exist", async () => {
      const vault = makeMockVault({
        exists: jest.fn().mockResolvedValue(false),
      });
      const loader = new SkillLoader(vault);
      const result = await loader.loadSkills();
      expect(result).toEqual([]);
    });

    it("returns empty array when skills dir exists but contains no folders", async () => {
      const vault = makeMockVault({
        exists: jest.fn().mockResolvedValue(true),
        list: jest.fn().mockResolvedValue({ files: [], folders: [] }),
      });
      const loader = new SkillLoader(vault);
      const result = await loader.loadSkills();
      expect(result).toEqual([]);
    });

    it("discovers a skill with valid SKILL.md frontmatter", async () => {
      const exists = jest.fn().mockImplementation((path: string) => {
        // base dir, SKILL.md exist; scripts/ and references/ do not
        if (path === ".claude/skills") return Promise.resolve(true);
        if (path === ".claude/skills/my-skill/SKILL.md") return Promise.resolve(true);
        return Promise.resolve(false);
      });

      const read = jest.fn().mockResolvedValue(
        skillMd("my-skill", "Does something useful")
      );

      const list = jest.fn().mockResolvedValue({
        files: [],
        folders: [".claude/skills/my-skill"],
      });

      const vault = makeMockVault({ exists, read, list });
      const loader = new SkillLoader(vault);
      const result = await loader.loadSkills();

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        name: "my-skill",
        description: "Does something useful",
        path: ".claude/skills/my-skill",
        hasScripts: false,
        hasReferences: false,
      });
    });

    it("falls back to directory name when frontmatter has no name field", async () => {
      const exists = jest.fn().mockImplementation((path: string) => {
        if (path === ".claude/skills") return Promise.resolve(true);
        if (path === ".claude/skills/unnamed-skill/SKILL.md") return Promise.resolve(true);
        return Promise.resolve(false);
      });

      // SKILL.md has description but no name
      const read = jest.fn().mockResolvedValue(
        "---\ndescription: A skill without a name\n---\n"
      );

      const list = jest.fn().mockResolvedValue({
        files: [],
        folders: [".claude/skills/unnamed-skill"],
      });

      const vault = makeMockVault({ exists, read, list });
      const loader = new SkillLoader(vault);
      const result = await loader.loadSkills();

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("unnamed-skill");
      expect(result[0].description).toBe("A skill without a name");
    });

    it("sets hasScripts when scripts/ subdir exists", async () => {
      const exists = jest.fn().mockImplementation((path: string) => {
        if (path === ".claude/skills") return Promise.resolve(true);
        if (path === ".claude/skills/scripted/SKILL.md") return Promise.resolve(true);
        if (path === ".claude/skills/scripted/scripts") return Promise.resolve(true);
        return Promise.resolve(false);
      });

      const read = jest.fn().mockResolvedValue(skillMd("scripted", "Has scripts"));

      const list = jest.fn().mockResolvedValue({
        files: [],
        folders: [".claude/skills/scripted"],
      });

      const vault = makeMockVault({ exists, read, list });
      const loader = new SkillLoader(vault);
      const result = await loader.loadSkills();

      expect(result).toHaveLength(1);
      expect(result[0].hasScripts).toBe(true);
      expect(result[0].hasReferences).toBe(false);
    });

    it("sets hasReferences when references/ subdir exists", async () => {
      const exists = jest.fn().mockImplementation((path: string) => {
        if (path === ".claude/skills") return Promise.resolve(true);
        if (path === ".claude/skills/ref-skill/SKILL.md") return Promise.resolve(true);
        if (path === ".claude/skills/ref-skill/references") return Promise.resolve(true);
        return Promise.resolve(false);
      });

      const read = jest.fn().mockResolvedValue(skillMd("ref-skill", "Has references"));

      const list = jest.fn().mockResolvedValue({
        files: [],
        folders: [".claude/skills/ref-skill"],
      });

      const vault = makeMockVault({ exists, read, list });
      const loader = new SkillLoader(vault);
      const result = await loader.loadSkills();

      expect(result).toHaveLength(1);
      expect(result[0].hasReferences).toBe(true);
      expect(result[0].hasScripts).toBe(false);
    });

    it("ignores directories without SKILL.md", async () => {
      const exists = jest.fn().mockImplementation((path: string) => {
        if (path === ".claude/skills") return Promise.resolve(true);
        // no SKILL.md in either folder
        return Promise.resolve(false);
      });

      const list = jest.fn().mockResolvedValue({
        files: [],
        folders: [".claude/skills/no-md-here", ".claude/skills/also-no-md"],
      });

      const vault = makeMockVault({ exists, list });
      const loader = new SkillLoader(vault);
      const result = await loader.loadSkills();

      expect(result).toEqual([]);
    });

    it("continues scanning after an individual skill errors", async () => {
      const exists = jest.fn().mockImplementation((path: string) => {
        if (path === ".claude/skills") return Promise.resolve(true);
        if (path === ".claude/skills/good-skill/SKILL.md") return Promise.resolve(true);
        if (path === ".claude/skills/bad-skill/SKILL.md") return Promise.resolve(true);
        return Promise.resolve(false);
      });

      const read = jest.fn().mockImplementation((path: string) => {
        if (path.includes("bad-skill")) return Promise.reject(new Error("disk error"));
        return Promise.resolve(skillMd("good-skill", "Works fine"));
      });

      const list = jest.fn().mockResolvedValue({
        files: [],
        folders: [".claude/skills/bad-skill", ".claude/skills/good-skill"],
      });

      const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

      const vault = makeMockVault({ exists, read, list });
      const loader = new SkillLoader(vault);
      const result = await loader.loadSkills();

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("good-skill");
      expect(warnSpy).toHaveBeenCalled();

      warnSpy.mockRestore();
    });

    it("discovers skills from plugin directories", async () => {
      const vault = makeMockVault({
        exists: jest.fn().mockImplementation(async (path: string) => {
          const paths = [
            ".claude/skills",
            ".claude/plugins",
            ".claude/plugins/my-plugin/skills",
            ".claude/plugins/my-plugin/skills/plugin-skill",
            ".claude/plugins/my-plugin/skills/plugin-skill/SKILL.md",
            ".claude/plugins/my-plugin/.claude-plugin/plugin.json",
          ];
          return paths.includes(path);
        }),
        read: jest.fn().mockImplementation(async (path: string) => {
          if (path.endsWith("SKILL.md")) {
            return "---\nname: plugin-skill\ndescription: From a plugin\n---\n";
          }
          if (path.endsWith("plugin.json")) {
            return JSON.stringify({ name: "my-plugin" });
          }
          return "";
        }),
        list: jest.fn().mockImplementation(async (path: string) => {
          if (path === ".claude/skills") {
            return { files: [], folders: [] };
          }
          if (path === ".claude/plugins") {
            return { files: [], folders: [".claude/plugins/my-plugin"] };
          }
          if (path === ".claude/plugins/my-plugin/skills") {
            return { files: [], folders: [".claude/plugins/my-plugin/skills/plugin-skill"] };
          }
          return { files: [], folders: [] };
        }),
      });

      const loader = new SkillLoader(vault);
      const skills = await loader.loadSkills();
      expect(skills.some((s) => s.name === "my-plugin:plugin-skill")).toBe(true);
    });

    it("sets both hasScripts and hasReferences when both subdirs exist", async () => {
      const exists = jest.fn().mockImplementation((path: string) => {
        if (path === ".claude/skills") return Promise.resolve(true);
        if (path === ".claude/skills/full-skill/SKILL.md") return Promise.resolve(true);
        if (path === ".claude/skills/full-skill/scripts") return Promise.resolve(true);
        if (path === ".claude/skills/full-skill/references") return Promise.resolve(true);
        return Promise.resolve(false);
      });

      const read = jest.fn().mockResolvedValue(skillMd("full-skill", "Complete skill"));

      const list = jest.fn().mockResolvedValue({
        files: [],
        folders: [".claude/skills/full-skill"],
      });

      const vault = makeMockVault({ exists, read, list });
      const loader = new SkillLoader(vault);
      const result = await loader.loadSkills();

      expect(result).toHaveLength(1);
      expect(result[0].hasScripts).toBe(true);
      expect(result[0].hasReferences).toBe(true);
    });
  });
});
