/**
 * @file Scans .claude/commands/ for markdown command files.
 *
 * Discovers slash commands defined as markdown files under `.claude/commands/`
 * and returns structured {@link CommandDefinition} metadata for each one.
 */

import { normalizePath, Vault } from "obsidian";
import { CommandDefinition } from "../types";
import { parseFrontmatter } from "../../utils/frontmatter";

const COMMANDS_BASE = ".claude/commands";

/**
 * Discovers command definitions from the vault's `.claude/commands/` folder.
 *
 * Each `.md` file in the folder becomes a slash command. The filename stem
 * (without the `.md` extension) is used as the command name. YAML frontmatter
 * fields `description` and `argument-hint` are extracted and surfaced via
 * the returned {@link CommandDefinition} objects.
 *
 * Missing directories and unreadable files are handled gracefully.
 */
export class CommandLoader {
  /**
   * @param vault - The Obsidian Vault instance used to traverse folders.
   */
  constructor(private readonly vault: Vault) {}

  /**
   * Scans `.claude/commands/` and returns a definition for each markdown file.
   *
   * If the directory does not exist an empty array is returned. Files that
   * cannot be read or parsed are logged with `console.warn` and skipped so
   * that a single bad entry never blocks the rest.
   *
   * @returns Array of parsed command definitions.
   */
  async loadCommands(): Promise<CommandDefinition[]> {
    const baseExists = await this.vault.adapter.exists(COMMANDS_BASE);
    if (!baseExists) {
      return [];
    }

    let listing: { files: string[]; folders: string[] };
    try {
      listing = await this.vault.adapter.list(COMMANDS_BASE);
    } catch (err) {
      console.warn(`[CommandLoader] Failed to list ${COMMANDS_BASE}:`, err);
      return [];
    }

    const commands: CommandDefinition[] = [];

    for (const filePath of listing.files) {
      if (!filePath.endsWith(".md")) {
        continue;
      }

      try {
        const normalized = normalizePath(filePath);
        const content = await this.vault.adapter.read(normalized);
        const { frontmatter } = parseFrontmatter(content);

        // Derive the command name from the file stem.
        const stem = filePath.split("/").pop() ?? filePath;
        const name = stem.endsWith(".md") ? stem.slice(0, -3) : stem;

        const description =
          typeof frontmatter["description"] === "string"
            ? frontmatter["description"]
            : "";

        const argumentHint =
          typeof frontmatter["argument-hint"] === "string"
            ? frontmatter["argument-hint"]
            : undefined;

        commands.push({ name, description, argumentHint, path: normalized });
      } catch (err) {
        console.warn(`[CommandLoader] Error loading command at "${filePath}":`, err);
      }
    }

    return commands;
  }
}
