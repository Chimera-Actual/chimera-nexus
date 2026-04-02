/**
 * @file Discovers and loads .claude/plugins/ registries (CC-compatible).
 *
 * Scans the vault's `.claude/plugins/` folder for plugin directories. Each
 * plugin may contain a `.claude-plugin/plugin.json` manifest. If no manifest
 * is found, the loader falls back to auto-discovery using the directory name
 * and by scanning for conventional `skills/` and `agents/` sub-directories.
 */

import { Vault } from "obsidian";
import { PluginManifest } from "../types";

const PLUGINS_DIR = ".claude/plugins";
const MANIFEST_SUBDIR = ".claude-plugin";
const MANIFEST_FILE = "plugin.json";

/**
 * Raw JSON shape expected inside `.claude-plugin/plugin.json`.
 * All fields are `unknown` until validated.
 */
interface RawManifest {
  name?: unknown;
  version?: unknown;
  description?: unknown;
  author?: unknown;
  homepage?: unknown;
  repository?: unknown;
  license?: unknown;
  keywords?: unknown;
  commands?: unknown;
  agents?: unknown;
  skills?: unknown;
  hooks?: unknown;
  mcpServers?: unknown;
  outputStyles?: unknown;
  userConfig?: unknown;
  settings?: unknown;
}

/**
 * Discovers and registers plugin registries from `.claude/plugins/`.
 *
 * Each plugin is a sub-directory that either contains a
 * `.claude-plugin/plugin.json` manifest, or can be auto-discovered by
 * scanning for conventional `skills/` and `agents/` sub-directories.
 */
export class PluginLoader {
  /**
   * @param vault - The Obsidian Vault instance used to access the filesystem.
   */
  constructor(private readonly vault: Vault) {}

  /**
   * Scans `.claude/plugins/` and returns all valid plugin manifests found.
   *
   * Sub-directories with invalid JSON or missing `name` fields are silently
   * skipped. Directories with no discovereable content are also skipped.
   *
   * @returns An array of loaded manifests (may be empty if the directory does
   *          not exist or contains no valid plugins).
   */
  async loadPlugins(): Promise<PluginManifest[]> {
    const exists = await this.vault.adapter.exists(PLUGINS_DIR);
    if (!exists) {
      return [];
    }

    const { folders } = await this.vault.adapter.list(PLUGINS_DIR);
    const manifests: PluginManifest[] = [];

    for (const pluginDir of folders) {
      const manifest = await this.loadSinglePlugin(pluginDir);
      if (manifest !== undefined) {
        manifests.push(manifest);
      }
    }

    return manifests;
  }

  /**
   * Finds a specific plugin by name.
   *
   * @param name - The plugin name to search for (matches the `name` field in
   *               the manifest, or the directory name for auto-discovered ones).
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
   * Attempts to load a single plugin from the given directory path.
   *
   * Tries to read `.claude-plugin/plugin.json` first. Falls back to
   * auto-discovery if that file is absent.
   *
   * @param pluginDir - Vault-relative path to the plugin directory.
   * @returns A populated {@link PluginManifest}, or `undefined` to skip.
   */
  private async loadSinglePlugin(pluginDir: string): Promise<PluginManifest | undefined> {
    const manifestPath = `${pluginDir}/${MANIFEST_SUBDIR}/${MANIFEST_FILE}`;

    try {
      const hasManifest = await this.vault.adapter.exists(manifestPath);

      if (hasManifest) {
        return await this.parseManifest(pluginDir, manifestPath);
      }

      return await this.autoDiscover(pluginDir);
    } catch {
      return undefined;
    }
  }

  /**
   * Reads and parses `.claude-plugin/plugin.json` for a plugin directory.
   *
   * Returns `undefined` if the JSON is invalid or `name` is missing.
   *
   * @param pluginDir - Vault-relative path to the plugin directory.
   * @param manifestPath - Vault-relative path to the manifest JSON file.
   */
  private async parseManifest(
    pluginDir: string,
    manifestPath: string
  ): Promise<PluginManifest | undefined> {
    let raw: RawManifest;

    try {
      const text = await this.vault.adapter.read(manifestPath);
      raw = JSON.parse(text) as RawManifest;
    } catch {
      return undefined;
    }

    if (typeof raw.name !== "string") {
      return undefined;
    }

    const manifest: PluginManifest = {
      name: raw.name,
      installPath: pluginDir,
    };

    if (typeof raw.version === "string") manifest.version = raw.version;
    if (typeof raw.description === "string") manifest.description = raw.description;
    if (raw.author !== null && typeof raw.author === "object") {
      manifest.author = raw.author as PluginManifest["author"];
    }
    if (typeof raw.homepage === "string") manifest.homepage = raw.homepage;
    if (typeof raw.repository === "string") manifest.repository = raw.repository;
    if (typeof raw.license === "string") manifest.license = raw.license;
    if (Array.isArray(raw.keywords)) {
      manifest.keywords = (raw.keywords as unknown[]).filter(
        (k): k is string => typeof k === "string"
      );
    }

    // Component path fields - keep raw values (string | string[] | object)
    if (raw.commands !== undefined) {
      manifest.commands = raw.commands as PluginManifest["commands"];
    }
    if (raw.agents !== undefined) {
      manifest.agents = raw.agents as PluginManifest["agents"];
    }
    if (raw.skills !== undefined) {
      manifest.skills = raw.skills as PluginManifest["skills"];
    }
    if (raw.hooks !== undefined) {
      manifest.hooks = raw.hooks as PluginManifest["hooks"];
    }
    if (raw.mcpServers !== undefined) {
      manifest.mcpServers = raw.mcpServers as PluginManifest["mcpServers"];
    }
    if (raw.outputStyles !== undefined) {
      manifest.outputStyles = raw.outputStyles as PluginManifest["outputStyles"];
    }
    if (raw.userConfig !== null && typeof raw.userConfig === "object" && !Array.isArray(raw.userConfig)) {
      manifest.userConfig = raw.userConfig as PluginManifest["userConfig"];
    }
    if (raw.settings !== null && typeof raw.settings === "object" && !Array.isArray(raw.settings)) {
      manifest.settings = raw.settings as Record<string, unknown>;
    }

    // Resolve discovered skills and agents using custom or default paths
    const skillsPath = this.resolvePaths(raw.skills, "skills");
    const agentsPath = this.resolvePaths(raw.agents, "agents");

    manifest.discoveredSkills = await this.discoverSkills(pluginDir, skillsPath);
    manifest.discoveredAgents = await this.discoverAgents(pluginDir, agentsPath);

    return manifest;
  }

