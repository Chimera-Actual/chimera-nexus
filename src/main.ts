/**
 * @file Chimera Nexus plugin entry point.
 *
 * Bootstraps the Obsidian plugin: registers views, commands, ribbon icons,
 * settings, and initialises the vault folder structure on first run.
 */

import { Notice, Plugin, normalizePath } from "obsidian";

import { ChimeraSettings, DEFAULT_SETTINGS } from "./core/types";
import { ChimeraSettingsTab } from "./features/settings/settings-tab";
import { ChimeraChatView, VIEW_TYPE_CHIMERA_CHAT } from "./features/chat/chat-view";
import { SdkWrapper } from "./core/runtime/sdk-wrapper";
import { MemoryInjector } from "./core/memory/memory-injector";
import { MemoryExtractor } from "./core/memory/memory-extractor";
import { SessionSummarizer } from "./core/memory/session-summarizer";
import { SessionStore } from "./features/sessions/session-store";
import { SessionIndex } from "./features/sessions/session-index";
import { AgentLoader } from "./core/claude-compat/agent-loader";
import { SettingsLoader } from "./core/claude-compat/settings-loader";
import { HookManager } from "./core/claude-compat/hook-manager";
import { SlashCommandRegistry } from "./commands/slash-commands";
import { CommandLoader } from "./core/claude-compat/command-loader";

// ---------------------------------------------------------------------------
// Plugin class
// ---------------------------------------------------------------------------

/**
 * Top-level Obsidian plugin class for Chimera Nexus.
 *
 * Responsible for initialising all subsystems and cleanly tearing them down
 * when the plugin is disabled.
 */
export default class ChimeraNexusPlugin extends Plugin {
  /** Resolved plugin settings, loaded from `data.json` on startup. */
  settings!: ChimeraSettings;

  /** Wrapper around the Claude CLI and Anthropic SDK for sending messages. */
  sdkWrapper!: SdkWrapper;

  /** Builds the system prompt context from vault memory files. */
  memoryInjector!: MemoryInjector;

  /** Extracts memory signals from completed session transcripts. */
  memoryExtractor!: MemoryExtractor;

  /** Produces condensed summaries from completed sessions. */
  sessionSummarizer!: SessionSummarizer;

  /** Reads and writes full session records as vault notes. */
  sessionStore!: SessionStore;

  /** Manages the lightweight session index cache. */
  sessionIndex!: SessionIndex;

  /** Discovers agent definitions from the vault agents folder. */
  agentLoader!: AgentLoader;

  /** Loads and merges Claude settings from vault and global config files. */
  settingsLoader!: SettingsLoader;

  /** Registers and fires lifecycle hook handlers. */
  hookManager!: HookManager;

  /** Central registry for built-in and CC slash commands. */
  slashCommands!: SlashCommandRegistry;

  /** Discovers command definitions from the vault commands folder. */
  commandLoader!: CommandLoader;

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /**
   * Called by Obsidian when the plugin is enabled.
   *
   * Order of operations:
   * 1. Load persisted settings.
   * 2. Initialise core modules.
   * 3. Register the sidebar chat view.
   * 4. Register the ribbon icon.
   * 5. Register the command palette command.
   * 6. Register the settings tab.
   * 7. Initialise vault folder structure.
   * 8. Load Claude Code settings and hooks.
   * 9. Rebuild the session index.
   */
  async onload(): Promise<void> {
    await this.loadSettings();

    // Initialise core modules.
    this.sdkWrapper = new SdkWrapper(this.settings);
    this.memoryInjector = new MemoryInjector(this.app.vault, this.settings);
    this.memoryExtractor = new MemoryExtractor(this.app.vault);
    this.sessionSummarizer = new SessionSummarizer();
    this.sessionStore = new SessionStore(this.app.vault);
    this.sessionIndex = new SessionIndex(this.app.vault);
    this.agentLoader = new AgentLoader(this.app.vault);
    this.settingsLoader = new SettingsLoader(this.app.vault);
    this.hookManager = new HookManager();

    // Register the sidebar view type.
    this.registerView(
      VIEW_TYPE_CHIMERA_CHAT,
      (leaf) => new ChimeraChatView(leaf, this),
    );

    // Ribbon icon - opens the chat sidebar.
    this.addRibbonIcon("bot", "Open Chimera Nexus", () => {
      this.activateView();
    });

    // Command palette entry.
    this.addCommand({
      id: "chimera-nexus:open-chat",
      name: "Open Chimera Nexus",
      callback: () => {
        this.activateView();
      },
    });

    // Settings tab.
    this.addSettingTab(new ChimeraSettingsTab(this.app, this));

    // Ensure the vault folder structure exists.
    await this.initVaultStructure();

    // Load Claude Code settings and initialize hooks.
    try {
      const resolvedSettings = await this.settingsLoader.loadSettings();
      this.hookManager.loadHooks(resolvedSettings.hooks);
    } catch (err) {
      console.warn("Failed to load Claude Code settings:", err);
    }

    // Initialize slash commands.
    this.commandLoader = new CommandLoader(this.app.vault);
    this.slashCommands = new SlashCommandRegistry(this.app.vault, this.settings);
    this.slashCommands.registerBuiltins();
    try {
      await this.slashCommands.registerCCCommands();
    } catch (err) {
      console.warn("Failed to load CC commands:", err);
    }

    // Rebuild session index on startup.
    try {
      await this.sessionIndex.load();
      await this.sessionIndex.rebuildIndex();
    } catch (err) {
      console.warn("Failed to rebuild session index:", err);
    }

    console.log("Chimera Nexus loaded");
  }

