/**
 * @file Slash command registry for Chimera Nexus.
 *
 * Intercepts slash commands typed in the chat input and routes them to the
 * appropriate built-in or dynamically discovered handler. Built-in commands
 * cover core Chimera features; CC commands are discovered from the vault's
 * `.claude/commands/` folder via {@link CommandLoader}.
 */

import { exec } from "child_process";
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
  /** Persists current settings to disk. */
  saveSettings: () => Promise<void>;
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
   * Commands registered cover authentication, session management, model/effort
   * selection, permissions, scheduling stubs, and informational utilities.
   */
  registerBuiltins(): void {
    this.register(this.buildHelp());
    this.register(this.buildMemory());
    this.register(this.buildAgents());

    // Phase 2 stubs
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

    // -- Auth commands --------------------------------------------------------
    this.register({
      name: "login",
      description: "Sign in to your Anthropic account",
      execute: async (_args, context) => {
        return this.runCliCommand("claude auth login", context);
      },
    });
    this.register({
      name: "logout",
      description: "Sign out from your Anthropic account",
      execute: async (_args, context) => {
        return this.runCliCommand("claude auth logout", context);
      },
    });
    this.register({
      name: "status",
      description: "Show version, model, account, and connectivity",
      execute: async (_args, context) => {
        return this.runCliCommand("claude auth status --text", context);
      },
    });

    // -- Session commands -----------------------------------------------------
    this.register({
      name: "clear",
      description: "Clear conversation and start fresh",
      execute: async (_args, context) => {
        context.addChatMessage("assistant", "Conversation cleared.");
        return "";
      },
    });
    this.register({
      name: "new",
      description: "Start new conversation (alias for /clear)",
      execute: async (_args, context) => {
        context.addChatMessage("assistant", "Conversation cleared.");
        return "";
      },
    });
    this.register({
      name: "reset",
      description: "Reset conversation (alias for /clear)",
      execute: async (_args, context) => {
        context.addChatMessage("assistant", "Conversation cleared.");
        return "";
      },
    });
    this.register({
      name: "compact",
      description: "Compact conversation to free context",
      argumentHint: "[focus instructions]",
      execute: async (args) => {
        return `Context compacted.${args ? ` Focus: ${args}` : ""} (Note: full context compaction requires active SDK session)`;
      },
    });
    this.register({
      name: "cost",
      description: "Show token usage statistics for current session",
      execute: async () => {
        return "Token usage tracking is not yet connected to the SDK. Coming soon.";
      },
    });
    this.register({
      name: "export",
      description: "Export conversation as plain text",
      argumentHint: "[filename]",
      execute: async () => {
        return "Export is not yet implemented. Use /memory to access stored sessions.";
      },
    });
    this.register({
      name: "rename",
      description: "Rename the current session",
      argumentHint: "[name]",
      execute: async (args) => {
        if (!args) return "Usage: /rename <session name>";
        return `Session renamed to "${args}". (Note: rename persists on next save)`;
      },
    });
    this.register({
      name: "copy",
      description: "Copy last assistant response to clipboard",
      execute: async () => {
        return "Copy: select text in the chat and use Ctrl+C. Programmatic copy coming soon.";
      },
    });

    // -- Model / Effort commands ----------------------------------------------
    this.register({
      name: "model",
      description: "Select or change the AI model",
      argumentHint: "[haiku|sonnet|opus]",
      execute: async (args, context) => {
        if (!args) {
          return `Current model: ${context.settings.model}. Use /model haiku|sonnet|opus to change.`;
        }
        const model = args.trim().toLowerCase();
        if (!["haiku", "sonnet", "opus"].includes(model)) {
          return `Unknown model: ${model}. Available: haiku, sonnet, opus`;
        }
        context.settings.model = model;
        await context.saveSettings();
        return `Model changed to ${model}.`;
      },
    });
    this.register({
      name: "effort",
      description: "Set model effort level",
      argumentHint: "[low|med|high|max]",
      execute: async (args, context) => {
        if (!args) {
          return `Current effort: ${context.settings.effortLevel}. Use /effort low|med|high|max to change.`;
        }
        const level = args.trim().toLowerCase();
        if (!["low", "med", "high", "max"].includes(level)) {
          return `Unknown effort level: ${level}. Available: low, med, high, max`;
        }
        context.settings.effortLevel = level;
        await context.saveSettings();
        return `Effort level changed to ${level}.`;
      },
    });

    // -- Permission commands --------------------------------------------------
    this.register({
      name: "permissions",
      description: "View or update tool permissions",
      execute: async (_args, context) => {
        const mode = context.settings.permissionMode;
        const modeNames: Record<string, string> = {
          default: "Ask before edits",
          acceptEdits: "Edit automatically",
          plan: "Plan mode",
          bypassPermissions: "Bypass permissions",
        };
        return [
          `Current permission mode: ${modeNames[mode] || mode}`,
          "",
          "Modes:",
          "  default - Ask for approval before making each edit",
          "  acceptEdits - Auto-accept file edits",
          "  plan - Explore code and present a plan first",
          "  bypassPermissions - No approval for any operations",
          "",
          "Change via the permission selector in the toolbar, or in Settings.",
        ].join("\n");
      },
    });

    // -- Info commands ---------------------------------------------------------
    this.register({
      name: "doctor",
      description: "Diagnose Claude Code installation",
      execute: async (_args, context) => {
        return this.runCliCommand("claude doctor", context);
      },
    });
    this.register({
      name: "config",
      description: "Open plugin settings",
      execute: async () => {
        return "Open Obsidian Settings > Chimera Nexus to configure the plugin.";
      },
    });
    this.register({
      name: "skills",
      description: "List available skills",
      execute: async (_args, context) => {
        const { SkillLoader } = await import("../core/claude-compat/skill-loader");
        const loader = new SkillLoader(context.vault);
        try {
          const skills = await loader.loadSkills();
          if (skills.length === 0) return "No skills found in .claude/skills/";
          return ["Available skills:", ...skills.map(s => `  ${s.name} - ${s.description}`)].join("\n");
        } catch {
          return "Failed to load skills.";
        }
      },
    });
    this.register({
      name: "hooks",
      description: "View hook configurations",
      execute: async (_args, context) => {
        try {
          const settingsPath = ".claude/settings.json";
          const exists = await context.vault.adapter.exists(settingsPath);
          if (!exists) return "No hooks configured. Create .claude/settings.json to define hooks.";
          const content = await context.vault.adapter.read(settingsPath);
          const parsed = JSON.parse(content);
          if (!parsed.hooks) return "No hooks defined in .claude/settings.json";
          return "Hooks configuration:\n```json\n" + JSON.stringify(parsed.hooks, null, 2) + "\n```";
        } catch {
          return "Failed to read hooks configuration.";
        }
      },
    });
    this.register({
      name: "init",
      description: "Initialize project with CLAUDE.md",
      execute: async (_args, context) => {
        const path = "CLAUDE.md";
        const exists = await context.vault.adapter.exists(path);
        if (exists) return "CLAUDE.md already exists in your vault root.";
        const content = [
          "# CLAUDE.md",
          "",
          "## Project Context",
          "",
          "Describe your project here. This file is loaded into the system prompt.",
          "",
          "## Conventions",
          "",
          "- List your coding conventions",
          "- Describe your file structure",
          "- Note any important patterns",
        ].join("\n");
        await context.vault.adapter.write(path, content);
        return "Created CLAUDE.md in your vault root. Edit it to provide project context.";
      },
    });
    this.register({
      name: "context",
      description: "Show current context usage",
      execute: async () => {
        return "Context visualization is not yet implemented. Token usage tracking coming soon.";
      },
    });
    this.register({
      name: "release-notes",
      description: "View Chimera Nexus changelog",
      execute: async () => {
        return [
          "Chimera Nexus v0.5.0",
          "",
          "- Model selector (Haiku/Sonnet/Opus)",
          "- Effort selector (Max/High/Med/Low)",
          "- Markdown rendering for responses",
          "- Tool call rendering with icons",
          "- Slash command autocomplete",
          "- Permission selector (Ask/Auto-edit/Plan/Bypass)",
          "- Agent creation UI",
          "- Session history with search",
          "- Memory system with /memory command",
          "- Claude Code compatibility layer",
        ].join("\n");
      },
    });
    this.register({
      name: "usage",
      description: "Show plan usage and rate limits",
      execute: async (_args, context) => {
        return this.runCliCommand("claude usage", context);
      },
    });
    this.register({
      name: "diff",
      description: "Show uncommitted changes",
      execute: async (_args, context) => {
        return this.runCliCommand("git diff", context);
      },
    });
    this.register({
      name: "plugin",
      description: "Manage CC-compatible plugins",
      argumentHint: "[install|uninstall|enable|disable|update|discover|validate|marketplace]",
      execute: async (args, context) => {
        const { PluginCommandHandler } = await import("./plugin-command");
        const handler = new PluginCommandHandler(context.vault);
        return handler.execute(args, context);
      },
    });
    this.register({
      name: "mcp",
      description: "Manage MCP server connections",
      execute: async () => {
        return "MCP server management is configured in .claude/settings.json. UI management coming soon.";
      },
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

  /**
   * Executes a shell command (typically a Claude CLI command) and returns its
   * stdout or an error message.
   */
  private async runCliCommand(command: string, context: SlashCommandContext): Promise<string> {
    return new Promise((resolve) => {
      const cliPath = context.settings.cliPath || "claude";
      const fullCommand = command.startsWith("claude")
        ? command.replace("claude", cliPath)
        : command;

      exec(
        fullCommand,
        { timeout: 30000 },
        (err: Error | null, stdout: string, stderr: string) => {
          if (err) {
            resolve(`Error: ${stderr || err.message}`);
            return;
          }
          resolve(stdout.trim() || "Command completed successfully.");
        },
      );
    });
  }

  private buildHelp(): SlashCommandHandler {
    return {
      name: "help",
      description: "Show available commands",
      execute: async () => {
        const commands = this.listCommands();
        const builtinNames = new Set([
          "help", "login", "logout", "status", "clear", "new", "reset",
          "compact", "cost", "export", "model", "effort", "permissions",
          "doctor", "config", "skills", "hooks", "init", "context",
          "release-notes", "usage", "rename", "copy", "diff", "plugin",
          "mcp", "memory", "agents", "loop", "schedule", "dream",
        ]);

        const ccCommands = commands.filter(c => !builtinNames.has(c.name));

        const lines = [
          "Chimera Nexus Commands:",
          "",
          "Authentication:",
          "  /login - Sign in to your Anthropic account",
          "  /logout - Sign out",
          "  /status - Show account and connection info",
          "",
          "Chat:",
          "  /clear - Clear conversation and start fresh",
          "  /compact - Compact conversation to free context",
          "  /rename - Rename current session",
          "  /copy - Copy last response to clipboard",
          "  /export - Export conversation as text",
          "",
          "Model & Effort:",
          "  /model [name] - Select model (haiku/sonnet/opus)",
          "  /effort [level] - Set effort (low/med/high/max)",
          "",
          "Memory & Context:",
          "  /memory - View and manage memory files",
          "  /context - Show context usage",
          "  /init - Initialize CLAUDE.md",
          "",
          "Agents & Tools:",
          "  /agents - List available agents",
          "  /skills - List available skills",
          "  /plugin - Manage plugins (install/update/discover/marketplace)",
          "  /mcp - Manage MCP servers",
          "  /permissions - View tool permissions",
          "  /hooks - View hook configurations",
          "",
          "Scheduling:",
          "  /loop - Session loop tasks",
          "  /schedule - Scheduled tasks",
          "  /dream - Memory consolidation",
          "",
          "Info:",
          "  /help - Show this help",
          "  /config - Open settings",
          "  /doctor - Diagnose installation",
          "  /cost - Token usage stats",
          "  /usage - Plan usage and limits",
          "  /diff - Show uncommitted changes",
          "  /release-notes - View changelog",
        ];

        if (ccCommands.length > 0) {
          lines.push("", "Claude Code Commands:");
          for (const cmd of ccCommands) {
            lines.push(`  /${cmd.name}${cmd.description ? ` - ${cmd.description}` : ""}`);
          }
        }

        lines.push("", "Tip: Use @agent-name to delegate tasks to specific agents.");
        return lines.join("\n");
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
