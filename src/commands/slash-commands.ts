/**
 * @file Slash command registry for Chimera Nexus.
 *
 * Intercepts slash commands typed in the chat input and routes them to the
 * appropriate built-in or dynamically discovered handler. Built-in commands
 * cover core Chimera features; CC commands are discovered from the vault's
 * `.claude/commands/` folder via {@link CommandLoader}.
 */

import { Vault, normalizePath } from "obsidian";
import { ChimeraSettings } from "../core/types";
import { CommandLoader } from "../core/claude-compat/command-loader";
import { parseFrontmatter, stringifyFrontmatter } from "../utils/frontmatter";
import { AgentLoader } from "../core/claude-compat/agent-loader";

const MEMORY_BASE = ".claude/memory";

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

/**
 * A single slash command handler registered with the {@link SlashCommandRegistry}.
 */
export interface SlashCommandHandler {
  /** Command name without the leading slash (e.g. `"help"`). */
  name: string;
  /** Short human-readable description shown in help output. */
  description: string;
  /** Optional hint describing accepted arguments (e.g. `"<path>"`). */
  argumentHint?: string;
  /**
   * Executes the command.
   *
   * @param args    - Everything after the command name (may be an empty string).
   * @param context - Runtime context providing vault access and chat hooks.
   * @returns Markdown string to display as the command response.
   */
  execute: (args: string, context: SlashCommandContext) => Promise<string>;
}

/**
 * Runtime context passed to every slash command handler at execution time.
 */
export interface SlashCommandContext {
  /** The Obsidian Vault instance for file I/O. */
  vault: Vault;
  /** Plugin settings at the time of execution. */
  settings: ChimeraSettings;
  /** Appends a message to the chat panel. */
  addChatMessage: (role: "user" | "assistant", content: string) => void;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/**
 * Central registry for all Chimera Nexus slash commands.
 *
 * Handles two categories of commands:
 * - **Built-in** commands wired directly inside {@link registerBuiltins}.
 * - **CC commands** discovered at runtime from `.claude/commands/` via
 *   {@link registerCCCommands}.
 *
 * @example
 * ```typescript
 * const registry = new SlashCommandRegistry(vault, settings);
 * registry.registerBuiltins();
 * await registry.registerCCCommands();
 *
 * if (registry.isSlashCommand(userInput)) {
 *   const response = await registry.execute(userInput, context);
 * }
 * ```
 */
export class SlashCommandRegistry {
  private readonly handlers = new Map<string, SlashCommandHandler>();

  /**
   * @param vault    - Obsidian Vault instance used for file I/O.
   * @param settings - Current plugin settings.
   */
  constructor(
    private readonly vault: Vault,
    private readonly settings: ChimeraSettings
  ) {}

  // -------------------------------------------------------------------------
  // Registration
  // -------------------------------------------------------------------------

  /**
   * Registers all built-in Chimera slash commands.
   *
   * Commands registered: `/help`, `/memory`, `/agents`, `/loop`,
   * `/schedule`, `/dream`.
   */
  registerBuiltins(): void {
    this.register(this.buildHelp());
    this.register(this.buildMemory());
    this.register(this.buildAgents());
    this.register({
      name: "loop",
      description: "Manage session loops (Phase 2)",
      execute: async () =>
        "Loop scheduling is not yet available. Coming in Phase 2.",
    });
    this.register({
      name: "schedule",
      description: "Manage scheduled tasks (Phase 2)",
      execute: async () =>
        "Task scheduling is not yet available. Coming in Phase 2.",
    });
    this.register({
      name: "dream",
      description: "Run memory consolidation (Phase 2)",
      execute: async () =>
        "Dream cycle is not yet available. Coming in Phase 2.",
    });
  }

  /**
   * Discovers CC commands from `.claude/commands/` and registers a handler
   * for each one. The handler reads the command file and returns its content
   * so the caller can forward it to the active agent as a prompt.
   *
   * Files that cannot be read are skipped with a warning.
   */
  async registerCCCommands(): Promise<void> {
    const loader = new CommandLoader(this.vault);
    let definitions;
    try {
      definitions = await loader.loadCommands();
    } catch (err) {
      console.warn("[SlashCommandRegistry] Failed to load CC commands:", err);
      return;
    }

    for (const def of definitions) {
      const path = def.path;
      this.register({
        name: def.name,
        description: def.description,
        argumentHint: def.argumentHint,
        execute: async () => {
          try {
            const content = await this.vault.adapter.read(normalizePath(path));
            return content;
          } catch (err) {
            console.warn(
              `[SlashCommandRegistry] Failed to read CC command "${def.name}":`,
              err
            );
            return `Error: could not read command file for /${def.name}.`;
          }
        },
      });
    }
  }

