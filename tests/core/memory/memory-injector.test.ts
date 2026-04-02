/**
 * @file Tests for MemoryInjector
 */

import { Vault } from "obsidian";
import { MemoryInjector } from "../../../src/core/memory/memory-injector";
import {
  MemoryFile,
  MemoryTier,
  ChimeraSettings,
  AuthMethod,
  PermissionMode,
} from "../../../src/core/types";

// ---------------------------------------------------------------------------
// Mock Vault factory
// ---------------------------------------------------------------------------

const createMockVault = () =>
  ({
    adapter: {
      exists: jest.fn().mockResolvedValue(false),
      read: jest.fn().mockResolvedValue(""),
      write: jest.fn().mockResolvedValue(undefined),
      list: jest.fn().mockResolvedValue({ files: [], folders: [] }),
      mkdir: jest.fn().mockResolvedValue(undefined),
    },
    getFiles: jest.fn().mockReturnValue([]),
    getMarkdownFiles: jest.fn().mockReturnValue([]),
    getAbstractFileByPath: jest.fn().mockReturnValue(null),
    createFolder: jest.fn().mockResolvedValue(undefined),
    create: jest.fn(),
    modify: jest.fn(),
    read: jest.fn().mockResolvedValue(""),
    on: jest.fn(),
  } as unknown as Vault);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSettings(overrides: Partial<ChimeraSettings> = {}): ChimeraSettings {
  return {
    authMethod: AuthMethod.CLI,
    apiKey: "",
    cliPath: "claude",
    permissionMode: PermissionMode.AskBeforeEdits,
    memoryPinnedBudget: 2000,
    memoryTreeBudget: 500,
    maxConcurrentSessions: 2,
    dreamEnabled: false,
    autoMemory: false,
    userName: "Tester",
    excludedTags: [],
    model: "sonnet",
    effortLevel: "high",
    conversationalMode: false,
    marketplaces: { "chimera-official": "Chimera-Actual/chimera-marketplace" },
    ...overrides,
  };
}

function makeMemoryFile(overrides: Partial<MemoryFile> = {}): MemoryFile {
  return {
    path: ".claude/memory/knowledge.md",
    name: "knowledge",
    description: "",
    memtype: "knowledge",
    tier: MemoryTier.Indexed,
    pinned: false,
    tags: [],
    created: "",
    updated: "",
    content: undefined,
    ...overrides,
  };
}

