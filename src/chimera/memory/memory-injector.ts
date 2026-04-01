/**
 * @file Builds memory context from vault memory tiers.
 *
 * Assembles the memory portion of a system prompt, respecting token budgets
 * for each memory tier. Skills, agents, and rules are Claudian's responsibility
 * and are NOT included here.
 */

import { Vault, normalizePath } from "obsidian";
import { MemoryFile, MemoryTier, ChimeraMemorySettings, PermissionMode } from "../types";
import { parseFrontmatter } from "../utils/frontmatter";
import { estimateTokens, truncateToTokenBudget } from "../utils/token-counter";

const MEMORY_BASE = ".claude/memory";

const BASE_SYSTEM_PROMPT =
  "You are Chimera Nexus, an AI assistant integrated with Obsidian. " +
  "You have access to the user's vault for reading and writing notes, " +
  "managing memory, and executing tasks.";

/**
 * Builds memory context from vault memory files.
 *
 * Reads and classifies memory files into pinned and indexed tiers, assembles
 * each layer within its configured token budget, and concatenates them into
 * a single string ready for injection into an agent session.
 *
 * Skills, agents, and rules loading is intentionally omitted -- those are
 * managed by the Claudian layer above.
 */
export class MemoryInjector {
  /**
   * @param vault - The Obsidian Vault instance used to read memory files.
   * @param settings - Memory-specific settings containing token budget configuration.
   */
  constructor(
    private readonly vault: Vault,
    private readonly settings: ChimeraMemorySettings
  ) {}

  /**
   * Lists all `.md` files under `.claude/memory/` recursively and parses
   * their frontmatter into {@link MemoryFile} metadata objects.
   *
   * File content is NOT loaded at this stage -- the `content` field is left
   * `undefined` for lazy loading. Missing or unreadable paths are handled
   * gracefully and logged via `console.warn`.
   *
   * @returns Array of partially-populated MemoryFile objects.
   */
  async readMemoryTree(): Promise<MemoryFile[]> {
    const baseExists = await this.vault.adapter.exists(MEMORY_BASE);
    if (!baseExists) {
      return [];
    }

    const mdPaths = await this.collectMdFiles(MEMORY_BASE);
    const files: MemoryFile[] = [];

    for (const filePath of mdPaths) {
      try {
        const content = await this.vault.adapter.read(normalizePath(filePath));
        const { frontmatter } = parseFrontmatter(content);

        const stem = filePath.split("/").pop() ?? filePath;
        const name = stem.endsWith(".md") ? stem.slice(0, -3) : stem;

        const description =
          typeof frontmatter["description"] === "string"
            ? frontmatter["description"]
            : "";

        const memtype =
          typeof frontmatter["memtype"] === "string" && frontmatter["memtype"].trim() !== ""
            ? frontmatter["memtype"].trim()
            : "knowledge";

        const pinned =
          frontmatter["pinned"] === true;

        const tier: MemoryTier =
          memtype === "system" || pinned ? MemoryTier.Pinned : MemoryTier.Indexed;

        const tags: string[] = Array.isArray(frontmatter["tags"])
          ? (frontmatter["tags"] as unknown[]).filter(
              (t): t is string => typeof t === "string"
            )
          : [];

        const created =
          typeof frontmatter["created"] === "string" ? frontmatter["created"] : "";

        const updated =
          typeof frontmatter["updated"] === "string" ? frontmatter["updated"] : "";

        files.push({
          path: filePath,
          name,
          description,
          memtype,
          tier,
          pinned,
          tags,
          created,
          updated,
          content: undefined,
        });
      } catch (err) {
        console.warn(`[MemoryInjector] Failed to read memory file "${filePath}":`, err);
      }
    }

    return files;
  }

  /**
   * Splits a flat array of memory files into pinned and indexed buckets.
   *
   * Files whose `tier` is {@link MemoryTier.Pinned} are placed in the `pinned`
   * array; all others go into `indexed`.
   *
   * @param files - All memory files returned by {@link readMemoryTree}.
   * @returns An object with `pinned` and `indexed` sub-arrays.
   */
  classifyMemory(files: MemoryFile[]): { pinned: MemoryFile[]; indexed: MemoryFile[] } {
    const pinned: MemoryFile[] = [];
    const indexed: MemoryFile[] = [];

    for (const file of files) {
      if (file.tier === MemoryTier.Pinned) {
        pinned.push(file);
      } else {
        indexed.push(file);
      }
    }

    return { pinned, indexed };
  }

  /**
   * Reads the full content of each pinned file and concatenates them with
   * section headers, truncating the result to fit within the given token budget.
   *
   * Each file is formatted as:
   * ```
   * ### {name}
   * {content}
   *
   * ```
   *
   * If the assembled text exceeds `budget` tokens it is truncated at a
   * sentence boundary using {@link truncateToTokenBudget}.
   *
   * @param pinned - Pinned memory files from {@link classifyMemory}.
   * @param budget - Maximum number of tokens allowed for the pinned context.
   * @returns The assembled pinned context string.
   */
  async buildPinnedContext(pinned: MemoryFile[], budget: number): Promise<string> {
    const parts: string[] = [];

    for (const file of pinned) {
      try {
        const content = await this.vault.adapter.read(normalizePath(file.path));
        parts.push(`### ${file.name}\n${content}\n`);
      } catch (err) {
        console.warn(
          `[MemoryInjector] Failed to read pinned file "${file.path}":`,
          err
        );
      }
    }

    const assembled = parts.join("\n");

    if (estimateTokens(assembled) > budget) {
      return truncateToTokenBudget(assembled, budget);
    }

    return assembled;
  }

