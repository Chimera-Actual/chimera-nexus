/**
 * @file Unit tests for CommandLoader.
 */

import { Vault } from "obsidian";
import { CommandLoader } from "../../../src/core/claude-compat/command-loader";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeVault(options: {
  exists?: boolean;
  listFiles?: string[];
  readContent?: string;
} = {}): Vault {
  return {
    adapter: {
      exists: jest.fn().mockResolvedValue(options.exists ?? false),
      read: jest.fn().mockResolvedValue(options.readContent ?? ""),
      write: jest.fn().mockResolvedValue(undefined),
      mkdir: jest.fn().mockResolvedValue(undefined),
      list: jest
        .fn()
        .mockResolvedValue({ files: options.listFiles ?? [], folders: [] }),
    },
    getFiles: jest.fn().mockReturnValue([]),
    getMarkdownFiles: jest.fn().mockReturnValue([]),
    createFolder: jest.fn(),
    create: jest.fn(),
    modify: jest.fn(),
    read: jest.fn(),
    on: jest.fn(),
  } as unknown as Vault;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CommandLoader", () => {
  // ── 1. Returns empty array when .claude/commands/ doesn't exist ──────────

  describe("when .claude/commands/ does not exist", () => {
    it("returns an empty array", async () => {
      const vault = makeVault({ exists: false });
      const loader = new CommandLoader(vault);

      const commands = await loader.loadCommands();

      expect(commands).toEqual([]);
    });

    it("does not attempt to list or read files", async () => {
      const vault = makeVault({ exists: false });
      const loader = new CommandLoader(vault);

      await loader.loadCommands();

      expect(vault.adapter.list).not.toHaveBeenCalled();
      expect(vault.adapter.read).not.toHaveBeenCalled();
    });
  });

  // ── 2. Loads command with description and argument-hint from frontmatter ─

  describe("when a markdown file has frontmatter", () => {
    it("extracts description from frontmatter", async () => {
      const content = `---
description: Summarise the current note
argument-hint: <note title>
---
Body text here.
`;
      const vault = makeVault({
        exists: true,
        listFiles: [".claude/commands/summarise.md"],
        readContent: content,
      });
      const loader = new CommandLoader(vault);

      const commands = await loader.loadCommands();

      expect(commands).toHaveLength(1);
      expect(commands[0].description).toBe("Summarise the current note");
    });

    it("extracts argument-hint from frontmatter", async () => {
      const content = `---
description: Summarise the current note
argument-hint: <note title>
---
Body text here.
`;
      const vault = makeVault({
        exists: true,
        listFiles: [".claude/commands/summarise.md"],
        readContent: content,
      });
      const loader = new CommandLoader(vault);

      const commands = await loader.loadCommands();

      expect(commands[0].argumentHint).toBe("<note title>");
    });

    it("leaves argumentHint undefined when not present in frontmatter", async () => {
      const content = `---
description: Simple command
---
Body.
`;
      const vault = makeVault({
        exists: true,
        listFiles: [".claude/commands/simple.md"],
        readContent: content,
      });
      const loader = new CommandLoader(vault);

      const commands = await loader.loadCommands();

      expect(commands[0].argumentHint).toBeUndefined();
    });

    it("sets description to empty string when not in frontmatter", async () => {
      const content = `---
argument-hint: something
---
Body.
`;
      const vault = makeVault({
        exists: true,
        listFiles: [".claude/commands/no-desc.md"],
        readContent: content,
      });
      const loader = new CommandLoader(vault);

      const commands = await loader.loadCommands();

      expect(commands[0].description).toBe("");
    });
  });

  // ── 3. Derives name from filename ────────────────────────────────────────

  describe("name derivation", () => {
    it("uses the filename stem as the command name", async () => {
      const vault = makeVault({
        exists: true,
        listFiles: [".claude/commands/my-command.md"],
        readContent: "---\ndescription: test\n---\n",
      });
      const loader = new CommandLoader(vault);

      const commands = await loader.loadCommands();

      expect(commands[0].name).toBe("my-command");
    });

    it("strips the .md extension from the name", async () => {
      const vault = makeVault({
        exists: true,
        listFiles: [".claude/commands/review.md"],
        readContent: "---\ndescription: review\n---\n",
      });
      const loader = new CommandLoader(vault);

      const commands = await loader.loadCommands();

      expect(commands[0].name).toBe("review");
    });

    it("includes the vault-relative path in the result", async () => {
      const vault = makeVault({
        exists: true,
        listFiles: [".claude/commands/review.md"],
        readContent: "---\ndescription: review\n---\n",
      });
      const loader = new CommandLoader(vault);

      const commands = await loader.loadCommands();

      expect(commands[0].path).toContain("review.md");
    });
  });

  // ── 4. Skips non-.md files ────────────────────────────────────────────────

  describe("non-.md files", () => {
    it("ignores .txt files", async () => {
      const vault = makeVault({
        exists: true,
        listFiles: [
          ".claude/commands/command.md",
          ".claude/commands/readme.txt",
        ],
        readContent: "---\ndescription: a command\n---\n",
      });
      const loader = new CommandLoader(vault);

      const commands = await loader.loadCommands();

      expect(commands).toHaveLength(1);
      expect(commands[0].name).toBe("command");
    });

    it("ignores .json files", async () => {
      const vault = makeVault({
        exists: true,
        listFiles: [".claude/commands/config.json"],
        readContent: "{}",
      });
      const loader = new CommandLoader(vault);

      const commands = await loader.loadCommands();

      expect(commands).toHaveLength(0);
    });

    it("returns empty when directory only contains non-.md files", async () => {
      const vault = makeVault({
        exists: true,
        listFiles: [".claude/commands/readme.txt", ".claude/commands/data.json"],
      });
      const loader = new CommandLoader(vault);

      const commands = await loader.loadCommands();

      expect(commands).toEqual([]);
    });
  });

  // ── 5. Handles read errors gracefully ────────────────────────────────────

  describe("error handling", () => {
    it("skips a file that throws on read and continues with the rest", async () => {
      const vault = makeVault({
        exists: true,
        listFiles: [
          ".claude/commands/bad.md",
          ".claude/commands/good.md",
        ],
      });

      // First read throws, second succeeds
      (vault.adapter.read as jest.Mock)
        .mockRejectedValueOnce(new Error("permission denied"))
        .mockResolvedValueOnce("---\ndescription: good command\n---\n");

      const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
      const loader = new CommandLoader(vault);

      const commands = await loader.loadCommands();

      expect(commands).toHaveLength(1);
      expect(commands[0].name).toBe("good");
      expect(warnSpy).toHaveBeenCalled();

      warnSpy.mockRestore();
    });

    it("returns empty array when listing throws", async () => {
      const vault = makeVault({ exists: true });
      (vault.adapter.list as jest.Mock).mockRejectedValue(
        new Error("disk error")
      );
      const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
      const loader = new CommandLoader(vault);

      const commands = await loader.loadCommands();

      expect(commands).toEqual([]);
      warnSpy.mockRestore();
    });
  });
});
