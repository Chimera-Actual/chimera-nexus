/**
 * @file Integration tests for PluginCommandHandler.
 *
 * Exercises the /plugin command handler through its public execute() method
 * using mock vaults and mock settings.
 */

import { Vault } from "obsidian";
import { PluginCommandHandler } from "../../../src/commands/plugin-command";
import { DEFAULT_SETTINGS } from "../../../src/core/types";

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
      mkdir: jest.fn(async () => undefined),
    },
  } as unknown as Vault;
}

function makeContext(vault: Vault) {
  return {
    vault,
    settings: { ...DEFAULT_SETTINGS },
    addChatMessage: jest.fn(),
    saveSettings: jest.fn(async () => undefined),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("PluginCommandHandler", () => {
  describe("list (empty directory)", () => {
    it("returns 'No plugins' message when directory is empty", async () => {
      const vault = makeMockVault({
        ".claude/plugins": { files: [], folders: [] },
      });
      const handler = new PluginCommandHandler(vault);
      const context = makeContext(vault);

      const result = await handler.execute("", context);

      expect(result).toContain("No plugins");
    });
  });

  describe("list (with installed plugin)", () => {
    it("returns plugin name and version when a manifest is present", async () => {
      const vault = makeMockVault({
        ".claude/plugins": {
          files: [],
          folders: [".claude/plugins/my-plugin"],
        },
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
          version: "1.2.3",
          description: "A test plugin",
        }),
      });
      const handler = new PluginCommandHandler(vault);
      const context = makeContext(vault);

      const result = await handler.execute("", context);

      expect(result).toContain("my-plugin");
      expect(result).toContain("1.2.3");
    });
  });

  describe("unknown subcommand", () => {
    it("returns help text for an unrecognised subcommand", async () => {
      const vault = makeMockVault({});
      const handler = new PluginCommandHandler(vault);
      const context = makeContext(vault);

      const result = await handler.execute("unknown-thing", context);

      // buildHelp() returns a block that contains 'Unknown' is not guaranteed --
      // the handler returns the help block, so check for a known help keyword.
      expect(result).toContain("/plugin");
    });
  });

  describe("validate", () => {
    it("reports valid for a well-formed manifest", async () => {
      const vault = makeMockVault({
        "test-path/.claude-plugin/plugin.json": JSON.stringify({
          name: "test-plugin",
          version: "0.1.0",
        }),
      });
      const handler = new PluginCommandHandler(vault);
      const context = makeContext(vault);

      const result = await handler.execute("validate test-path", context);

      expect(result.toLowerCase()).toContain("valid");
    });

    it("reports missing manifest when the file does not exist", async () => {
      const vault = makeMockVault({});
      const handler = new PluginCommandHandler(vault);
      const context = makeContext(vault);

      const result = await handler.execute("validate nonexistent-path", context);

      expect(result).toContain("No manifest found");
    });
  });

  describe("marketplace list", () => {
    it("lists the default chimera-official marketplace", async () => {
      const vault = makeMockVault({});
      const handler = new PluginCommandHandler(vault);
      const context = makeContext(vault);
      // DEFAULT_SETTINGS includes { "chimera-official": "Chimera-Actual/chimera-marketplace" }

      const result = await handler.execute("marketplace list", context);

      expect(result).toContain("chimera-official");
    });
  });

  describe("marketplace add", () => {
    it("calls saveSettings after adding a new marketplace", async () => {
      const vault = makeMockVault({});
      const handler = new PluginCommandHandler(vault);
      const context = makeContext(vault);

      await handler.execute(
        "marketplace add new-marketplace owner/new-marketplace",
        context
      );

      expect(context.saveSettings).toHaveBeenCalledTimes(1);
    });

    it("adds the marketplace entry to settings", async () => {
      const vault = makeMockVault({});
      const handler = new PluginCommandHandler(vault);
      const context = makeContext(vault);

      await handler.execute(
        "marketplace add my-market MyOrg/my-market",
        context
      );

      expect(context.settings.marketplaces["my-market"]).toBe("MyOrg/my-market");
    });
  });

  describe("install with plugin@marketplace reference", () => {
    it("parses the marketplace name from the reference and mentions it in the response", async () => {
      const vault = makeMockVault({
        // No cached index - will attempt git clone which will fail in test env
        ".claude/plugins": { files: [], folders: [] },
      });
      const handler = new PluginCommandHandler(vault);
      const context = makeContext(vault);

      // Install will fail to fetch the index (no network/git in test), but
      // the reference must be parsed and chimera-official must appear in the
      // response (either as "fetching from chimera-official" or in an error
      // message referencing the marketplace).
      const result = await handler.execute(
        "install my-plugin@chimera-official",
        context
      );

      expect(result).toContain("chimera-official");
    });
  });
});
