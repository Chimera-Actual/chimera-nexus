/**
 * @file Builds system prompt context from memory tiers, skills, agents, and rules.
 *
 * Assembles the full system-prompt preamble that is prepended to every agent
 * session, respecting token budgets for each memory tier.
 */

import { Vault, normalizePath } from "obsidian";
import { MemoryFile, MemoryTier, ChimeraSettings, PermissionMode } from "../types";
import { parseFrontmatter } from "../../utils/frontmatter";
import { estimateTokens, truncateToTokenBudget } from "../../utils/token-counter";
import { SkillLoader } from "../claude-compat/skill-loader";
import { AgentLoader } from "../claude-compat/agent-loader";
import { RulesLoader } from "../claude-compat/rules-loader";

const MEMORY_BASE = ".claude/memory";

const BASE_SYSTEM_PROMPT =
  "You are Chimera Nexus, an AI assistant integrated with Obsidian. " +
  "You have access to the user's vault for reading and writing notes, " +
  "managing memory, and executing tasks.";

/**
 * Builds the system-prompt context block from vault memory, skills, and rules.
 *
 * Reads and classifies memory files into pinned and indexed tiers, assembles
 * each layer of the system prompt within its configured token budget, and
 * concatenates all layers into a single string ready for injection at the start
 * of an agent session.
 */
export class MemoryInjector {
  /**
   * @param vault - The Obsidian Vault instance used to read memory files.
   * @param settings - Plugin settings containing token budget configuration.
   */
  constructor(
    private readonly vault: Vault,
    private readonly settings: ChimeraSettings
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
   * Assembles the full multi-layer system prompt context string.
   *
   * The prompt is built in eight layers, separated by blank lines:
   * 1. Base system prompt (fixed text).
   * 2. `CLAUDE.md` from the vault root, wrapped in a Project Context header.
   * 3. Pinned memory content, wrapped in a Memory header.
   * 4. Memory tree index (indexed files), truncated to the tree budget.
   * 5. Available skills (from {@link SkillLoader}).
   * 6. Available agents (from {@link AgentLoader}).
   * 7. Active rules (from {@link RulesLoader}).
   * 8. Permission mode instructions derived from {@link PermissionMode}.
   *
   * Missing optional layers (no CLAUDE.md, empty loaders) are omitted
   * gracefully without breaking the overall structure.
   *
   * @returns The assembled system-prompt context block.
   */
  async buildSystemPromptContext(): Promise<string> {
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

    // Layer 5: Available skills
    try {
      const skillLoader = new SkillLoader(this.vault);
      const skills = await skillLoader.loadSkills();
      if (skills.length > 0) {
        const skillLines = skills
          .map((s) => (s.description ? `- ${s.name}: ${s.description}` : `- ${s.name}`))
          .join("\n");
        layers.push(`## Available Skills\n${skillLines}`);
      }
    } catch (err) {
      console.warn("[MemoryInjector] Failed to load skills:", err);
    }

    // Layer 6: Available agents
    try {
      const agentLoader = new AgentLoader(this.vault);
      const agents = await agentLoader.loadAgents();
      if (agents.length > 0) {
        const agentLines = agents
          .map((a) =>
            a.description ? `- @${a.name}: ${a.description}` : `- @${a.name}`
          )
          .join("\n");
        layers.push(`## Available Agents\n${agentLines}`);
      }
    } catch (err) {
      console.warn("[MemoryInjector] Failed to load agents:", err);
    }

    // Layer 7: Active rules
    try {
      const rulesLoader = new RulesLoader(this.vault);
      const rules = await rulesLoader.loadRules();
      if (rules.length > 0) {
        const ruleBlocks = rules
          .map((r) => `## Active Rules\n${r.content}`)
          .join("\n\n");
        layers.push(ruleBlocks);
      }
    } catch (err) {
      console.warn("[MemoryInjector] Failed to load rules:", err);
    }

    // Layer 8: Permission mode instructions
    const permissionInstruction = this.buildPermissionInstruction(
      this.settings.permissionMode
    );
    layers.push(permissionInstruction);

    return layers.join("\n\n");
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
  private buildPermissionInstruction(mode: PermissionMode): string {
    switch (mode) {
      case PermissionMode.Safe:
        return "Ask before any write operations.";
      case PermissionMode.Plan:
        return "You may plan freely but ask before executing.";
      case PermissionMode.YOLO:
        return "All operations are pre-approved.";
    }
  }
}
