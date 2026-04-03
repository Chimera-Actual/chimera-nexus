import { Modal, App, Setting, TFile, TFolder, normalizePath, Notice } from "obsidian";

/** Categories available for export/import */
const EXPORT_CATEGORIES: CategoryDef[] = [
  { key: "settings", label: "Plugin Settings", type: "settings" },
  { key: "claude-settings", label: ".claude/settings.json", type: "file", path: ".claude/settings.json" },
  { key: "agents", label: "Agents", type: "folder", path: ".claude/agents" },
  { key: "skills", label: "Skills", type: "folder", path: ".claude/skills" },
  { key: "commands", label: "Commands", type: "folder", path: ".claude/commands" },
  { key: "hooks", label: "Hooks", type: "folder", path: ".claude/hooks" },
  { key: "plugins", label: "Plugins", type: "folder", path: ".claude/plugins" },
  { key: "rules", label: "Rules", type: "folder", path: ".claude/rules" },
  { key: "output-styles", label: "Output Styles", type: "folder", path: ".claude/output-styles" },
  { key: "memory-system", label: "Memory - System", type: "folder", path: ".claude/memory/system" },
  { key: "memory-knowledge", label: "Memory - Knowledge", type: "folder", path: ".claude/memory/knowledge" },
  { key: "tasks", label: "Tasks", type: "folder", path: ".claude/tasks" },
];

interface CategoryDef {
  key: string;
  label: string;
  type: "settings" | "file" | "folder";
  path?: string;
}


/** Keys that must never be exported or imported */
const SENSITIVE_KEYS = ["apiKey", "claudeCliPathsByHost"];

interface ExportPayload {
  _chimeraNexusExport: 2;
  _exportedAt: string;
  settings?: Record<string, unknown>;
  files: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function collectFiles(vault: any, folderPath: string): TFile[] {
  const folder = vault.getAbstractFileByPath(normalizePath(folderPath));
  if (!folder || !(folder instanceof TFolder)) return [];
  const result: TFile[] = [];
  const walk = (dir: TFolder): void => {
    for (const child of dir.children) {
      if (child instanceof TFile) result.push(child);
      else if (child instanceof TFolder) walk(child);
    }
  };
  walk(folder);
  return result;
}

async function ensureFolderExists(vault: any, path: string): Promise<void> {
  const normalized = normalizePath(path);
  if (vault.getAbstractFileByPath(normalized)) return;
  const lastSlash = normalized.lastIndexOf("/");
  if (lastSlash > 0) {
    await ensureFolderExists(vault, normalized.substring(0, lastSlash));
  }
  try { await vault.createFolder(normalized); } catch { /* race condition */ }
}

function downloadJson(data: object, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function pickJsonFile(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) { resolve(null); return; }
      const text = await file.text();
      resolve(text);
    };
    input.click();
  });
}

