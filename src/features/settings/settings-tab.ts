/**
 * @file Obsidian settings tab for Chimera Nexus.
 *
 * Registers all user-facing configuration options under the plugin's settings
 * page in Obsidian's Options panel. Sections: Connection Status,
 * Authentication, Memory, Agents, Security, and Advanced.
 */

import { exec } from "child_process";
import { App, Notice, PluginSettingTab, Setting, TFile, TFolder, normalizePath } from "obsidian";
import { ChimeraSettings, AuthMethod, DEFAULT_SETTINGS, PermissionMode } from "../../core/types";

/**
 * Minimal reference to the host plugin used to read and persist settings.
 * Declared as a local interface to avoid circular imports with main.ts.
 */
interface ChimeraNexusPluginRef {
  settings: ChimeraSettings;
  saveSettings(): Promise<void>;
}

/**
 * Settings tab displayed under Obsidian's Options > Chimera Nexus panel.
 *
 * Renders configuration sections with descriptive text, visual grouping, and
 * a connection status indicator at the top.
 */
export class ChimeraSettingsTab extends PluginSettingTab {
  private readonly plugin: ChimeraNexusPluginRef;

  constructor(app: App, plugin: ChimeraNexusPluginRef) {
    super(app, plugin as never);
    this.plugin = plugin;
  }

  /**
   * Renders the full settings UI into `this.containerEl`.
   *
   * Called by Obsidian when the tab is opened and re-called internally
   * whenever the auth method changes so that conditional fields are shown
   * or hidden without requiring a full settings reload.
   */
  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // -----------------------------------------------------------------------
    // Connection Status (top-level indicator)
    // -----------------------------------------------------------------------

    new Setting(containerEl).setHeading().setName("Connection Status");

    const connBox = containerEl.createDiv({ cls: "chimera-settings-connection-box" });
    const dotEl = connBox.createDiv({ cls: "chimera-connection-dot" });
    const connLabel = connBox.createEl("span");

    const settings = this.plugin.settings;
    if (settings.authMethod === AuthMethod.CLI) {
      dotEl.addClass("is-connected");
      connLabel.textContent = `CLI mode: ${settings.cliPath || "claude"}`;
    } else if (settings.authMethod === AuthMethod.APIKey && settings.apiKey) {
      dotEl.addClass("is-connected");
      connLabel.textContent = "API Key configured";
    } else {
      dotEl.addClass("is-disconnected");
      connLabel.textContent = "Not configured - choose an auth method below";
    }

    // Test Connection button (CLI only)
    if (settings.authMethod === AuthMethod.CLI) {
      const testBtn = connBox.createEl("button", {
        cls: "chimera-test-btn",
        text: "Test Connection",
      });
      testBtn.addEventListener("click", async () => {
        testBtn.textContent = "Testing...";
        testBtn.setAttribute("disabled", "true");
        try {
          await new Promise<void>((resolve, reject) => {
            exec(
              `${settings.cliPath || "claude"} --version`,
              { timeout: 10000 },
              (err: Error | null, stdout: string) => {
                if (err) {
                  reject(err);
                } else {
                  dotEl.className = "chimera-connection-dot is-connected";
                  connLabel.textContent = `CLI found: ${stdout.trim()}`;
                  resolve();
                }
              },
            );
          });
          testBtn.textContent = "Success";
        } catch (err) {
          dotEl.className = "chimera-connection-dot is-error";
          const msg = err instanceof Error ? err.message : String(err);
          connLabel.textContent = `CLI not found: ${msg}`;
          testBtn.textContent = "Failed";
        }
        setTimeout(() => {
          testBtn.textContent = "Test Connection";
          testBtn.removeAttribute("disabled");
        }, 3000);
      });
    }

    // -----------------------------------------------------------------------
    // Section 1: Authentication
    // -----------------------------------------------------------------------

    new Setting(containerEl).setHeading().setName("Authentication");

    containerEl.createEl("p", {
      cls: "chimera-settings-section-desc",
      text: "Choose how Chimera connects to Claude. The CLI method uses your locally installed Claude CLI credentials. The API Key method connects directly to the Anthropic API.",
    });

    new Setting(containerEl)
      .setName("Auth Method")
      .setDesc(
        "CLI: Uses the locally installed Claude CLI (recommended). " +
        "API Key: Direct connection using your Anthropic API key."
      )
      .addDropdown((dropdown) => {
        dropdown
          .addOption(AuthMethod.CLI, "Claude CLI")
          .addOption(AuthMethod.APIKey, "API Key")
          .setValue(this.plugin.settings.authMethod)
          .onChange(async (value: string) => {
            this.plugin.settings.authMethod = value as AuthMethod;
            await this.plugin.saveSettings();
            this.display();
          });
      });

