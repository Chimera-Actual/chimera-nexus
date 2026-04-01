/**
 * @file Discovers and loads .claude/plugins/ registries.
 *
 * Scans the vault's `.claude/plugins/` folder for plugin registry files and
 * registers their tool and capability definitions with the runtime.
 */

// TODO: Not yet implemented -- implement plugin registry discovery and registration.

import { Vault } from "obsidian";

/**
 * Discovers and registers plugin registries from `.claude/plugins/`.
 */
export class PluginLoader {
  /**
   * @param vault - The Obsidian Vault instance used to traverse folders.
   */
  constructor(private readonly vault: Vault) {}

  /**
   * Scans `.claude/plugins/` and loads all plugin registries found.
   */
  async loadPlugins(): Promise<void> {
    void this.vault;
    throw new Error("Not implemented");
  }
}