function stripSensitive(obj: Record<string, unknown>): Record<string, unknown> {
  const copy = { ...obj };
  for (const key of SENSITIVE_KEYS) {
    delete copy[key];
  }
  return copy;
}

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (SENSITIVE_KEYS.includes(key)) continue;
    const srcVal = source[key];
    const tgtVal = result[key];
    if (
      srcVal && typeof srcVal === "object" && !Array.isArray(srcVal) &&
      tgtVal && typeof tgtVal === "object" && !Array.isArray(tgtVal)
    ) {
      result[key] = deepMerge(tgtVal as Record<string, unknown>, srcVal as Record<string, unknown>);
    } else {
      result[key] = srcVal;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Export Modal
// ---------------------------------------------------------------------------

class ExportModal extends Modal {
  private plugin: any;
  private selected: Record<string, boolean> = {};
  private counts: Record<string, number> = {};

  constructor(app: App, plugin: any) {
    super(app);
    this.plugin = plugin;
    this.containerEl.addClass("chimera-config-modal");
  }

  async onOpen(): Promise<void> {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Export Configuration" });

    // Compute counts
    for (const cat of EXPORT_CATEGORIES) {
      if (cat.type === "settings") {
        this.counts[cat.key] = 1;
      } else if (cat.type === "file") {
        const exists = this.app.vault.getAbstractFileByPath(normalizePath(cat.path!));
        this.counts[cat.key] = exists ? 1 : 0;
      } else {
        this.counts[cat.key] = collectFiles(this.app.vault, cat.path!).length;
      }
      this.selected[cat.key] = this.counts[cat.key] > 0;
    }

    // Render category toggles
    for (const cat of EXPORT_CATEGORIES) {
      const count = this.counts[cat.key];
      const disabled = count === 0;
      new Setting(contentEl)
        .setName(`${cat.label} (${count})`)
        .addToggle((toggle) => {
          toggle.setValue(this.selected[cat.key]);
          toggle.setDisabled(disabled);
          toggle.onChange((value) => {
            this.selected[cat.key] = value;
          });
        });
    }

    // Export button
    new Setting(contentEl)
      .addButton((btn) => {
        btn.setButtonText("Export").setCta();
        btn.onClick(() => this.doExport());
      });
  }

  private async doExport(): Promise<void> {
    const payload: ExportPayload = {
      _chimeraNexusExport: 2,
      _exportedAt: new Date().toISOString(),
      files: {},
    };

    for (const cat of EXPORT_CATEGORIES) {
      if (!this.selected[cat.key]) continue;

      if (cat.type === "settings") {
        payload.settings = stripSensitive({ ...this.plugin.settings });
        continue;
      }

      if (cat.type === "file") {
        const file = this.app.vault.getAbstractFileByPath(normalizePath(cat.path!));
        if (file && file instanceof TFile) {
          payload.files[cat.path!] = await this.app.vault.read(file);
        }
        continue;
      }

      // folder
      const files = collectFiles(this.app.vault, cat.path!);
      for (const f of files) {
        payload.files[f.path] = await this.app.vault.read(f);
      }
    }

    downloadJson(payload, "chimera-nexus-config.json");
    new Notice("Configuration exported.");
    this.close();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

// ---------------------------------------------------------------------------
// Import Modal
// ---------------------------------------------------------------------------

class ImportModal extends Modal {
  private plugin: any;
  private data: ExportPayload;
  private selected: Record<string, boolean> = {};
  private counts: Record<string, number> = {};
  private refreshSettings: () => void;

  constructor(app: App, plugin: any, data: ExportPayload, refreshSettings: () => void) {
    super(app);
    this.plugin = plugin;
    this.data = data;
    this.refreshSettings = refreshSettings;
    this.containerEl.addClass("chimera-config-modal");
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Import Configuration" });

    // Compute counts from the import payload
    for (const cat of EXPORT_CATEGORIES) {
      if (cat.type === "settings") {
        this.counts[cat.key] = this.data.settings ? 1 : 0;
      } else if (cat.type === "file") {
        this.counts[cat.key] = this.data.files[cat.path!] !== undefined ? 1 : 0;
      } else {
        const prefix = cat.path! + "/";
        this.counts[cat.key] = Object.keys(this.data.files).filter((p) => p.startsWith(prefix)).length;
      }
      this.selected[cat.key] = this.counts[cat.key] > 0;
    }

    // Render category toggles
    for (const cat of EXPORT_CATEGORIES) {
      const count = this.counts[cat.key];
      const disabled = count === 0;
      new Setting(contentEl)
        .setName(`${cat.label} (${count})`)
        .addToggle((toggle) => {
          toggle.setValue(this.selected[cat.key]);
          toggle.setDisabled(disabled);
          toggle.onChange((value) => {
            this.selected[cat.key] = value;
          });
        });
    }

    // Import button
    new Setting(contentEl)
      .addButton((btn) => {
        btn.setButtonText("Import").setCta();
        btn.onClick(() => this.doImport());
      });
  }

  private async doImport(): Promise<void> {
    let settingsMerged = false;
    let filesCreated = 0;
    let filesSkipped = 0;

    // Build set of file paths to import based on selected categories
    const selectedPaths = new Set<string>();
    for (const cat of EXPORT_CATEGORIES) {
      if (!this.selected[cat.key]) continue;

      if (cat.type === "settings" && this.data.settings) {
        // Merge settings, preserving sensitive keys and chimera sub-settings not in import
        const merged = deepMerge(this.plugin.settings, this.data.settings);
        // Restore sensitive keys from current settings
        for (const key of SENSITIVE_KEYS) {
          if (this.plugin.settings[key] !== undefined) {
            (merged as any)[key] = this.plugin.settings[key];
          }
        }
        // Preserve chimera sub-settings not present in import
        if (this.plugin.settings.chimera && !this.data.settings.chimera) {
          (merged as any).chimera = this.plugin.settings.chimera;
        }
        Object.assign(this.plugin.settings, merged);
        await this.plugin.saveSettings();
        settingsMerged = true;
        continue;
      }

      if (cat.type === "file") {
        if (this.data.files[cat.path!] !== undefined) {
          selectedPaths.add(cat.path!);
        }
        continue;
      }

      // folder
      const prefix = cat.path! + "/";
      for (const p of Object.keys(this.data.files)) {
        if (p.startsWith(prefix)) selectedPaths.add(p);
      }
    }

    // Write files, skipping existing
    for (const filePath of selectedPaths) {
      const normalized = normalizePath(filePath);
      const existing = this.app.vault.getAbstractFileByPath(normalized);
      if (existing) {
        filesSkipped++;
        continue;
      }
      // Ensure parent folder exists
      const lastSlash = normalized.lastIndexOf("/");
      if (lastSlash > 0) {
        await ensureFolderExists(this.app.vault, normalized.substring(0, lastSlash));
      }
      await this.app.vault.create(normalized, this.data.files[filePath]);
      filesCreated++;
    }

    // Build result message
    const parts: string[] = [];
    if (settingsMerged) parts.push("Settings merged");
    if (filesCreated > 0) parts.push(`${filesCreated} files created`);
    if (filesSkipped > 0) parts.push(`${filesSkipped} existing files kept`);
    if (parts.length === 0) parts.push("No changes made");

    new Notice(parts.join(". ") + ".");
    this.close();
    this.refreshSettings();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

// ---------------------------------------------------------------------------
// Settings section renderer
// ---------------------------------------------------------------------------

/**
 * Renders the Export / Import section in settings.
 * Called from settings-bridge.ts.
 */
export function renderConfigTransfer(containerEl: HTMLElement, plugin: any): void {
  new Setting(containerEl).setName("Export / Import").setHeading();

  containerEl.createEl("p", {
    cls: "setting-item-description",
    text: "Export your configuration to share with others or back up. Import a configuration file to restore settings and vault resources.",
  });

  new Setting(containerEl)
    .setName("Export Configuration")
    .setDesc("Select categories and download a JSON file with your settings and vault resources.")
    .addButton((btn: any) => {
      btn.setButtonText("Export");
      btn.onClick(() => {
        new ExportModal(plugin.app, plugin).open();
      });
    });

  new Setting(containerEl)
    .setName("Import Configuration")
    .setDesc("Load a previously exported JSON file. Existing files are kept; settings are merged.")
    .addButton((btn: any) => {
      btn.setButtonText("Import");
      btn.onClick(async () => {
        const text = await pickJsonFile();
        if (!text) return;

        let data: ExportPayload;
        try {
          data = JSON.parse(text);
        } catch {
          new Notice("Invalid JSON file.");
          return;
        }

        if (data._chimeraNexusExport !== 2) {
          new Notice("Not a valid Chimera Nexus configuration file.");
          return;
        }

        const refreshSettings = (): void => {
          // Re-render settings tab by triggering a setting tab change
          const settingTab = (plugin.app as any).setting;
          if (settingTab && settingTab.activeTab) {
            settingTab.activeTab.display();
          }
        };

        new ImportModal(plugin.app, plugin, data, refreshSettings).open();
      });
    });
}