  /**
   * Auto-discovers plugin content when no manifest is present.
   *
   * Uses the directory name as the plugin name, then scans for `skills/` and
   * `agents/` sub-directories.
   *
   * Returns `undefined` if no discovereable content is found.
   *
   * @param pluginDir - Vault-relative path to the plugin directory.
   */
  private async autoDiscover(pluginDir: string): Promise<PluginManifest | undefined> {
    const dirName = pluginDir.split("/").pop() ?? pluginDir;

    const discoveredSkills = await this.discoverSkills(pluginDir, "skills");
    const discoveredAgents = await this.discoverAgents(pluginDir, "agents");

    if (!this.hasDiscoverableContent(discoveredSkills, discoveredAgents)) {
      return undefined;
    }

    return {
      name: dirName,
      installPath: pluginDir,
      discoveredSkills,
      discoveredAgents,
    };
  }

  /**
   * Discovers skill directories under a given base path.
   *
   * A skill directory is a sub-folder that contains a `SKILL.md` file.
   * Returns relative paths (from the plugin root) of discovered skills.
   *
   * @param pluginDir - Vault-relative path to the plugin directory.
   * @param skillsRelPath - Relative path (from pluginDir) to the skills folder.
   */
  private async discoverSkills(
    pluginDir: string,
    skillsRelPath: string
  ): Promise<string[]> {
    // Normalise the relative path (strip leading ./ and trailing /)
    const rel = skillsRelPath.replace(/^\.\//, "").replace(/\/$/, "");
    const skillsDir = `${pluginDir}/${rel}`;

    const exists = await this.vault.adapter.exists(skillsDir);
    if (!exists) {
      return [];
    }

    const { folders } = await this.vault.adapter.list(skillsDir);
    const discovered: string[] = [];

    for (const skillDir of folders) {
      const skillMdPath = `${skillDir}/SKILL.md`;
      const hasSkillMd = await this.vault.adapter.exists(skillMdPath);
      if (hasSkillMd) {
        // Return path relative to pluginDir
        const relative = skillDir.slice(pluginDir.length + 1);
        discovered.push(relative);
      }
    }

    return discovered;
  }

  /**
   * Discovers agent files under a given base path.
   *
   * An agent is a `.md` file directly inside the agents directory.
   * Returns relative paths (from the plugin root) of discovered agents.
   *
   * @param pluginDir - Vault-relative path to the plugin directory.
   * @param agentsRelPath - Relative path (from pluginDir) to the agents folder.
   */
  private async discoverAgents(
    pluginDir: string,
    agentsRelPath: string
  ): Promise<string[]> {
    const rel = agentsRelPath.replace(/^\.\//, "").replace(/\/$/, "");
    const agentsDir = `${pluginDir}/${rel}`;

    const exists = await this.vault.adapter.exists(agentsDir);
    if (!exists) {
      return [];
    }

    const { files } = await this.vault.adapter.list(agentsDir);
    const discovered: string[] = [];

    for (const filePath of files) {
      if (filePath.endsWith(".md")) {
        const relative = filePath.slice(pluginDir.length + 1);
        discovered.push(relative);
      }
    }

    return discovered;
  }

  /**
   * Returns `true` if at least one skill or agent was discovered.
   *
   * @param skills - Discovered skill paths.
   * @param agents - Discovered agent paths.
   */
  private hasDiscoverableContent(skills: string[], agents: string[]): boolean {
    return skills.length > 0 || agents.length > 0;
  }

  /**
   * Resolves a component path override from the manifest to a single relative
   * path string. If no override is present, returns the default path.
   *
   * Only the first element is used when the manifest supplies an array.
   *
   * @param value - Raw value from the manifest field.
   * @param defaultPath - Fallback path to use when `value` is absent.
   */
  private resolvePaths(value: unknown, defaultPath: string): string {
    if (typeof value === "string") {
      return value;
    }
    if (Array.isArray(value) && typeof value[0] === "string") {
      return value[0] as string;
    }
    return defaultPath;
  }
}
