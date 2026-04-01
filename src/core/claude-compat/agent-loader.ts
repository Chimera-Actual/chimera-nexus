/**
 * @file Scans .claude/agents/ for agent definition markdown files.
 *
 * Discovers agent definitions stored as markdown notes under `.claude/agents/`
 * and parses their YAML frontmatter into {@link AgentDefinition} objects.
 */

// TODO: Not yet implemented -- implement directory scan and frontmatter parser.

import { Vault } from "obsidian";
import { AgentDefinition } from "../types";

/**
 * Discovers agent definitions from the vault's `.claude/agents/` folder.
 */
export class AgentLoader {
  /**
   * @param vault - The Obsidian Vault instance used to traverse folders.
   */
  constructor(private readonly vault: Vault) {}

  /**
   * Scans `.claude/agents/` and returns a definition for each agent note found.
   *
   * @returns Array of parsed agent definitions.
   */
  async loadAgents(): Promise<AgentDefinition[]> {
    void this.vault;
    throw new Error("Not implemented");
  }
}