/** Build a minimal frontmatter markdown string for a memory file. */
function buildMemoryMarkdown(fields: Record<string, string | boolean | string[]>): string {
  const lines = ["---"];
  for (const [key, val] of Object.entries(fields)) {
    if (Array.isArray(val)) {
      if (val.length === 0) {
        lines.push(`${key}: []`);
      } else {
        lines.push(`${key}:`);
        val.forEach((item) => lines.push(`  - ${item}`));
      }
    } else {
      lines.push(`${key}: ${String(val)}`);
    }
  }
  lines.push("---");
  lines.push("This is the file body.");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("MemoryInjector", () => {
  let vault: ReturnType<typeof createMockVault>;
  let injector: MemoryInjector;

  beforeEach(() => {
    vault = createMockVault();
    injector = new MemoryInjector(vault, makeSettings());
    jest.clearAllMocks();
  });

  // 1. readMemoryTree returns empty array when no memory dir
  it("readMemoryTree returns empty array when memory dir does not exist", async () => {
    (vault.adapter.exists as jest.Mock).mockResolvedValue(false);

    const files = await injector.readMemoryTree();
    expect(files).toEqual([]);
  });

  // 2. readMemoryTree parses memory files correctly
  it("readMemoryTree parses memory files correctly", async () => {
    const md = buildMemoryMarkdown({
      description: "Project notes",
      memtype: "knowledge",
      pinned: false,
      tags: ["project", "notes"],
      created: "2024-01-01T00:00:00.000Z",
      updated: "2024-06-01T00:00:00.000Z",
    });

    (vault.adapter.exists as jest.Mock).mockResolvedValue(true);
    (vault.adapter.list as jest.Mock).mockResolvedValue({
      files: [".claude/memory/project-notes.md"],
      folders: [],
    });
    (vault.adapter.read as jest.Mock).mockResolvedValue(md);

    const files = await injector.readMemoryTree();

    expect(files).toHaveLength(1);
    const file = files[0];
    expect(file.name).toBe("project-notes");
    expect(file.description).toBe("Project notes");
    expect(file.memtype).toBe("knowledge");
    expect(file.pinned).toBe(false);
    expect(file.tier).toBe(MemoryTier.Indexed);
    expect(file.tags).toEqual(["project", "notes"]);
    expect(file.created).toBe("2024-01-01T00:00:00.000Z");
  });

  // readMemoryTree: system memtype → Pinned tier
  it("readMemoryTree assigns Pinned tier for memtype=system", async () => {
    const md = buildMemoryMarkdown({ memtype: "system", pinned: false });

    (vault.adapter.exists as jest.Mock).mockResolvedValue(true);
    (vault.adapter.list as jest.Mock).mockResolvedValue({
      files: [".claude/memory/system.md"],
      folders: [],
    });
    (vault.adapter.read as jest.Mock).mockResolvedValue(md);

    const files = await injector.readMemoryTree();
    expect(files[0].tier).toBe(MemoryTier.Pinned);
  });

  // readMemoryTree: pinned=true → Pinned tier
  it("readMemoryTree assigns Pinned tier when pinned=true", async () => {
    const md = buildMemoryMarkdown({ memtype: "knowledge", pinned: true });

    (vault.adapter.exists as jest.Mock).mockResolvedValue(true);
    (vault.adapter.list as jest.Mock).mockResolvedValue({
      files: [".claude/memory/important.md"],
      folders: [],
    });
    (vault.adapter.read as jest.Mock).mockResolvedValue(md);

    const files = await injector.readMemoryTree();
    expect(files[0].pinned).toBe(true);
    expect(files[0].tier).toBe(MemoryTier.Pinned);
  });

  // readMemoryTree: recurses into subdirectories
  it("readMemoryTree recurses into subdirectories", async () => {
    const md = buildMemoryMarkdown({ memtype: "knowledge" });

    (vault.adapter.exists as jest.Mock).mockResolvedValue(true);
    (vault.adapter.list as jest.Mock)
      .mockResolvedValueOnce({
        files: [],
        folders: [".claude/memory/sub"],
      })
      .mockResolvedValueOnce({
        files: [".claude/memory/sub/nested.md"],
        folders: [],
      });
    (vault.adapter.read as jest.Mock).mockResolvedValue(md);

    const files = await injector.readMemoryTree();
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe(".claude/memory/sub/nested.md");
  });

  // 3. classifyMemory splits pinned vs indexed correctly
  it("classifyMemory places Pinned-tier files in pinned bucket", () => {
    const pinnedFile = makeMemoryFile({ tier: MemoryTier.Pinned, pinned: true });
    const indexedFile = makeMemoryFile({ tier: MemoryTier.Indexed });
    const onDemandFile = makeMemoryFile({ tier: MemoryTier.OnDemand });

    const { pinned, indexed } = injector.classifyMemory([pinnedFile, indexedFile, onDemandFile]);

    expect(pinned).toHaveLength(1);
    expect(pinned[0]).toBe(pinnedFile);
    expect(indexed).toHaveLength(2);
    expect(indexed).toContain(indexedFile);
    expect(indexed).toContain(onDemandFile);
  });

  it("classifyMemory returns empty arrays for empty input", () => {
    const { pinned, indexed } = injector.classifyMemory([]);
    expect(pinned).toEqual([]);
    expect(indexed).toEqual([]);
  });

  // 4. buildPinnedContext concatenates pinned files with headers
  it("buildPinnedContext concatenates pinned files with ### headers", async () => {
    const file1 = makeMemoryFile({ name: "system-prompt", path: ".claude/memory/system.md" });
    const file2 = makeMemoryFile({ name: "user-prefs", path: ".claude/memory/prefs.md" });

    (vault.adapter.read as jest.Mock)
      .mockResolvedValueOnce("You are Chimera.\n")
      .mockResolvedValueOnce("Prefer concise answers.\n");

    const result = await injector.buildPinnedContext([file1, file2], 5000);

    expect(result).toContain("### system-prompt");
    expect(result).toContain("You are Chimera.");
    expect(result).toContain("### user-prefs");
    expect(result).toContain("Prefer concise answers.");
  });

  // 5. buildPinnedContext truncates when over budget
  it("buildPinnedContext truncates output when over token budget", async () => {
    // Create a file with a lot of content to exceed a very small budget
    const largeContent = "word ".repeat(1000);
    const file = makeMemoryFile({ name: "large-file", path: ".claude/memory/large.md" });

    (vault.adapter.read as jest.Mock).mockResolvedValue(largeContent);

    const result = await injector.buildPinnedContext([file], 10); // tiny budget

    // Result should be much shorter than the original content
    expect(result.length).toBeLessThan(largeContent.length);
  });

  // 6. buildTreeIndex formats file listing correctly
  it("buildTreeIndex formats indexed files as a list under ## Memory Index", () => {
    const fileWithDesc = makeMemoryFile({
      path: ".claude/memory/arch.md",
      description: "Architecture decisions",
    });
    const fileNoDesc = makeMemoryFile({
      path: ".claude/memory/misc.md",
      description: "",
    });

    const result = injector.buildTreeIndex([fileWithDesc, fileNoDesc]);

    expect(result).toContain("## Memory Index");
    expect(result).toContain("- .claude/memory/arch.md: Architecture decisions");
    expect(result).toContain("- .claude/memory/misc.md");
    // File without description should NOT have a colon suffix
    expect(result).not.toMatch(/\.claude\/memory\/misc\.md:/);
  });

  it("buildTreeIndex returns only header when no indexed files", () => {
    const result = injector.buildTreeIndex([]);
    expect(result).toBe("## Memory Index\n");
  });

  // 7. buildSystemPromptContext assembles all layers
  it("buildSystemPromptContext includes base system prompt", async () => {
    // No CLAUDE.md, no memory files
    (vault.adapter.exists as jest.Mock).mockResolvedValue(false);
    (vault.adapter.list as jest.Mock).mockResolvedValue({ files: [], folders: [] });

    const ctx = await injector.buildSystemPromptContext();

    expect(ctx).toContain("You are Chimera Nexus");
  });

  it("buildSystemPromptContext includes CLAUDE.md content when present", async () => {
    (vault.adapter.exists as jest.Mock).mockImplementation((path: string) => {
      if (path === "CLAUDE.md") return Promise.resolve(true);
      if (path === ".claude/memory") return Promise.resolve(false);
      return Promise.resolve(false);
    });
    (vault.adapter.read as jest.Mock).mockImplementation((path: string) => {
      if (path === "CLAUDE.md") return Promise.resolve("## Project Rules\nBe concise.");
      return Promise.resolve("");
    });
    (vault.adapter.list as jest.Mock).mockResolvedValue({ files: [], folders: [] });

    const ctx = await injector.buildSystemPromptContext();

    expect(ctx).toContain("## Project Context");
    expect(ctx).toContain("Be concise.");
  });

  it("buildSystemPromptContext includes permission mode instruction", async () => {
    (vault.adapter.exists as jest.Mock).mockResolvedValue(false);
    (vault.adapter.list as jest.Mock).mockResolvedValue({ files: [], folders: [] });

    const ctx = await injector.buildSystemPromptContext();

    // AskBeforeEdits mode (default in makeSettings) should ask before edits
    expect(ctx).toContain("Ask for approval before making each edit.");
  });

  it("buildSystemPromptContext uses BypassPermissions permission instruction", async () => {
    const bypassInjector = new MemoryInjector(
      vault,
      makeSettings({ permissionMode: PermissionMode.BypassPermissions })
    );

    (vault.adapter.exists as jest.Mock).mockResolvedValue(false);
    (vault.adapter.list as jest.Mock).mockResolvedValue({ files: [], folders: [] });

    const ctx = await bypassInjector.buildSystemPromptContext();
    expect(ctx).toContain("All operations are pre-approved.");
  });
});
