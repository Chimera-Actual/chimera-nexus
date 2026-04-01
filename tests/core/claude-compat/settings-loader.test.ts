/**
 * @file Unit tests for SettingsLoader.
 */

import { Vault } from "obsidian";
import { SettingsLoader } from "../../../src/core/claude-compat/settings-loader";
import { HookEvent } from "../../../src/core/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal Vault mock with controllable adapter behaviour. */
function makeVault(options: {
  exists?: boolean;
  content?: string;
}): Vault {
  // Construct a plain object that satisfies the Vault interface used by
  // SettingsLoader (adapter.exists + adapter.read) without instantiating the
  // mock Vault class, which triggers an infinite-recursion bug via TFile ->
  // Vault -> TFile in the mock module.
  return {
    adapter: {
      exists: jest.fn().mockResolvedValue(options.exists ?? false),
      read: jest.fn().mockResolvedValue(options.content ?? ""),
      write: jest.fn().mockResolvedValue(undefined),
      mkdir: jest.fn().mockResolvedValue(undefined),
      list: jest.fn().mockResolvedValue({ files: [], folders: [] }),
    },
  } as unknown as Vault;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SettingsLoader", () => {
  // ── 1. Empty defaults when no settings file exists ────────────────────────

  describe("when no settings file exists", () => {
    it("returns empty defaults", async () => {
      const vault = makeVault({ exists: false });
      const loader = new SettingsLoader(vault);

      const settings = await loader.loadSettings();

      expect(settings.permissions.allow).toEqual([]);
      expect(settings.permissions.deny).toEqual([]);
      expect(settings.permissions.ask).toEqual([]);
      expect(settings.hooks).toEqual([]);
      expect(settings.env).toEqual({});
      expect(settings.mcpServers).toEqual({});
    });

    it("does not attempt to read the file", async () => {
      const vault = makeVault({ exists: false });
      const loader = new SettingsLoader(vault);

      await loader.loadSettings();

      expect(vault.adapter.read).not.toHaveBeenCalled();
    });
  });

  // ── 2. Reads and parses project settings correctly ────────────────────────

  describe("when project settings file exists", () => {
    it("parses permissions from settings.json", async () => {
      const content = JSON.stringify({
        permissions: {
          allow: ["Read", "Write"],
          deny: ["Bash"],
          ask: ["Edit"],
        },
      });
      const vault = makeVault({ exists: true, content });
      const loader = new SettingsLoader(vault);

      const settings = await loader.loadSettings();

      expect(settings.permissions.allow).toEqual(["Read", "Write"]);
      expect(settings.permissions.deny).toEqual(["Bash"]);
      expect(settings.permissions.ask).toEqual(["Edit"]);
    });

    it("parses env and mcpServers", async () => {
      const content = JSON.stringify({
        env: { FOO: "bar", BAZ: "qux" },
        mcpServers: { myServer: { url: "http://localhost:3000" } },
      });
      const vault = makeVault({ exists: true, content });
      const loader = new SettingsLoader(vault);

      const settings = await loader.loadSettings();

      expect(settings.env).toEqual({ FOO: "bar", BAZ: "qux" });
      expect(settings.mcpServers).toEqual({ myServer: { url: "http://localhost:3000" } });
    });

    it("reads from .claude/settings.json", async () => {
      const vault = makeVault({ exists: true, content: "{}" });
      const loader = new SettingsLoader(vault);

      await loader.loadSettings();

      expect(vault.adapter.exists).toHaveBeenCalledWith(".claude/settings.json");
      expect(vault.adapter.read).toHaveBeenCalledWith(".claude/settings.json");
    });
  });

  // ── 3. Deny always wins ───────────────────────────────────────────────────

  describe("deny-always-wins rule", () => {
    it("removes a tool from allow when it is also in deny", async () => {
      const content = JSON.stringify({
        permissions: {
          allow: ["Read", "Bash"],
          deny: ["Bash"],
          ask: [],
        },
      });
      const vault = makeVault({ exists: true, content });
      const loader = new SettingsLoader(vault);

      const settings = await loader.loadSettings();

      expect(settings.permissions.deny).toContain("Bash");
      expect(settings.permissions.allow).not.toContain("Bash");
      expect(settings.permissions.allow).toContain("Read");
    });

    it("removes a tool from ask when it is in deny", async () => {
      const content = JSON.stringify({
        permissions: {
          allow: [],
          deny: ["Edit"],
          ask: ["Edit", "Write"],
        },
      });
      const vault = makeVault({ exists: true, content });
      const loader = new SettingsLoader(vault);

      const settings = await loader.loadSettings();

      expect(settings.permissions.deny).toContain("Edit");
      expect(settings.permissions.ask).not.toContain("Edit");
      expect(settings.permissions.ask).toContain("Write");
    });

    it("keeps a tool in allow that appears only there", async () => {
      const content = JSON.stringify({
        permissions: {
          allow: ["Read"],
          deny: ["Bash"],
          ask: [],
        },
      });
      const vault = makeVault({ exists: true, content });
      const loader = new SettingsLoader(vault);

      const settings = await loader.loadSettings();

      expect(settings.permissions.allow).toContain("Read");
    });
  });

  // ── 4. Arrays merge and deduplicate ──────────────────────────────────────
  // (Merging user + project; user level is currently empty, but the
  //  dedup behaviour is tested by feeding duplicates within project settings.)

  describe("deduplication", () => {
    it("deduplicates allow entries", async () => {
      // Simulate project settings that already have duplicates.
      // We test the internal dedup by providing a file with repeated values.
      const content = JSON.stringify({
        permissions: {
          allow: ["Read", "Write", "Read"],
          deny: [],
          ask: [],
        },
      });
      const vault = makeVault({ exists: true, content });
      const loader = new SettingsLoader(vault);

      const settings = await loader.loadSettings();

      const readCount = settings.permissions.allow.filter((t) => t === "Read").length;
      expect(readCount).toBe(1);
    });

    it("deduplicates deny entries", async () => {
      const content = JSON.stringify({
        permissions: {
          allow: [],
          deny: ["Bash", "Bash"],
          ask: [],
        },
      });
      const vault = makeVault({ exists: true, content });
      const loader = new SettingsLoader(vault);

      const settings = await loader.loadSettings();

      const bashCount = settings.permissions.deny.filter((t) => t === "Bash").length;
      expect(bashCount).toBe(1);
    });

    it("deduplicates ask entries", async () => {
      const content = JSON.stringify({
        permissions: {
          allow: [],
          deny: [],
          ask: ["Edit", "Edit"],
        },
      });
      const vault = makeVault({ exists: true, content });
      const loader = new SettingsLoader(vault);

      const settings = await loader.loadSettings();

      const editCount = settings.permissions.ask.filter((t) => t === "Edit").length;
      expect(editCount).toBe(1);
    });
  });

  // ── 5. Malformed JSON ─────────────────────────────────────────────────────

  describe("when settings.json contains malformed JSON", () => {
    it("returns empty defaults", async () => {
      const vault = makeVault({ exists: true, content: "{ not valid json {{" });
      const loader = new SettingsLoader(vault);

      const settings = await loader.loadSettings();

      expect(settings.permissions.allow).toEqual([]);
      expect(settings.permissions.deny).toEqual([]);
      expect(settings.permissions.ask).toEqual([]);
      expect(settings.hooks).toEqual([]);
    });

    it("logs a warning", async () => {
      const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
      const vault = makeVault({ exists: true, content: "not-json" });
      const loader = new SettingsLoader(vault);

      await loader.loadSettings();

      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });

  // ── 6. Hooks conversion ───────────────────────────────────────────────────

  describe("hooks conversion", () => {
    it("converts a command hook entry to HookDefinition with type=command", async () => {
      const content = JSON.stringify({
        hooks: {
          PreToolUse: [{ matcher: "Bash", command: "echo before" }],
        },
      });
      const vault = makeVault({ exists: true, content });
      const loader = new SettingsLoader(vault);

      const settings = await loader.loadSettings();

      expect(settings.hooks).toHaveLength(1);
      const hook = settings.hooks[0];
      expect(hook.event).toBe(HookEvent.PreToolUse);
      expect(hook.matcher).toBe("Bash");
      expect(hook.handlers).toHaveLength(1);
      expect(hook.handlers[0]).toMatchObject({ type: "command", command: "echo before" });
    });

    it("converts an http (url) hook entry to HookDefinition with type=http", async () => {
      const content = JSON.stringify({
        hooks: {
          PostToolUse: [{ url: "http://localhost:8080/hook" }],
        },
      });
      const vault = makeVault({ exists: true, content });
      const loader = new SettingsLoader(vault);

      const settings = await loader.loadSettings();

      expect(settings.hooks).toHaveLength(1);
      const hook = settings.hooks[0];
      expect(hook.event).toBe(HookEvent.PostToolUse);
      expect(hook.matcher).toBeUndefined();
      expect(hook.handlers[0]).toMatchObject({ type: "http", url: "http://localhost:8080/hook" });
    });

    it("converts a prompt hook entry to HookDefinition with type=prompt", async () => {
      const content = JSON.stringify({
        hooks: {
          UserPromptSubmit: [{ prompt: "Always think step by step." }],
        },
      });
      const vault = makeVault({ exists: true, content });
      const loader = new SettingsLoader(vault);

      const settings = await loader.loadSettings();

      const hook = settings.hooks[0];
      expect(hook.event).toBe(HookEvent.UserPromptSubmit);
      expect(hook.handlers[0]).toMatchObject({ type: "prompt", prompt: "Always think step by step." });
    });

    it("converts an agentName hook entry to HookDefinition with type=agent", async () => {
      const content = JSON.stringify({
        hooks: {
          SessionStart: [{ agentName: "reviewer" }],
        },
      });
      const vault = makeVault({ exists: true, content });
      const loader = new SettingsLoader(vault);

      const settings = await loader.loadSettings();

      const hook = settings.hooks[0];
      expect(hook.event).toBe(HookEvent.SessionStart);
      expect(hook.handlers[0]).toMatchObject({ type: "agent", agentName: "reviewer" });
    });

    it("converts multiple hooks across multiple events", async () => {
      const content = JSON.stringify({
        hooks: {
          PreToolUse: [
            { matcher: "Bash", command: "echo pre" },
            { matcher: "Write", command: "echo pre-write" },
          ],
          PostToolUse: [{ url: "http://example.com" }],
        },
      });
      const vault = makeVault({ exists: true, content });
      const loader = new SettingsLoader(vault);

      const settings = await loader.loadSettings();

      expect(settings.hooks).toHaveLength(3);
      const events = settings.hooks.map((h) => h.event);
      expect(events.filter((e) => e === HookEvent.PreToolUse)).toHaveLength(2);
      expect(events.filter((e) => e === HookEvent.PostToolUse)).toHaveLength(1);
    });

    it("skips hook entries for unknown event names and logs a warning", async () => {
      const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
      const content = JSON.stringify({
        hooks: {
          UnknownEvent: [{ command: "echo oops" }],
          PreToolUse: [{ command: "echo ok" }],
        },
      });
      const vault = makeVault({ exists: true, content });
      const loader = new SettingsLoader(vault);

      const settings = await loader.loadSettings();

      // Only the valid PreToolUse hook should remain
      expect(settings.hooks).toHaveLength(1);
      expect(settings.hooks[0].event).toBe(HookEvent.PreToolUse);
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it("returns an empty hooks array when the file has no hooks key", async () => {
      const content = JSON.stringify({ permissions: { allow: ["Read"] } });
      const vault = makeVault({ exists: true, content });
      const loader = new SettingsLoader(vault);

      const settings = await loader.loadSettings();

      expect(settings.hooks).toEqual([]);
    });
  });
});
