/**
 * @file Obsidian settings tab for Chimera Nexus.
 *
 * Registers all user-facing configuration options under the plugin's settings
 * page in Obsidian's Options panel. Sections: Connection Status,
 * Authentication, Memory, Agents, Security, and Advanced.
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
          const { exec } = require("child_process") as typeof import("child_process");
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
      .setName("Permission Mode")
      .setDesc(
        "Safe: Asks permission before any write operations. " +
        "Plan: Can plan freely, asks before executing changes. " +
        "YOLO: All operations auto-approved (use with caution)."
      )
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
    // Section 5: Advanced
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
  }
}
