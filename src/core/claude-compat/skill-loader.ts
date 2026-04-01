/**
 * @file Scans .claude/skills/ for directories with SKILL.md.
 *
 * Discovers skills installed under the vault's `.claude/skills/` folder and
 * returns structured {@link SkillDefinition} metadata for each one found.
 */

// TODO: Not yet implemented -- implement directory scan and SKILL.md parser.

import { Vault } from "obsidian";
import { SkillDefinition } from "../types";

/**
 * Discovers skill definitions from the vault's `.claude/skills/` folder.
 */
export class SkillLoader {
  /**
   * @param vault - The Obsidian Vault instance used to traverse folders.
   */
  constructor(private readonly vault: Vault) {}

  /**
   * Scans `.claude/skills/` and returns a definition for each skill folder
   * that contains a `SKILL.md` file.
   *
   * @returns Array of parsed skill definitions.
   */
  async loadSkills(): Promise<SkillDefinition[]> {
    void this.vault;
    throw new Error("Not implemented");
  }
}
