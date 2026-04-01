/**
 * @file Scans .claude/commands/ for markdown command files.
 *
 * Discovers slash commands defined as markdown files under `.claude/commands/`
 * and returns structured {@link CommandDefinition} metadata for each one.
 */

// TODO: Not yet implemented -- implement directory scan and frontmatter parser.

import { Vault } from "obsidian";
import { CommandDefinition } from "../types";

/**
 * Discovers command definitions from the vault's `.claude/commands/` folder.
 */
export class CommandLoader {
  /**
   * @param vault - The Obsidian Vault instance used to traverse folders.
   */
  constructor(private readonly vault: Vault) {}

  /**
   * Scans `.claude/commands/` and returns a definition for each markdown file.
   *
   * @returns Array of parsed command definitions.
   */
  async loadCommands(): Promise<CommandDefinition[]> {
    void this.vault;
    throw new Error("Not implemented");
  }
}
