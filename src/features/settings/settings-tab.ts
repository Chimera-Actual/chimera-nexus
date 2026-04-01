/**
 * @file Obsidian settings tab for Chimera Nexus.
 *
 * Registers all user-facing configuration options under the plugin's settings
 * page in Obsidian's Options panel. Sections: Authentication, Memory, Agents,
 * Security, and Advanced.
 */

import { App, PluginSettingTab, Setting } from "obsidian";
import { ChimeraSettings, AuthMethod, PermissionMode } from "../../core/types";

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
 * Renders five configuration sections: Authentication, Memory, Agents,
 * Security, and Advanced. Conditional fields (API key vs. CLI path) are
 * handled by clearing the container and re-rendering on auth method change.
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
    // Section 1: Authentication
    // -----------------------------------------------------------------------

    containerEl.createEl("h2", { text: "Authentication" });

    new Setting(containerEl)
      .setName("Auth Method")
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
    // Section 2: Memory
    // -----------------------------------------------------------------------

    containerEl.createEl("h2", { text: "Memory" });

    new Setting(containerEl)
      .setName("Auto Memory")
      .setDesc("Automatically extract and store memory after each session")
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
      .setDesc("Enable periodic memory consolidation")
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
      .setDesc("Max tokens for pinned memory (default 2000)")
      .addText((text) => {
        text
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
      .setDesc("Max tokens for memory tree index (default 500)")
      .addText((text) => {
        text
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
    // Section 3: Agents
    // -----------------------------------------------------------------------

    containerEl.createEl("h2", { text: "Agents" });

    new Setting(containerEl)
      .setName("Max Concurrent Sessions")
      .setDesc("Maximum simultaneous agent sessions (default 2)")
      .addText((text) => {
        text
          .setValue(String(this.plugin.settings.maxConcurrentSessions))
          .onChange(async (value: string) => {
            const parsed = parseInt(value, 10);
            if (!isNaN(parsed)) {
              this.plugin.settings.maxConcurrentSessions = parsed;
              await this.plugin.saveSettings();
            }
          });
      });

    containerEl.createEl("p", {
      text: "Agent definitions are loaded from .claude/agents/ in your vault.",
    });

    // -----------------------------------------------------------------------
    // Section 4: Security
    // -----------------------------------------------------------------------

    containerEl.createEl("h2", { text: "Security" });

    new Setting(containerEl)
      .setName("Permission Mode")
      .addDropdown((dropdown) => {
        dropdown
          .addOption(PermissionMode.Safe, "Safe")
          .addOption(PermissionMode.Plan, "Plan")
          .addOption(PermissionMode.YOLO, "YOLO")
          .setValue(this.plugin.settings.permissionMode)
          .onChange(async (value: string) => {
            this.plugin.settings.permissionMode = value as PermissionMode;
            await this.plugin.saveSettings();
          });
      });

    // -----------------------------------------------------------------------
    // Section 5: Advanced
    // -----------------------------------------------------------------------

    containerEl.createEl("h2", { text: "Advanced" });

    new Setting(containerEl)
      .setName("User Name")
      .setDesc(
        "Your name, injected as {{userName}} in templates"
      )
      .addText((text) => {
        text
          .setValue(this.plugin.settings.userName)
          .onChange(async (value: string) => {
            this.plugin.settings.userName = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Excluded Tags")
      .setDesc(
        "Comma-separated tags to exclude from memory indexing"
      )
      .addText((text) => {
        text
          .setValue(this.plugin.settings.excludedTags.join(", "))
          .onChange(async (value: string) => {
            this.plugin.settings.excludedTags = value
              .split(",")
              .map((tag) => tag.trim())
              .filter((tag) => tag.length > 0);
            await this.plugin.saveSettings();
          });
      });
  }
}
