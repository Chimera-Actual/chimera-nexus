import { Setting } from "obsidian";
import { renderSkillMarketplace } from "./skill-marketplace";
import { renderConfigTransfer } from "./config-transfer";

/**
 * Renders Chimera Nexus settings into Claudian's settings panel.
 * This is the bridge between Claudian's settings UI and Chimera's configuration.
 */
export function renderChimeraSettings(containerEl: HTMLElement, plugin: any): void {
  new Setting(containerEl).setName("Chimera Nexus").setHeading();

  containerEl.createEl("p", {
    cls: "setting-item-description",
    text: "Vault-native memory system that learns from your conversations and builds persistent context.",
  });

  const chimeraSettings = plugin.settings?.chimera ?? {};

  new Setting(containerEl)
    .setName("Enable Memory Context")
    .setDesc("Inject vault memory into every conversation's system prompt. Memory files are stored in .claude/memory/.")
    .addToggle((toggle: any) =>
      toggle.setValue(chimeraSettings.memoryEnabled ?? true).onChange(async (value: boolean) => {
        if (!plugin.settings.chimera) plugin.settings.chimera = {};
        plugin.settings.chimera.memoryEnabled = value;
        plugin.chimeraManager?.updateSettings({ memoryEnabled: value });
        await plugin.saveSettings();
      })
    );

  new Setting(containerEl)
    .setName("Auto-extract Memory")
    .setDesc("Automatically extract facts, corrections, and decisions from completed conversations into memory files.")
    .addToggle((toggle: any) =>
      toggle.setValue(chimeraSettings.autoMemory ?? true).onChange(async (value: boolean) => {
        if (!plugin.settings.chimera) plugin.settings.chimera = {};
        plugin.settings.chimera.autoMemory = value;
        plugin.chimeraManager?.updateSettings({ autoMemory: value });
        await plugin.saveSettings();
      })
    );

  new Setting(containerEl)
    .setName("Pinned Memory Budget")
    .setDesc("Maximum tokens allocated for pinned (always-loaded) memory files. Higher = more context but less room for conversation.")
    .addText((text: any) =>
      text
        .setPlaceholder("2000")
        .setValue(String(chimeraSettings.memoryPinnedBudget ?? 2000))
        .onChange(async (value: string) => {
          const num = parseInt(value, 10);
          if (!isNaN(num) && num > 0) {
            if (!plugin.settings.chimera) plugin.settings.chimera = {};
            plugin.settings.chimera.memoryPinnedBudget = num;
            plugin.chimeraManager?.updateSettings({ memoryPinnedBudget: num });
            await plugin.saveSettings();
          }
        })
    );

  new Setting(containerEl)
    .setName("Memory Tree Budget")
    .setDesc("Maximum tokens for the memory file index (shows file names + descriptions).")
    .addText((text: any) =>
      text
        .setPlaceholder("500")
        .setValue(String(chimeraSettings.memoryTreeBudget ?? 500))
        .onChange(async (value: string) => {
          const num = parseInt(value, 10);
          if (!isNaN(num) && num > 0) {
            if (!plugin.settings.chimera) plugin.settings.chimera = {};
            plugin.settings.chimera.memoryTreeBudget = num;
            plugin.chimeraManager?.updateSettings({ memoryTreeBudget: num });
            await plugin.saveSettings();
          }
        })
    );

  new Setting(containerEl)
    .setName("Dream Cycle")
    .setDesc("Enable periodic memory consolidation: removes stale entries, merges duplicates, and reorganizes files.")
    .addToggle((toggle: any) =>
      toggle.setValue(chimeraSettings.dreamEnabled ?? true).onChange(async (value: boolean) => {
        if (!plugin.settings.chimera) plugin.settings.chimera = {};
        plugin.settings.chimera.dreamEnabled = value;
        plugin.chimeraManager?.updateSettings({ dreamEnabled: value });
        await plugin.saveSettings();
      })
    );

  // Scheduler section
  new Setting(containerEl).setName("Scheduling").setHeading();

  containerEl.createEl("p", {
    cls: "setting-item-description",
    text: "Configure persistent tasks and session loops. Tasks run on cron schedules and survive restarts.",
  });

  new Setting(containerEl)
    .setName("View Scheduled Tasks")
    .setDesc("Tasks are defined as markdown files in .claude/tasks/")
    .addButton((btn: any) => {
      btn.setButtonText("Open Tasks Folder");
      btn.onClick(() => {
        const tasksPath = ".claude/tasks";
        plugin.app.workspace.openLinkText(tasksPath, "", false);
      });
    });

  new Setting(containerEl)
    .setName("Dream Cycle Interval")
    .setDesc("How often to check if memory consolidation should run (hours). Set 0 to disable.")
    .addText((text: any) => {
      text
        .setPlaceholder("1")
        .setValue(String(chimeraSettings.dreamIntervalHours ?? 1))
        .onChange(async (value: string) => {
          const num = parseInt(value, 10);
          if (!isNaN(num) && num >= 0) {
            if (!plugin.settings.chimera) plugin.settings.chimera = {};
            plugin.settings.chimera.dreamIntervalHours = num;
            await plugin.saveSettings();
          }
        });
    });

  // Remote Access section
  new Setting(containerEl).setName("Remote Access").setHeading();

  containerEl.createEl("p", {
    cls: "setting-item-description",
    text: "Access your Chimera Nexus sessions from other devices.",
  });

  new Setting(containerEl)
    .setName("Enable Remote Control")
    .setDesc("Make sessions available on claude.ai and the Claude mobile app. Requires Claude Max subscription.")
    .addToggle((toggle: any) =>
      toggle.setValue(plugin.settings.enableRemoteControl ?? false).onChange(async (value: boolean) => {
        plugin.settings.enableRemoteControl = value;
        await plugin.saveSettings();
      })
    );

  const vaultPath = (plugin.app.vault.adapter as any).basePath || "";
  renderSkillMarketplace(containerEl, vaultPath);

  // Export / Import section
  renderConfigTransfer(containerEl, plugin);
}
