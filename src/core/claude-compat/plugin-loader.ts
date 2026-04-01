/**
 * @file Discovers and loads .claude/plugins/ registries.
 *
 * Scans the vault's `.claude/plugins/` folder for plugin registry files and
 * registers their tool and capability definitions with the runtime.
 */

import { Vault, TFolder } from "obsidian";

/**
 * Parsed manifest from a plugin's `plugin.json` file.
 */
export interface PluginManifest {
  /** Unique plugin name (matches the directory name by convention). */
  name: string;
  /** Human-readable description of the plugin. */
  description: string;
  /** Vault-relative path to the plugin directory. */
  path: string;
  /** Relative paths (from the plugin directory) to skill definitions. */
  skills: string[];
  /** Relative paths (from the plugin directory) to agent markdown files. */
  agents: string[];
  /** Hook event names registered by this plugin. */
  hooks: string[];
}

/** Raw JSON shape expected inside `plugin.json`. */
interface RawPluginJson {
  name?: unknown;
  description?: unknown;
  skills?: unknown;
  agents?: unknown;
  hooks?: unknown;
}

const PLUGINS_DIR = ".claude/plugins";

/**
 * Discovers and registers plugin registries from `.claude/plugins/`.
 *
 * Each plugin is a sub-directory containing a `plugin.json` manifest file
 * that describes the skills, agents, and hooks it contributes.
 */
export class PluginLoader {
  /**
   * @param vault - The Obsidian Vault instance used to traverse folders.
   */
  constructor(private readonly vault: Vault) {}

  /**
   * Scans `.claude/plugins/` and returns all valid plugin manifests found.
   *
   * Sub-directories that are missing `plugin.json` or contain malformed JSON
   * are silently skipped; every other entry produces a {@link PluginManifest}.
   *
   * @returns An array of loaded manifests (may be empty if the directory does
   *          not exist or contains no valid plugins).
   */
  async loadPlugins(): Promise<PluginManifest[]> {
    const pluginsFolder = this.vault.getFolderByPath(PLUGINS_DIR);
    if (!pluginsFolder) {
      return [];
    }

    const manifests: PluginManifest[] = [];

    for (const child of pluginsFolder.children) {
      if (!(child instanceof TFolder)) {
        continue;
      }

      const manifest = await this._loadManifest(child);
      if (manifest !== undefined) {
        manifests.push(manifest);
      }
    }

    return manifests;
  }

  /**
   * Finds a specific plugin by name.
   *
   * @param name - The plugin name to search for (must match the `name` field
   *               inside `plugin.json`, not necessarily the directory name).
   * @returns The matching {@link PluginManifest}, or `undefined` if not found.
   */
  async getPlugin(name: string): Promise<PluginManifest | undefined> {
    const all = await this.loadPlugins();
    return all.find((m) => m.name === name);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Reads and parses `plugin.json` from a plugin folder.
   *
   * @param folder - The TFolder representing the plugin directory.
   * @returns A {@link PluginManifest} on success, or `undefined` on any error.
   */
  private async _loadManifest(folder: TFolder): Promise<PluginManifest | undefined> {
    const manifestPath = `${folder.path}/plugin.json`;

    try {
      const file = this.vault.getFileByPath(manifestPath);
      if (!file) {
        return undefined;
      }

      const raw = await this.vault.read(file);
      const json = JSON.parse(raw) as RawPluginJson;

      if (typeof json.name !== "string" || typeof json.description !== "string") {
        return undefined;
      }

      return {
        name: json.name,
        description: json.description,
        path: folder.path,
        skills: this._toStringArray(json.skills),
        agents: this._toStringArray(json.agents),
        hooks: this._toStringArray(json.hooks),
      };
    } catch {
      // Missing file, JSON parse error, or vault read failure — skip silently.
      return undefined;
    }
  }

  /**
   * Coerces an unknown value to a `string[]`, filtering out non-string items.
   */
  private _toStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return (value as unknown[]).filter((v): v is string => typeof v === "string");
  }
}
