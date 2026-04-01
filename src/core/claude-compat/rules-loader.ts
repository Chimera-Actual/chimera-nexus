/**
 * @file Scans .claude/rules/ for markdown rule files with file-pattern matching.
 *
 * Each rule file pairs a glob pattern (from its frontmatter) with markdown
 * content that is injected into the system prompt when the pattern matches
 * files involved in the current session.
 */

import { normalizePath, Vault } from "obsidian";
import { parseFrontmatter } from "../../utils/frontmatter";

const RULES_BASE = ".claude/rules";

/**
 * Discovers rule definitions from the vault's `.claude/rules/` folder.
 *
 * Each `.md` file in the folder is treated as a rule. The `pattern` field in
 * its YAML frontmatter specifies a glob that controls which files trigger the
 * rule. If no `pattern` is present, `**\/*` is used as a catch-all. The
 * markdown body after the frontmatter block is the rule text.
 *
 * Missing directories and unreadable files are handled gracefully.
 */
export class RulesLoader {
  /**
   * @param vault - The Obsidian Vault instance used to traverse folders.
   */
  constructor(private readonly vault: Vault) {}

  /**
   * Scans `.claude/rules/` and returns each rule's glob pattern and content.
   *
   * If the directory does not exist an empty array is returned. Files that
   * cannot be read or parsed are logged with `console.warn` and skipped so
   * that a single bad entry never blocks the rest.
   *
   * @returns Array of `{ pattern, content }` objects parsed from rule files.
   */
  async loadRules(): Promise<Array<{ pattern: string; content: string }>> {
    const baseExists = await this.vault.adapter.exists(RULES_BASE);
    if (!baseExists) {
      return [];
    }

    let listing: { files: string[]; folders: string[] };
    try {
      listing = await this.vault.adapter.list(RULES_BASE);
    } catch (err) {
      console.warn(`[RulesLoader] Failed to list ${RULES_BASE}:`, err);
      return [];
    }

    const rules: Array<{ pattern: string; content: string }> = [];

    for (const filePath of listing.files) {
      if (!filePath.endsWith(".md")) {
        continue;
      }

      try {
        const normalized = normalizePath(filePath);
        const content = await this.vault.adapter.read(normalized);
        const { frontmatter, body } = parseFrontmatter(content);

        const pattern =
          typeof frontmatter["pattern"] === "string" &&
          frontmatter["pattern"].trim() !== ""
            ? frontmatter["pattern"].trim()
            : "**/*";

        rules.push({ pattern, content: body });
      } catch (err) {
        console.warn(`[RulesLoader] Error loading rule at "${filePath}":`, err);
      }
    }

    return rules;
  }
}