    if (this.plugin.settings.authMethod === AuthMethod.APIKey) {
      new Setting(containerEl)
        .setName("API Key")
        .setDesc(
          "Your Anthropic API key (starts with sk-ant-). " +
          "Keep this secret - it is stored in your vault's plugin data."
        )
        .addText((text) => {
          text
            .setPlaceholder("sk-ant-...")
            .setValue(this.plugin.settings.apiKey)
            .onChange(async (value: string) => {
              this.plugin.settings.apiKey = value;
              await this.plugin.saveSettings();
            });
        });
    }

    if (this.plugin.settings.authMethod === AuthMethod.CLI) {
      new Setting(containerEl)
        .setName("CLI Path")
        .setDesc(
          "Path to the Claude CLI executable. " +
          "Use just \"claude\" if it is on your system PATH, or provide an absolute path."
        )
        .addText((text) => {
          text
            .setPlaceholder("claude")
            .setValue(this.plugin.settings.cliPath)
            .onChange(async (value: string) => {
              this.plugin.settings.cliPath = value;
              await this.plugin.saveSettings();
            });
        });
    }

    // -----------------------------------------------------------------------
    // Section 2: Security
    // -----------------------------------------------------------------------

    new Setting(containerEl).setHeading().setName("Security");

    containerEl.createEl("p", {
      cls: "chimera-settings-section-desc",
      text: "Control how much autonomy the agent has when executing operations in your vault.",
    });

    new Setting(containerEl)
      .setName("Default Permission Mode")
      .setDesc(
        "Ask before edits: Approval required for each edit. " +
        "Edit automatically: Auto-accepts file edits. " +
        "Plan mode: Presents a plan before editing. " +
        "Bypass permissions: No approval needed (use with caution)."
      )
      .addDropdown((dropdown) => {
        dropdown
          .addOption(PermissionMode.AskBeforeEdits, "Ask before edits")
          .addOption(PermissionMode.EditAutomatically, "Edit automatically")
          .addOption(PermissionMode.Plan, "Plan mode")
          .addOption(PermissionMode.BypassPermissions, "Bypass permissions")
          .setValue(this.plugin.settings.permissionMode)
          .onChange(async (value: string) => {
            this.plugin.settings.permissionMode = value as PermissionMode;
            await this.plugin.saveSettings();
          });
      });

    // -----------------------------------------------------------------------
    // Section 3: Memory
    // -----------------------------------------------------------------------

    new Setting(containerEl).setHeading().setName("Memory");

    containerEl.createEl("p", {
      cls: "chimera-settings-section-desc",
      text: "Configure how Chimera remembers context across sessions. Memory files are stored in your vault under .claude/memory/.",
    });

