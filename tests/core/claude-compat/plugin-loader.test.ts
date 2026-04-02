/**
 * @file Unit tests for PluginLoader (CC-compatible rewrite).
 */

import { Vault } from "obsidian";
import { PluginLoader } from "../../../src/core/claude-compat/plugin-loader";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockVault(
  fs: Record<string, string | { files: string[]; folders: string[] }>
): Vault {
  return {
    adapter: {
      exists: jest.fn(async (path: string) => path in fs),
      read: jest.fn(async (path: string) => {
        const entry = fs[path];
        if (typeof entry === "string") return entry;
        throw new Error(`Not a file: ${path}`);
      }),
      list: jest.fn(async (path: string) => {
        const entry = fs[path];
        if (typeof entry === "object" && entry !== null && "files" in entry)
          return entry;
        return { files: [], folders: [] };
      }),
    },
  } as unknown as Vault;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("PluginLoader", () => {
  describe("loadPlugins()", () => {
    it("returns empty array when .claude/plugins/ does not exist", async () => {
      const vault = makeMockVault({});
      const loader = new PluginLoader(vault);
      const result = await loader.loadPlugins();
      expect(result).toEqual([]);
    });

    it("reads manifest from .claude-plugin/plugin.json (not root plugin.json)", async () => {
      const vault = makeMockVault({
        ".claude/plugins": { files: [], folders: [".claude/plugins/my-plugin"] },
        ".claude/plugins/my-plugin": {
          files: [],
          folders: [".claude/plugins/my-plugin/.claude-plugin"],
        },
        ".claude/plugins/my-plugin/.claude-plugin": {
          files: [".claude/plugins/my-plugin/.claude-plugin/plugin.json"],
          folders: [],
        },
        ".claude/plugins/my-plugin/.claude-plugin/plugin.json": JSON.stringify({
          name: "my-plugin",
          version: "1.0.0",
          description: "A test plugin",
        }),
      });

      const loader = new PluginLoader(vault);
      const result = await loader.loadPlugins();

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("my-plugin");
      expect(result[0].version).toBe("1.0.0");
      expect(result[0].description).toBe("A test plugin");
    });

    it("populates installPath on each manifest", async () => {
      const vault = makeMockVault({
        ".claude/plugins": { files: [], folders: [".claude/plugins/my-plugin"] },
        ".claude/plugins/my-plugin": {
          files: [],
          folders: [".claude/plugins/my-plugin/.claude-plugin"],
        },
        ".claude/plugins/my-plugin/.claude-plugin": {
          files: [".claude/plugins/my-plugin/.claude-plugin/plugin.json"],
          folders: [],
        },
        ".claude/plugins/my-plugin/.claude-plugin/plugin.json": JSON.stringify({
          name: "my-plugin",
        }),
      });

      const loader = new PluginLoader(vault);
      const result = await loader.loadPlugins();

      expect(result).toHaveLength(1);
      expect(result[0].installPath).toBe(".claude/plugins/my-plugin");
    });

    it("falls back to auto-discovery when no manifest exists", async () => {
      const vault = makeMockVault({
        ".claude/plugins": {
          files: [],
          folders: [".claude/plugins/auto-plugin"],
        },
        ".claude/plugins/auto-plugin": {
          files: [],
          folders: [".claude/plugins/auto-plugin/skills"],
        },
        // no .claude-plugin/plugin.json
        ".claude/plugins/auto-plugin/skills": {
          files: [],
          folders: [".claude/plugins/auto-plugin/skills/my-skill"],
        },
        ".claude/plugins/auto-plugin/skills/my-skill": {
          files: [".claude/plugins/auto-plugin/skills/my-skill/SKILL.md"],
          folders: [],
        },
        // SKILL.md must be a key so exists() returns true
        ".claude/plugins/auto-plugin/skills/my-skill/SKILL.md": "# My Skill\n",
      });

      const loader = new PluginLoader(vault);
      const result = await loader.loadPlugins();

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("auto-plugin");
      expect(result[0].installPath).toBe(".claude/plugins/auto-plugin");
    });

    it("auto-discovers skills from skills/ directory (subdirs with SKILL.md)", async () => {
      const vault = makeMockVault({
        ".claude/plugins": {
          files: [],
          folders: [".claude/plugins/skill-plugin"],
        },
        ".claude/plugins/skill-plugin": {
          files: [],
          folders: [
            ".claude/plugins/skill-plugin/.claude-plugin",
            ".claude/plugins/skill-plugin/skills",
          ],
        },
        ".claude/plugins/skill-plugin/.claude-plugin": {
          files: [".claude/plugins/skill-plugin/.claude-plugin/plugin.json"],
          folders: [],
        },
        ".claude/plugins/skill-plugin/.claude-plugin/plugin.json": JSON.stringify({
          name: "skill-plugin",
        }),
        ".claude/plugins/skill-plugin/skills": {
          files: [],
          folders: [
            ".claude/plugins/skill-plugin/skills/tool-a",
            ".claude/plugins/skill-plugin/skills/tool-b",
          ],
        },
        ".claude/plugins/skill-plugin/skills/tool-a": {
          files: [".claude/plugins/skill-plugin/skills/tool-a/SKILL.md"],
          folders: [],
        },
        // SKILL.md must be a key so exists() returns true
        ".claude/plugins/skill-plugin/skills/tool-a/SKILL.md": "# Tool A\n",
        ".claude/plugins/skill-plugin/skills/tool-b": {
          files: [],
          folders: [],
        },
        // tool-b has no SKILL.md - should not appear
      });

      const loader = new PluginLoader(vault);
      const result = await loader.loadPlugins();

      expect(result).toHaveLength(1);
      expect(result[0].discoveredSkills).toEqual(["skills/tool-a"]);
    });

    it("auto-discovers agents from agents/ directory (.md files)", async () => {
      const vault = makeMockVault({
        ".claude/plugins": {
          files: [],
          folders: [".claude/plugins/agent-plugin"],
        },
        ".claude/plugins/agent-plugin": {
          files: [],
          folders: [
            ".claude/plugins/agent-plugin/.claude-plugin",
            ".claude/plugins/agent-plugin/agents",
          ],
        },
        ".claude/plugins/agent-plugin/.claude-plugin": {
          files: [".claude/plugins/agent-plugin/.claude-plugin/plugin.json"],
          folders: [],
        },
        ".claude/plugins/agent-plugin/.claude-plugin/plugin.json": JSON.stringify({
          name: "agent-plugin",
        }),
        ".claude/plugins/agent-plugin/agents": {
          files: [
            ".claude/plugins/agent-plugin/agents/helper.md",
            ".claude/plugins/agent-plugin/agents/README.txt",
          ],
          folders: [],
        },
      });

      const loader = new PluginLoader(vault);
      const result = await loader.loadPlugins();

      expect(result).toHaveLength(1);
      // Only .md files should appear
      expect(result[0].discoveredAgents).toEqual(["agents/helper.md"]);
    });

    it("skips directories with invalid JSON", async () => {
      const vault = makeMockVault({
        ".claude/plugins": {
          files: [],
          folders: [
            ".claude/plugins/bad-json",
            ".claude/plugins/good-plugin",
          ],
        },
        ".claude/plugins/bad-json": {
          files: [],
          folders: [".claude/plugins/bad-json/.claude-plugin"],
        },
        ".claude/plugins/bad-json/.claude-plugin": {
          files: [".claude/plugins/bad-json/.claude-plugin/plugin.json"],
          folders: [],
        },
        ".claude/plugins/bad-json/.claude-plugin/plugin.json":
          "{ this is not valid JSON }",
        ".claude/plugins/good-plugin": {
          files: [],
          folders: [".claude/plugins/good-plugin/.claude-plugin"],
        },
        ".claude/plugins/good-plugin/.claude-plugin": {
          files: [".claude/plugins/good-plugin/.claude-plugin/plugin.json"],
          folders: [],
        },
        ".claude/plugins/good-plugin/.claude-plugin/plugin.json": JSON.stringify({
          name: "good-plugin",
        }),
      });

      const loader = new PluginLoader(vault);
      const result = await loader.loadPlugins();

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("good-plugin");
    });

    it("skips directories where manifest has no name field", async () => {
      const vault = makeMockVault({
        ".claude/plugins": {
          files: [],
          folders: [".claude/plugins/no-name-plugin"],
        },
        ".claude/plugins/no-name-plugin": {
          files: [],
          folders: [".claude/plugins/no-name-plugin/.claude-plugin"],
        },
        ".claude/plugins/no-name-plugin/.claude-plugin": {
          files: [".claude/plugins/no-name-plugin/.claude-plugin/plugin.json"],
          folders: [],
        },
        ".claude/plugins/no-name-plugin/.claude-plugin/plugin.json": JSON.stringify({
          version: "1.0.0",
          description: "No name provided",
        }),
      });

      const loader = new PluginLoader(vault);
      const result = await loader.loadPlugins();

      expect(result).toEqual([]);
    });

    it("parses userConfig from manifest", async () => {
      const vault = makeMockVault({
        ".claude/plugins": {
          files: [],
          folders: [".claude/plugins/config-plugin"],
        },
        ".claude/plugins/config-plugin": {
          files: [],
          folders: [".claude/plugins/config-plugin/.claude-plugin"],
        },
        ".claude/plugins/config-plugin/.claude-plugin": {
          files: [".claude/plugins/config-plugin/.claude-plugin/plugin.json"],
          folders: [],
        },
        ".claude/plugins/config-plugin/.claude-plugin/plugin.json": JSON.stringify({
          name: "config-plugin",
          userConfig: {
            apiKey: {
              description: "The API key for this service",
              sensitive: true,
            },
            region: {
              description: "AWS region",
              sensitive: false,
            },
          },
        }),
      });

      const loader = new PluginLoader(vault);
      const result = await loader.loadPlugins();

      expect(result).toHaveLength(1);
      expect(result[0].userConfig).toEqual({
        apiKey: { description: "The API key for this service", sensitive: true },
        region: { description: "AWS region", sensitive: false },
      });
    });

    it("parses mcpServers from manifest", async () => {
      const mcpServers = {
        "my-mcp": {
          command: "npx",
          args: ["-y", "my-mcp-server"],
        },
      };

      const vault = makeMockVault({
        ".claude/plugins": {
          files: [],
          folders: [".claude/plugins/mcp-plugin"],
        },
        ".claude/plugins/mcp-plugin": {
          files: [],
          folders: [".claude/plugins/mcp-plugin/.claude-plugin"],
        },
        ".claude/plugins/mcp-plugin/.claude-plugin": {
          files: [".claude/plugins/mcp-plugin/.claude-plugin/plugin.json"],
          folders: [],
        },
        ".claude/plugins/mcp-plugin/.claude-plugin/plugin.json": JSON.stringify({
          name: "mcp-plugin",
          mcpServers,
        }),
      });

      const loader = new PluginLoader(vault);
      const result = await loader.loadPlugins();

      expect(result).toHaveLength(1);
      expect(result[0].mcpServers).toEqual(mcpServers);
    });

    it("parses all manifest fields: version, author, homepage, repository, license, keywords", async () => {
      const manifest = {
        name: "full-manifest-plugin",
        version: "2.1.0",
        description: "A fully specified plugin",
        author: { name: "Test Author", email: "test@example.com" },
        homepage: "https://example.com",
        repository: "https://github.com/example/plugin",
        license: "MIT",
        keywords: ["test", "example"],
        settings: { theme: "dark" },
      };

      const vault = makeMockVault({
        ".claude/plugins": {
          files: [],
          folders: [".claude/plugins/full-manifest-plugin"],
        },
        ".claude/plugins/full-manifest-plugin": {
          files: [],
          folders: [".claude/plugins/full-manifest-plugin/.claude-plugin"],
        },
        ".claude/plugins/full-manifest-plugin/.claude-plugin": {
          files: [
            ".claude/plugins/full-manifest-plugin/.claude-plugin/plugin.json",
          ],
          folders: [],
        },
        ".claude/plugins/full-manifest-plugin/.claude-plugin/plugin.json":
          JSON.stringify(manifest),
      });

      const loader = new PluginLoader(vault);
      const result = await loader.loadPlugins();

      expect(result).toHaveLength(1);
      const m = result[0];
      expect(m.name).toBe("full-manifest-plugin");
      expect(m.version).toBe("2.1.0");
      expect(m.description).toBe("A fully specified plugin");
      expect(m.author).toEqual({ name: "Test Author", email: "test@example.com" });
      expect(m.homepage).toBe("https://example.com");
      expect(m.repository).toBe("https://github.com/example/plugin");
      expect(m.license).toBe("MIT");
      expect(m.keywords).toEqual(["test", "example"]);
      expect(m.settings).toEqual({ theme: "dark" });
    });

    it("supports custom skills path in manifest", async () => {
      const vault = makeMockVault({
        ".claude/plugins": {
          files: [],
          folders: [".claude/plugins/custom-path-plugin"],
        },
        ".claude/plugins/custom-path-plugin": {
          files: [],
          folders: [
            ".claude/plugins/custom-path-plugin/.claude-plugin",
            ".claude/plugins/custom-path-plugin/custom/skills",
          ],
        },
        ".claude/plugins/custom-path-plugin/.claude-plugin": {
          files: [
            ".claude/plugins/custom-path-plugin/.claude-plugin/plugin.json",
          ],
          folders: [],
        },
        ".claude/plugins/custom-path-plugin/.claude-plugin/plugin.json":
          JSON.stringify({
            name: "custom-path-plugin",
            skills: "./custom/skills/",
          }),
        ".claude/plugins/custom-path-plugin/custom/skills": {
          files: [],
          folders: [
            ".claude/plugins/custom-path-plugin/custom/skills/my-tool",
          ],
        },
        ".claude/plugins/custom-path-plugin/custom/skills/my-tool": {
          files: [
            ".claude/plugins/custom-path-plugin/custom/skills/my-tool/SKILL.md",
          ],
          folders: [],
        },
        // SKILL.md must be a key so exists() returns true
        ".claude/plugins/custom-path-plugin/custom/skills/my-tool/SKILL.md": "# My Tool\n",
      });

      const loader = new PluginLoader(vault);
      const result = await loader.loadPlugins();

      expect(result).toHaveLength(1);
      expect(result[0].discoveredSkills).toEqual(["custom/skills/my-tool"]);
    });
  });

  describe("getPlugin()", () => {
    it("finds a plugin by name", async () => {
      const vault = makeMockVault({
        ".claude/plugins": {
          files: [],
          folders: [
            ".claude/plugins/plugin-a",
            ".claude/plugins/plugin-b",
          ],
        },
        ".claude/plugins/plugin-a": {
          files: [],
          folders: [".claude/plugins/plugin-a/.claude-plugin"],
        },
        ".claude/plugins/plugin-a/.claude-plugin": {
          files: [".claude/plugins/plugin-a/.claude-plugin/plugin.json"],
          folders: [],
        },
        ".claude/plugins/plugin-a/.claude-plugin/plugin.json": JSON.stringify({
          name: "plugin-a",
        }),
        ".claude/plugins/plugin-b": {
          files: [],
          folders: [".claude/plugins/plugin-b/.claude-plugin"],
        },
        ".claude/plugins/plugin-b/.claude-plugin": {
          files: [".claude/plugins/plugin-b/.claude-plugin/plugin.json"],
          folders: [],
        },
        ".claude/plugins/plugin-b/.claude-plugin/plugin.json": JSON.stringify({
          name: "plugin-b",
        }),
      });

      const loader = new PluginLoader(vault);
      const result = await loader.getPlugin("plugin-b");

      expect(result).toBeDefined();
      expect(result?.name).toBe("plugin-b");
    });

    it("returns undefined for a missing plugin", async () => {
      const vault = makeMockVault({
        ".claude/plugins": {
          files: [],
          folders: [".claude/plugins/plugin-a"],
        },
        ".claude/plugins/plugin-a": {
          files: [],
          folders: [".claude/plugins/plugin-a/.claude-plugin"],
        },
        ".claude/plugins/plugin-a/.claude-plugin": {
          files: [".claude/plugins/plugin-a/.claude-plugin/plugin.json"],
          folders: [],
        },
        ".claude/plugins/plugin-a/.claude-plugin/plugin.json": JSON.stringify({
          name: "plugin-a",
        }),
      });

      const loader = new PluginLoader(vault);
      const result = await loader.getPlugin("does-not-exist");

      expect(result).toBeUndefined();
    });
  });
});
