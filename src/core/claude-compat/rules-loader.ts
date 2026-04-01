/**
 * @file Scans .claude/rules/ for markdown rule files with file-pattern matching.
 *
 * Each rule file pairs a glob pattern (from its frontmatter) with markdown
 * content that is injected into the system prompt when the pattern matches
 * files involved in the current session.
 */

// TODO: Not yet implemented -- implement directory scan and pattern extraction.

import { Vault } from "obsidian";

/**
 * Discovers rule definitions from the vault's `.claude/rules/` folder.
 */
export class RulesLoader {
  /**
   * @param vault - The Obsidian Vault instance used to traverse folders.
   */
  constructor(private readonly vault: Vault) {}

  /**
   * Scans `.claude/rules/` and returns each rule's glob pattern and content.
   *
   * @returns Array of `{ pattern, content }` objects parsed from rule files.
   */
  async loadRules(): Promise<Array<{ pattern: string; content: string }>> {
    void this.vault;
    throw new Error("Not implemented");
  }
}