  // -------------------------------------------------------------------------
  // Lookup
  // -------------------------------------------------------------------------

  /**
   * Returns the handler registered under `name`, or `undefined` if none exists.
   *
   * @param name - Command name without the leading slash.
   */
  getCommand(name: string): SlashCommandHandler | undefined {
    return this.handlers.get(name);
  }

  /**
   * Returns every registered command in insertion order.
   */
  listCommands(): SlashCommandHandler[] {
    return Array.from(this.handlers.values());
  }

  // -------------------------------------------------------------------------
  // Execution
  // -------------------------------------------------------------------------

  /**
   * Returns `true` when `input` begins with a `/` character.
   *
   * @param input - Raw text from the chat input field.
   */
  isSlashCommand(input: string): boolean {
    return input.startsWith("/");
  }

  /**
   * Parses and executes the slash command encoded in `input`.
   *
   * The first token after the `/` is treated as the command name; everything
   * else is passed to the handler as `args`. If no matching handler is found
   * an error message is returned.
   *
   * @param input   - Full slash command string (e.g. `"/memory view foo.md"`).
   * @param context - Runtime context forwarded to the handler.
   * @returns The handler's response, or an error string for unknown commands.
   */
  async execute(input: string, context: SlashCommandContext): Promise<string> {
    const trimmed = input.trim();
    const withoutSlash = trimmed.startsWith("/") ? trimmed.slice(1) : trimmed;
    const spaceIndex = withoutSlash.indexOf(" ");
    const name =
      spaceIndex === -1 ? withoutSlash : withoutSlash.slice(0, spaceIndex);
    const args =
      spaceIndex === -1 ? "" : withoutSlash.slice(spaceIndex + 1).trim();

    const handler = this.getCommand(name);
    if (!handler) {
      return `Unknown command: /${name}. Type /help for available commands.`;
    }

    return handler.execute(args, context);
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private register(handler: SlashCommandHandler): void {
    this.handlers.set(handler.name, handler);
  }

  private buildHelp(): SlashCommandHandler {
    return {
      name: "help",
      description: "Show this help message",
      execute: async () => {
        const builtinNames = new Set([
          "help",
          "memory",
          "agents",
          "loop",
          "schedule",
          "dream",
        ]);

        const ccLines: string[] = [];
        for (const handler of this.handlers.values()) {
          if (!builtinNames.has(handler.name)) {
            const hint = handler.argumentHint ? ` ${handler.argumentHint}` : "";
            ccLines.push(`/${handler.name}${hint} - ${handler.description}`);
          }
        }

        const ccSection =
          ccLines.length > 0
            ? ccLines.join("\n")
            : "(No Claude Code commands found in .claude/commands/)";

        return [
          "Chimera Nexus Commands:",
          "",
          "/help - Show this help message",
          "/memory - View and manage memory files",
          "/agents - List available agents",
          "/loop - Manage session loops (Phase 2)",
          "/schedule - Manage scheduled tasks (Phase 2)",
          "/dream - Run memory consolidation (Phase 2)",
          "",
          "Claude Code Commands:",
          ccSection,
          "",
          "Tip: Use @agent-name to delegate tasks to specific agents.",
        ].join("\n");
      },
    };
  }

  private buildMemory(): SlashCommandHandler {
    return {
      name: "memory",
      description: "View and manage memory files",
      argumentHint: "[view <path> | edit <path> <content>]",
      execute: async (args, context) => {
        const trimmed = args.trim();

        if (trimmed === "") {
          return this.memoryList(context.vault);
        }

        const parts = trimmed.split(/\s+/);
        const sub = parts[0];

        if (sub === "view") {
          const filePath = parts.slice(1).join(" ");
          return this.memoryView(context.vault, filePath);
        }

        if (sub === "edit") {
          // Syntax: edit <path> <content>
          // Path is the second token; everything after is content.
          const rest = trimmed.slice("edit".length).trimStart();
          const spaceAfterPath = rest.indexOf(" ");
          if (spaceAfterPath === -1) {
            return "Usage: /memory edit <path> <content>";
          }
          const filePath = rest.slice(0, spaceAfterPath);
          const content = rest.slice(spaceAfterPath + 1);
          return this.memoryEdit(context.vault, filePath, content);
        }

        return "Usage: /memory | /memory view <path> | /memory edit <path> <content>";
      },
    };
  }

  private async memoryList(vault: Vault): Promise<string> {
    try {
      const baseExists = await vault.adapter.exists(MEMORY_BASE);
      if (!baseExists) {
        return "No memory directory found at .claude/memory/";
      }

      const lines: string[] = ["Memory files:", ""];
      await this.collectMemoryFiles(vault, MEMORY_BASE, lines);
      return lines.join("\n");
    } catch (err) {
      console.warn("[SlashCommandRegistry] Error listing memory files:", err);
      return "Error reading memory directory.";
    }
  }

  private async collectMemoryFiles(
    vault: Vault,
    dir: string,
    lines: string[]
  ): Promise<void> {
    let listing: { files: string[]; folders: string[] };
    try {
      listing = await vault.adapter.list(dir);
    } catch {
      return;
    }

    for (const filePath of listing.files) {
      if (!filePath.endsWith(".md")) continue;
      try {
        const content = await vault.adapter.read(normalizePath(filePath));
        const { frontmatter } = parseFrontmatter(content);
        const description =
          typeof frontmatter["description"] === "string"
            ? frontmatter["description"]
            : "";
        const display = description ? `${filePath} - ${description}` : filePath;
        lines.push(display);
      } catch {
        lines.push(filePath);
      }
    }

    for (const subDir of listing.folders) {
      await this.collectMemoryFiles(vault, subDir, lines);
    }
  }

  private async memoryView(vault: Vault, filePath: string): Promise<string> {
    if (!filePath) {
      return "Usage: /memory view <path>";
    }
    const normalized = normalizePath(
      filePath.startsWith(MEMORY_BASE)
        ? filePath
        : `${MEMORY_BASE}/${filePath}`
    );
    try {
      const content = await vault.adapter.read(normalized);
      return content;
    } catch (err) {
      console.warn(`[SlashCommandRegistry] Failed to read memory file "${normalized}":`, err);
      return `Error: could not read "${normalized}".`;
    }
  }

  private async memoryEdit(
    vault: Vault,
    filePath: string,
    newBody: string
  ): Promise<string> {
    if (!filePath) {
      return "Usage: /memory edit <path> <content>";
    }
    const normalized = normalizePath(
      filePath.startsWith(MEMORY_BASE)
        ? filePath
        : `${MEMORY_BASE}/${filePath}`
    );
    try {
      let existing = "";
      const exists = await vault.adapter.exists(normalized);
      if (exists) {
        existing = await vault.adapter.read(normalized);
      }

      const { frontmatter } = parseFrontmatter(existing);
      const updated = stringifyFrontmatter(frontmatter, newBody);
      await vault.adapter.write(normalized, updated);
      return `Memory file "${normalized}" updated.`;
    } catch (err) {
      console.warn(`[SlashCommandRegistry] Failed to write memory file "${normalized}":`, err);
      return `Error: could not write "${normalized}".`;
    }
  }

  private buildAgents(): SlashCommandHandler {
    return {
      name: "agents",
      description: "List available agents",
      execute: async (_, context) => {
        const loader = new AgentLoader(context.vault);
        let agents;
        try {
          agents = await loader.loadAgents();
        } catch (err) {
          console.warn("[SlashCommandRegistry] Failed to load agents:", err);
          return "Error loading agents.";
        }

        if (agents.length === 0) {
          return "No agents found in .claude/agents/";
        }

        const lines: string[] = ["Available agents:", ""];
        for (const agent of agents) {
          lines.push(`**${agent.name}** (${agent.model})`);
          if (agent.description) {
            lines.push(`  ${agent.description}`);
          }
          lines.push("");
        }
        return lines.join("\n").trimEnd();
      },
    };
  }
}