  /**
   * Builds a compact one-line-per-file listing of indexed memory files.
   *
   * Output format:
   * ```
   * ## Memory Index
   * - knowledge/architecture-decisions.md: Key architectural decisions and their rationale
   * - knowledge/tools-and-workflows.md
   * ```
   *
   * Files with a non-empty `description` include the description after a colon;
   * files without a description are listed by path alone.
   *
   * @param indexed - Indexed memory files from {@link classifyMemory}.
   * @returns A formatted memory tree index string.
   */
  buildTreeIndex(indexed: MemoryFile[]): string {
    if (indexed.length === 0) {
      return "## Memory Index\n";
    }

    const lines = indexed.map((file) => {
      if (file.description.trim() !== "") {
        return `- ${file.path}: ${file.description}`;
      }
      return `- ${file.path}`;
    });

    return `## Memory Index\n${lines.join("\n")}`;
  }

  /**
   * Assembles the memory portion of the system prompt context string.
   *
   * The context is built in four layers, separated by blank lines:
   * 1. Base system prompt (fixed text).
   * 2. `CLAUDE.md` from the vault root, wrapped in a Project Context header.
   * 3. Pinned memory content, wrapped in a Memory header.
   * 4. Memory tree index (indexed files), truncated to the tree budget.
   *
   * Missing optional layers (no CLAUDE.md, empty memory dir) are omitted
   * gracefully without breaking the overall structure.
   *
   * Note: Skills, agents, and rules are NOT included -- those are managed
   * by the Claudian layer.
   *
   * @returns The assembled memory context block.
   */
  async buildMemoryContext(): Promise<string> {
    const layers: string[] = [];

    // Layer 1: Base system prompt
    layers.push(BASE_SYSTEM_PROMPT);

    // Layer 2: CLAUDE.md from vault root
    try {
      const claudeMdExists = await this.vault.adapter.exists("CLAUDE.md");
      if (claudeMdExists) {
        const claudeContent = await this.vault.adapter.read(normalizePath("CLAUDE.md"));
        layers.push(`## Project Context\n${claudeContent}`);
      }
    } catch (err) {
      console.warn("[MemoryInjector] Failed to read CLAUDE.md:", err);
    }

    // Layer 3: Pinned memory
    try {
      const allFiles = await this.readMemoryTree();
      const { pinned, indexed } = this.classifyMemory(allFiles);

      const pinnedContext = await this.buildPinnedContext(
        pinned,
        this.settings.memoryPinnedBudget
      );
      if (pinnedContext.trim() !== "") {
        layers.push(`## Memory\n${pinnedContext}`);
      }

      // Layer 4: Memory tree index
      const treeIndex = this.buildTreeIndex(indexed);
      const truncatedIndex = truncateToTokenBudget(treeIndex, this.settings.memoryTreeBudget);
      if (truncatedIndex.trim() !== "") {
        layers.push(truncatedIndex);
      }
    } catch (err) {
      console.warn("[MemoryInjector] Failed to build memory context:", err);
    }

    return layers.join("\n\n");
  }

  /**
   * @deprecated Use {@link buildMemoryContext} instead.
   *
   * Alias kept for compatibility with callers migrated from chimera-nexus v1.
   */
  async buildSystemPromptContext(): Promise<string> {
    return this.buildMemoryContext();
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Recursively collects all `.md` file paths under a given vault-relative
   * directory path.
   *
   * @param dirPath - Vault-relative path of the directory to traverse.
   * @returns Array of vault-relative paths for each `.md` file found.
   */
  private async collectMdFiles(dirPath: string): Promise<string[]> {
    let listing: { files: string[]; folders: string[] };
    try {
      listing = await this.vault.adapter.list(dirPath);
    } catch (err) {
      console.warn(`[MemoryInjector] Failed to list directory "${dirPath}":`, err);
      return [];
    }

    const mdFiles = listing.files.filter((f) => f.endsWith(".md"));

    for (const subDir of listing.folders) {
      const nested = await this.collectMdFiles(subDir);
      mdFiles.push(...nested);
    }

    return mdFiles;
  }

  /**
   * Returns the permission mode instruction string for the given mode.
   *
   * @param mode - The active {@link PermissionMode}.
   * @returns A plain-text instruction sentence.
   */
  buildPermissionInstruction(mode: PermissionMode): string {
    switch (mode) {
      case PermissionMode.AskBeforeEdits:
        return "Ask for approval before making each edit.";
      case PermissionMode.EditAutomatically:
        return "You may edit files automatically without asking.";
      case PermissionMode.Plan:
        return "Explore the code and present a plan before editing.";
      case PermissionMode.BypassPermissions:
        return "All operations are pre-approved.";
    }
  }
}
