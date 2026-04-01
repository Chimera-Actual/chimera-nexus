/**
 * @file Reads and merges .claude/settings.json with ~/.claude/settings.json.
 *
 * Produces a {@link ResolvedClaudeSettings} object by deep-merging the global
 * user settings with any vault-local overrides, following the same precedence
 * rules as the Claude CLI.
 */

// TODO: Not yet implemented -- implement JSON load and deep-merge logic.

import { Vault } from "obsidian";
import { ResolvedClaudeSettings } from "../types";

/**
 * Loads and merges Claude settings from vault-local and global config files.
 */
export class SettingsLoader {
  /**
   * @param vault - The Obsidian Vault instance used to access vault-local files.
   */
  constructor(private readonly vault: Vault) {}

  /**
   * Reads both settings files and returns a merged {@link ResolvedClaudeSettings}.
   *
   * Vault-local settings take precedence over global user settings.
   *
   * @returns The merged Claude settings.
   */
  async loadSettings(): Promise<ResolvedClaudeSettings> {
    void this.vault;
    throw new Error("Not implemented");
  }
}