  /**
   * Called by Obsidian when the plugin is disabled or the app closes.
   */
  onunload(): void {
    console.log("Chimera Nexus unloaded");
  }

  // -------------------------------------------------------------------------
  // Settings
  // -------------------------------------------------------------------------

  /**
   * Loads settings from Obsidian's persisted `data.json`, merging in any
   * missing keys from {@link DEFAULT_SETTINGS}.
   */
  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  /**
   * Persists the current {@link settings} object to Obsidian's `data.json`.
   */
  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  // -------------------------------------------------------------------------
  // Vault structure
  // -------------------------------------------------------------------------

  /**
   * Creates the required `.claude/**` directory tree inside the vault if the
   * directories do not already exist.
   *
   * Also writes a small set of starter memory files on first run (never
   * overwrites existing files).
   */
  async initVaultStructure(): Promise<void> {
    const dirs = [
      ".claude",
      ".claude/skills",
      ".claude/agents",
      ".claude/commands",
      ".claude/plugins",
      ".claude/hooks",
      ".claude/rules",
      ".claude/output-styles",
      ".claude/memory",
      ".claude/memory/system",
      ".claude/memory/knowledge",
      ".claude/memory/reflections",
      ".claude/memory/sessions",
      ".claude/sessions",
      ".claude/tasks",
      ".claude/task-logs",
      ".claude/agent-memory",
      ".claude/swarm-runs",
      ".claude/backups",
    ];

    for (const dir of dirs) {
      try {
        const normalised = normalizePath(dir);
        const exists = await this.app.vault.adapter.exists(normalised);
        if (!exists) {
          await this.app.vault.createFolder(normalised);
        }
      } catch (err) {
        console.error(`Chimera Nexus: failed to create folder "${dir}"`, err);
        new Notice(`Chimera Nexus: could not create folder "${dir}". Check console for details.`);
      }
    }

    // Starter memory files - written ONLY if they do not already exist.
    const starterFiles: Array<{ path: string; content: string }> = [
      {
        path: ".claude/memory/system/identity.md",
        content: [
          "---",
          "description: Agent identity and persona",
          "memtype: system",
          "pinned: true",
          "tags:",
          "  - chimera/memory",
          "---",
          "",
          "# Identity",
          "",
          "Describe your agent's persona and working style here.",
        ].join("\n"),
      },
      {
        path: ".claude/memory/system/human.md",
        content: [
          "---",
          "description: Facts about the user",
          "memtype: system",
          "pinned: true",
          "---",
          "",
          "# Human",
          "",
          "Record facts about the user: name, role, preferences.",
        ].join("\n"),
      },
      {
        path: ".claude/memory/system/vault-conventions.md",
        content: [
          "---",
          "description: Vault structure rules and naming conventions",
          "memtype: system",
          "pinned: true",
          "---",
          "",
          "# Vault Conventions",
          "",
          "Document folder structure, naming rules, and tag taxonomy.",
        ].join("\n"),
      },
    ];

    for (const file of starterFiles) {
      try {
        const normalised = normalizePath(file.path);
        const exists = await this.app.vault.adapter.exists(normalised);
        if (!exists) {
          await this.app.vault.create(normalised, file.content);
        }
      } catch (err) {
        console.error(`Chimera Nexus: failed to create starter file "${file.path}"`, err);
        new Notice(`Chimera Nexus: could not create "${file.path}". Check console for details.`);
      }
    }
  }

  // -------------------------------------------------------------------------
  // View helpers
  // -------------------------------------------------------------------------

  /**
   * Opens the Chimera Nexus chat sidebar, revealing an existing leaf or
   * creating a new one in the right sidebar.
   */
  private async activateView(): Promise<void> {
    const { workspace } = this.app;

    let leaf = workspace.getLeavesOfType(VIEW_TYPE_CHIMERA_CHAT)[0];

    if (!leaf) {
      const rightLeaf = workspace.getRightLeaf(false);
      if (rightLeaf) {
        await rightLeaf.setViewState({ type: VIEW_TYPE_CHIMERA_CHAT, active: true });
        leaf = rightLeaf;
      }
    }

    if (leaf) {
      workspace.revealLeaf(leaf);
    }
  }
}
