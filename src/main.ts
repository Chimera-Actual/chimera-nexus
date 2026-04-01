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

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /**
   * Called by Obsidian when the plugin is enabled.
   *
   * Order of operations:
   * 1. Load persisted settings.
   * 2. Register the sidebar chat view.
   * 3. Register the ribbon icon.
   * 4. Register the command palette command.
   * 5. Register the settings tab.
   * 6. Initialise vault folder structure.
   */
  async onload(): Promise<void> {
    await this.loadSettings();

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
