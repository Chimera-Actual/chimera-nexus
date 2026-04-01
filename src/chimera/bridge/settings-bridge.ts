import { Setting } from "obsidian";

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
}