    new Setting(containerEl)
      .setName("Auto Memory")
      .setDesc(
        "Automatically extract and store important facts, preferences, and context " +
        "at the end of each session. Disable if you prefer manual memory management."
      )
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.autoMemory)
          .onChange(async (value: boolean) => {
            this.plugin.settings.autoMemory = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Dream Cycle")
      .setDesc(
        "Enable periodic background memory consolidation. " +
        "When active, Chimera compresses and organizes old session summaries to keep memory lean."
      )
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.dreamEnabled)
          .onChange(async (value: boolean) => {
            this.plugin.settings.dreamEnabled = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Pinned Memory Budget")
      .setDesc(
        "Maximum tokens reserved for pinned (always-loaded) memory files in each session's context window. " +
        "Higher values give more persistent context but leave less room for conversation."
      )
      .addText((text) => {
        text
          .setPlaceholder("2000")
          .setValue(String(this.plugin.settings.memoryPinnedBudget))
          .onChange(async (value: string) => {
            const parsed = parseInt(value, 10);
            if (!isNaN(parsed)) {
              this.plugin.settings.memoryPinnedBudget = parsed;
              await this.plugin.saveSettings();
            }
          });
      });

    new Setting(containerEl)
      .setName("Tree Index Budget")
      .setDesc(
        "Maximum tokens for the memory tree summary (file listing) injected into context. " +
        "This helps the agent know what memory files exist without loading them all."
      )
      .addText((text) => {
        text
          .setPlaceholder("500")
          .setValue(String(this.plugin.settings.memoryTreeBudget))
          .onChange(async (value: string) => {
            const parsed = parseInt(value, 10);
            if (!isNaN(parsed)) {
              this.plugin.settings.memoryTreeBudget = parsed;
              await this.plugin.saveSettings();
            }
          });
      });

    // -----------------------------------------------------------------------
    // Section 4: Agents
    // -----------------------------------------------------------------------

    new Setting(containerEl).setHeading().setName("Agents");

    containerEl.createEl("p", {
      cls: "chimera-settings-section-desc",
      text: "Agent definitions are loaded from .claude/agents/ in your vault. Each agent is a markdown file with YAML frontmatter defining its persona, tools, and behavior.",
    });

    new Setting(containerEl)
      .setName("Max Concurrent Sessions")
      .setDesc(
        "Maximum number of agent sessions that can run simultaneously. " +
        "Increase if you frequently use background agents or @mentions to multiple agents."
      )
      .addText((text) => {
        text
          .setPlaceholder("2")
          .setValue(String(this.plugin.settings.maxConcurrentSessions))
          .onChange(async (value: string) => {
            const parsed = parseInt(value, 10);
            if (!isNaN(parsed)) {
              this.plugin.settings.maxConcurrentSessions = parsed;
              await this.plugin.saveSettings();
            }
          });
      });

    // -----------------------------------------------------------------------
    // Section 5: Plugins
    // -----------------------------------------------------------------------

    new Setting(containerEl).setHeading().setName("Plugins");

    containerEl.createEl("p", {
      cls: "chimera-settings-section-desc",
      text: "CC-compatible plugins are discovered from .claude/plugins/ in your vault. Use /plugin in chat to install, update, discover, and manage plugins.",
    });

    new Setting(containerEl)
      .setName("Plugin management")
      .setDesc(
        "Use /plugin in chat to browse marketplaces, install plugins, and manage installed plugins. " +
        "Installed plugins provide skills, agents, hooks, and MCP server configurations."
      );

    // -----------------------------------------------------------------------
    // Section 6: Advanced
    // -----------------------------------------------------------------------

    new Setting(containerEl).setHeading().setName("Advanced");

    containerEl.createEl("p", {
      cls: "chimera-settings-section-desc",
      text: "Additional configuration for personalization and content filtering.",
    });

    new Setting(containerEl)
      .setName("User Name")
      .setDesc(
        "Your preferred display name. Injected as {{userName}} in agent system prompts " +
        "and templates so the agent can address you personally."
      )
      .addText((text) => {
        text
          .setPlaceholder("Your name")
          .setValue(this.plugin.settings.userName)
          .onChange(async (value: string) => {
            this.plugin.settings.userName = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Excluded Tags")
      .setDesc(
        "Comma-separated list of tags. Notes with these tags will be excluded from " +
        "memory indexing and session processing. Useful for private or draft content."
      )
      .addText((text) => {
        text
          .setPlaceholder("#private, #draft")
          .setValue(this.plugin.settings.excludedTags.join(", "))
          .onChange(async (value: string) => {
            this.plugin.settings.excludedTags = value
              .split(",")
              .map((tag) => tag.trim())
              .filter((tag) => tag.length > 0);
            await this.plugin.saveSettings();
          });
      });

    // -----------------------------------------------------------------------
    // Section 6: Export / Import
    // -----------------------------------------------------------------------

    new Setting(containerEl).setHeading().setName("Export / Import");

    containerEl.createEl("p", {
      cls: "chimera-settings-section-desc",
      text:
        "Export your full Chimera configuration -- plugin settings plus portable " +
        ".claude/ files (agents, skills, commands, hooks, rules, memory, tasks). " +
        "API keys and session history are excluded for security and privacy.",
    });

    new Setting(containerEl)
      .setName("Export Configuration")
      .setDesc(
        "Download plugin settings and all portable .claude/ files as a single JSON file."
      )
      .addButton((btn) => {
        btn.setButtonText("Export").onClick(async () => {
          btn.setDisabled(true);
          btn.setButtonText("Exporting...");
          try {
            await this.exportConfiguration();
          } finally {
            btn.setDisabled(false);
            btn.setButtonText("Export");
          }
        });
      });

    new Setting(containerEl)
      .setName("Import Configuration")
      .setDesc(
        "Load a previously exported JSON file. Plugin settings are merged (API key preserved). " +
        "Existing .claude/ files are kept; only missing files are created."
      )
      .addButton((btn) => {
        btn.setButtonText("Import").onClick(() => {
          this.importConfiguration();
        });
      });
  }

  // -------------------------------------------------------------------------
  // Export / Import helpers
  // -------------------------------------------------------------------------

  /**
   * Directories inside `.claude/` that are portable across vaults. Everything
   * else (sessions, task-logs, agent-memory, swarm-runs, backups, reflections)
   * is personal or ephemeral and excluded from export.
   */
  private static readonly PORTABLE_DIRS = [
    ".claude/settings.json",
    ".claude/agents",
    ".claude/skills",
    ".claude/commands",
    ".claude/hooks",
    ".claude/plugins",
    ".claude/rules",
    ".claude/output-styles",
    ".claude/memory/system",
    ".claude/memory/knowledge",
    ".claude/tasks",
  ];

  /**
   * Recursively collects all files under `folderPath` in the vault.
   */
  private collectFiles(folderPath: string): TFile[] {
    const result: TFile[] = [];
    const folder = this.app.vault.getAbstractFileByPath(
      normalizePath(folderPath)
    );
    if (!folder || !(folder instanceof TFolder)) return result;

    const walk = (dir: TFolder): void => {
      for (const child of dir.children) {
        if (child instanceof TFile) {
          result.push(child);
        } else if (child instanceof TFolder) {
          walk(child);
        }
      }
    };
    walk(folder);
    return result;
  }

  /**
   * Builds the export bundle and triggers a browser download.
   */
  private async exportConfiguration(): Promise<void> {
    const settings: Record<string, unknown> = { ...this.plugin.settings };
    delete settings.apiKey;

    // Collect portable .claude/ files
    const files: Record<string, string> = {};
    for (const entry of ChimeraSettingsTab.PORTABLE_DIRS) {
      const normalized = normalizePath(entry);
      const abstract = this.app.vault.getAbstractFileByPath(normalized);

      if (abstract instanceof TFile) {
        // Single file (e.g. settings.json)
        files[normalized] = await this.app.vault.read(abstract);
      } else if (abstract instanceof TFolder) {
        // Directory -- collect all files recursively
        for (const f of this.collectFiles(normalized)) {
          files[f.path] = await this.app.vault.read(f);
        }
      }
      // If the path doesn't exist, just skip it
    }

    const bundle = {
      _chimeraNexusExport: 2,
      _exportedAt: new Date().toISOString(),
      settings,
      files,
    };

    const blob = new Blob([JSON.stringify(bundle, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "chimera-nexus-config.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    const fileCount = Object.keys(files).length;
    new Notice(`Exported settings + ${fileCount} .claude/ files.`);
  }

  /**
   * Opens a file picker, validates the bundle, merges settings, and writes
   * any missing `.claude/` files into the vault.
   */
  private importConfiguration(): void {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";

    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const bundle = JSON.parse(text) as Record<string, unknown>;

        // Support both v1 (settings-only) and v2 (full config) exports
        if (!bundle._chimeraNexusExport) {
          new Notice("Invalid file: not a Chimera Nexus export.");
          return;
        }

        // ------------------------------------------------------------------
        // 1. Merge plugin settings
        // ------------------------------------------------------------------
        const importedSettings =
          (bundle.settings as Record<string, unknown> | undefined) ?? {};

        // v1 exports stored settings at the top level (no .settings key)
        const settingsSource =
          bundle._chimeraNexusExport === 2
            ? importedSettings
            : (() => {
                const copy = { ...bundle };
                delete copy._chimeraNexusExport;
                delete copy._exportedAt;
                delete copy.files;
                return copy;
              })();

        const currentApiKey = this.plugin.settings.apiKey;
        const merged = Object.assign(
          {},
          DEFAULT_SETTINGS,
          settingsSource,
          { apiKey: currentApiKey }
        ) as ChimeraSettings;

        Object.assign(this.plugin.settings, merged);
        await this.plugin.saveSettings();

        // ------------------------------------------------------------------
        // 2. Write .claude/ files (skip existing)
        // ------------------------------------------------------------------
        const importedFiles =
          (bundle.files as Record<string, string> | undefined) ?? {};

        let created = 0;
        let skipped = 0;

        for (const [path, content] of Object.entries(importedFiles)) {
          const normalized = normalizePath(path);
          const exists = this.app.vault.getAbstractFileByPath(normalized);

          if (exists) {
            skipped++;
            continue;
          }

          // Ensure parent folders exist
          const lastSlash = normalized.lastIndexOf("/");
          if (lastSlash > 0) {
            const parentPath = normalized.substring(0, lastSlash);
            await this.ensureFolderRecursive(parentPath);
          }

          await this.app.vault.create(normalized, content);
          created++;
        }

        // Re-render settings UI
        this.display();

        const parts = [`Settings merged.`];
        if (created > 0) parts.push(`${created} files created.`);
        if (skipped > 0) parts.push(`${skipped} existing files kept.`);
        new Notice(parts.join(" "));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        new Notice(`Import failed: ${msg}`);
      }
    });

    input.click();
  }

  /**
   * Recursively creates all folders in `path` that don't exist yet.
   */
  private async ensureFolderRecursive(path: string): Promise<void> {
    const normalized = normalizePath(path);
    if (this.app.vault.getAbstractFileByPath(normalized)) return;

    // Ensure parent exists first
    const lastSlash = normalized.lastIndexOf("/");
    if (lastSlash > 0) {
      await this.ensureFolderRecursive(normalized.substring(0, lastSlash));
    }

    try {
      await this.app.vault.createFolder(normalized);
    } catch {
      // Folder may have been created by a parallel call
    }
  }
}
