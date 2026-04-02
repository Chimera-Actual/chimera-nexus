/**
 * @file Scans .claude/skills/ for directories with SKILL.md.
 *
 * Discovers skills installed under the vault's `.claude/skills/` folder and
 * returns structured {@link SkillDefinition} metadata for each one found.
 */

import { Vault } from "obsidian";
import { SkillDefinition } from "../types";
import { parseFrontmatter } from "../../utils/frontmatter";

const SKILLS_BASE = ".claude/skills";

/**
 * Discovers skill definitions from the vault's `.claude/skills/` folder.
 *
 * Skills are subdirectories of `.claude/skills/` that contain a `SKILL.md`
 * file with optional YAML frontmatter supplying `name` and `description`.
 * This loader performs lazy discovery -- it reads only the frontmatter block
 * and does not return the full SKILL.md body.
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
   * Each folder's `SKILL.md` is read and its YAML frontmatter is parsed for
   * `name` and `description`. If `name` is absent from the frontmatter the
   * folder name is used as a fallback. The presence of `scripts/` and
   * `references/` sub-directories is detected and surfaced via the
   * `hasScripts` and `hasReferences` flags respectively.
   *
   * Missing or unreadable directories are handled gracefully: if the base
   * skills directory does not exist an empty array is returned, and errors
   * encountered while processing individual skill folders are logged and
   * skipped so that a single bad entry never blocks the rest.
   *
   * @returns Array of parsed skill definitions, one per discovered skill.
   */
  async loadSkills(): Promise<SkillDefinition[]> {
    const baseExists = await this.vault.adapter.exists(SKILLS_BASE);
    if (!baseExists) {
      return [];
    }

    let listing: { files: string[]; folders: string[] };
    try {
      listing = await this.vault.adapter.list(SKILLS_BASE);
    } catch (err) {
      console.warn(`[SkillLoader] Failed to list ${SKILLS_BASE}:`, err);
      return [];
    }

    const skills: SkillDefinition[] = [];

    for (const folderPath of listing.folders) {
      try {
        const skillMdPath = `${folderPath}/SKILL.md`;
        const hasMd = await this.vault.adapter.exists(skillMdPath);
        if (!hasMd) {
          continue;
        }

        // Derive the directory name from the folder path.
        const dirName = folderPath.split("/").pop() ?? folderPath;

        const content = await this.vault.adapter.read(skillMdPath);
        const { frontmatter } = parseFrontmatter(content);

        const name =
          typeof frontmatter["name"] === "string" && frontmatter["name"].trim() !== ""
            ? frontmatter["name"].trim()
            : dirName;

        const description =
          typeof frontmatter["description"] === "string"
            ? frontmatter["description"]
            : "";

        const hasScripts = await this.vault.adapter.exists(`${folderPath}/scripts`);
        const hasReferences = await this.vault.adapter.exists(
          `${folderPath}/references`
        );

        skills.push({
          name,
          description,
          path: folderPath,
          hasScripts,
          hasReferences,
        });
      } catch (err) {
        console.warn(`[SkillLoader] Error loading skill at "${folderPath}":`, err);
      }
    }

    // Second pass: scan skills from installed plugins in .claude/plugins/*/skills/
    const pluginsBase = ".claude/plugins";
    const pluginsExist = await this.vault.adapter.exists(pluginsBase);
    if (pluginsExist) {
      let pluginsListing: { files: string[]; folders: string[] };
      try {
        pluginsListing = await this.vault.adapter.list(pluginsBase);
      } catch (err) {
        console.warn(`[SkillLoader] Failed to list ${pluginsBase}:`, err);
        pluginsListing = { files: [], folders: [] };
      }

      for (const pluginPath of pluginsListing.folders) {
        const pluginDirName = pluginPath.split("/").pop() ?? pluginPath;

        // Skip the _marketplaces reserved directory.
        if (pluginDirName === "_marketplaces") {
          continue;
        }

        // Derive plugin name: prefer plugin.json, fall back to directory name.
        let pluginName = pluginDirName;
        const pluginJsonPath = `${pluginPath}/.claude-plugin/plugin.json`;
        const pluginJsonExists = await this.vault.adapter.exists(pluginJsonPath);
        if (pluginJsonExists) {
          try {
            const raw = await this.vault.adapter.read(pluginJsonPath);
            const manifest = JSON.parse(raw) as Record<string, unknown>;
            if (typeof manifest["name"] === "string" && manifest["name"].trim() !== "") {
              pluginName = manifest["name"].trim();
            }
          } catch (err) {
            console.warn(`[SkillLoader] Could not read plugin.json at "${pluginJsonPath}":`, err);
          }
        }

        // Scan the plugin's skills directory.
        const pluginSkillsPath = `${pluginPath}/skills`;
        const pluginSkillsExist = await this.vault.adapter.exists(pluginSkillsPath);
        if (!pluginSkillsExist) {
          continue;
        }

        let pluginSkillsListing: { files: string[]; folders: string[] };
        try {
          pluginSkillsListing = await this.vault.adapter.list(pluginSkillsPath);
        } catch (err) {
          console.warn(`[SkillLoader] Failed to list ${pluginSkillsPath}:`, err);
          continue;
        }

        for (const skillFolderPath of pluginSkillsListing.folders) {
          try {
            const skillMdPath = `${skillFolderPath}/SKILL.md`;
            const hasMd = await this.vault.adapter.exists(skillMdPath);
            if (!hasMd) {
              continue;
            }

            const rawName = skillFolderPath.split("/").pop() ?? skillFolderPath;
            const content = await this.vault.adapter.read(skillMdPath);
            const { frontmatter } = parseFrontmatter(content);

            const baseName =
              typeof frontmatter["name"] === "string" && frontmatter["name"].trim() !== ""
                ? frontmatter["name"].trim()
                : rawName;

            const description =
              typeof frontmatter["description"] === "string"
                ? frontmatter["description"]
                : "";

            const hasScripts = await this.vault.adapter.exists(`${skillFolderPath}/scripts`);
            const hasReferences = await this.vault.adapter.exists(
              `${skillFolderPath}/references`
            );

            skills.push({
              name: `${pluginName}:${baseName}`,
              description,
              path: skillFolderPath,
              hasScripts,
              hasReferences,
            });
          } catch (err) {
            console.warn(`[SkillLoader] Error loading plugin skill at "${skillFolderPath}":`, err);
          }
        }
      }
    }

    return skills;
  }
}
