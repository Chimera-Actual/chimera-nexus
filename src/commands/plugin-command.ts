/**
 * @file Handler for the /plugin slash command.
 *
 * Delegates to subcommands for listing, installing, uninstalling, enabling,
 * disabling, updating, discovering, validating plugins, and managing
 * marketplace sources.
 */

import { exec } from "child_process";
import { Vault } from "obsidian";
import { PluginLoader } from "../core/claude-compat/plugin-loader";
import { MarketplaceLoader } from "../core/claude-compat/marketplace-loader";
import { ChimeraSettings } from "../core/types";

const PLUGINS_DIR = ".claude/plugins";

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

/**
 * Runtime context passed to the plugin command handler.
 */
export interface PluginCommandContext {
  /** The Obsidian Vault instance for file I/O. */
  vault: Vault;
  /** Plugin settings at the time of execution. */
  settings: ChimeraSettings;
  /** Appends a message to the chat panel. */
  addChatMessage: (role: "user" | "assistant", content: string) => void;
  /** Persists current settings to disk. */
  saveSettings: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * Handles all `/plugin` subcommands.
 *
 * @example
 * ```typescript
 * const handler = new PluginCommandHandler(vault);
 * const response = await handler.execute("list", context);
 * ```
 */
export class PluginCommandHandler {
  private readonly loader: PluginLoader;

  /**
   * @param vault - Obsidian Vault instance used for file I/O.
   */
  constructor(private readonly vault: Vault) {
    this.loader = new PluginLoader(vault);
  }

  /**
   * Dispatches a `/plugin` invocation to the appropriate subcommand handler.
   *
   * @param args    - Everything typed after `/plugin` (may be empty).
   * @param context - Runtime context.
   * @returns Markdown string to render in the chat panel.
   */
  async execute(args: string, context: PluginCommandContext): Promise<string> {
    const trimmed = args.trim();

    if (trimmed === "" || trimmed === "list") {
      return this.listPlugins();
    }

    const parts = trimmed.split(/\s+/);
    const sub = parts[0];
    const rest = parts.slice(1).join(" ").trim();

    switch (sub) {
      case "install":
        return this.installPlugin(rest, context);
      case "uninstall":
        return this.uninstallPlugin(rest, context);
      case "enable":
        return this.enablePlugin(rest);
      case "disable":
        return this.disablePlugin(rest);
      case "update":
        return this.updatePlugin(rest, context);
      case "discover":
        return this.discoverPlugins(context);
      case "validate":
        return this.validatePlugin(rest, context);
      case "marketplace":
        return this.marketplaceSubcommand(rest, context);
      default:
        return this.buildHelp();
    }
  }

  // ---------------------------------------------------------------------------
  // Subcommand implementations
  // ---------------------------------------------------------------------------

  /** Lists all installed plugins. */
  private async listPlugins(): Promise<string> {
    try {
      const plugins = await this.loader.loadPlugins();
      if (plugins.length === 0) {
        return "No plugins found in `.claude/plugins/`\n\nUse `/plugin discover` to browse available plugins.";
      }
      const lines = ["**Installed plugins:**", ""];
      for (const p of plugins) {
        const version = p.version ? ` v${p.version}` : "";
        const desc = p.description ? ` - ${p.description}` : "";
        lines.push(`- **${p.name}**${version}${desc}`);
      }
      return lines.join("\n");
    } catch (err) {
      return `Error loading plugins: ${String(err)}`;
    }
  }

  /**
   * Installs a plugin from a marketplace source.
   *
   * @param ref     - Plugin reference in the form `name@marketplace`.
   * @param context - Runtime context.
   */
  private async installPlugin(
    ref: string,
    context: PluginCommandContext
  ): Promise<string> {
    if (!ref) {
      return "Usage: `/plugin install <plugin>@<marketplace>`";
    }

    const parsed = this.parsePluginRef(ref);
    if (!parsed) {
      return "Usage: `/plugin install <plugin>@<marketplace>`\n\nExample: `/plugin install my-plugin@chimera-official`";
    }

    const { name, marketplace } = parsed;
    const source = context.settings.marketplaces[marketplace];
    if (!source) {
      const available = Object.keys(context.settings.marketplaces).join(", ") || "none";
      return `Unknown marketplace: **${marketplace}**\n\nConfigured marketplaces: ${available}\n\nUse \`/plugin marketplace add <name> <owner/repo>\` to add one.`;
    }

    const index = await this.fetchMarketplaceIndex(source, context);
    if (!index) {
      return `Failed to fetch marketplace index for **${marketplace}** (\`${source}\`).`;
    }

    const entry = index.plugins.find((p) => p.name === name);
    if (!entry) {
      return `Plugin **${name}** not found in **${marketplace}**.\n\nUse \`/plugin discover\` to browse available plugins.`;
    }

    const marketplaceRepo = `https://github.com/${source}.git`;
    const cloneUrl = MarketplaceLoader.resolveGitUrl(entry.source, marketplaceRepo);
    const destDir = `${this.basePath}/${PLUGINS_DIR}/${name}`;

    try {
      await this.execAsync(`git clone --depth 1 "${cloneUrl}" "${destDir}"`);
      const version = entry.version ? ` v${entry.version}` : "";
      return `Installed **${name}**${version} from **${marketplace}**.`;
    } catch (err) {
      return `Failed to install **${name}**: ${String(err)}`;
    }
  }

  /**
   * Removes a plugin directory.
   *
   * @param ref     - Plugin reference in the form `name@marketplace` or just `name`.
   * @param context - Runtime context (unused directly, kept for symmetry).
   */
  private async uninstallPlugin(
    ref: string,
    _context: PluginCommandContext
  ): Promise<string> {
    if (!ref) {
      return "Usage: `/plugin uninstall <plugin>@<marketplace>`";
    }

    const name = this.parsePluginRef(ref)?.name ?? ref;
    const pluginDir = `${this.basePath}/${PLUGINS_DIR}/${name}`;

    try {
      await this.execAsync(
        process.platform === "win32"
          ? `rmdir /s /q "${pluginDir}"`
          : `rm -rf "${pluginDir}"`
      );
      return `Uninstalled **${name}**.`;
    } catch (err) {
      return `Failed to uninstall **${name}**: ${String(err)}`;
    }
  }

  /**
   * Stub: enabledPlugins tracking is deferred.
   *
   * @param ref - Plugin reference.
   */
  private enablePlugin(ref: string): Promise<string> {
    const name = ref ? (this.parsePluginRef(ref)?.name ?? ref) : "";
    if (!name) return Promise.resolve("Usage: `/plugin enable <plugin>@<marketplace>`");
    return Promise.resolve(
      `Enabling individual plugins is not yet implemented (full enabledPlugins tracking deferred).\n\nAll installed plugins in \`.claude/plugins/\` are active by default.`
    );
  }

  /**
   * Stub: enabledPlugins tracking is deferred.
   *
   * @param ref - Plugin reference.
   */
  private disablePlugin(ref: string): Promise<string> {
    const name = ref ? (this.parsePluginRef(ref)?.name ?? ref) : "";
    if (!name) return Promise.resolve("Usage: `/plugin disable <plugin>@<marketplace>`");
    return Promise.resolve(
      `Disabling individual plugins is not yet implemented (full enabledPlugins tracking deferred).\n\nRemove the plugin directory with \`/plugin uninstall ${name}\` to fully remove it.`
    );
  }

  /**
   * Runs `git pull --ff-only` on an installed plugin.
   *
   * @param ref     - Plugin reference in the form `name@marketplace` or just `name`.
   * @param context - Runtime context.
   */
  private async updatePlugin(
    ref: string,
    context: PluginCommandContext
  ): Promise<string> {
    if (!ref) {
      return "Usage: `/plugin update <plugin>@<marketplace>`";
    }

    const name = this.parsePluginRef(ref)?.name ?? ref;
    const pluginDir = `${this.basePath}/${PLUGINS_DIR}/${name}`;

    const exists = await context.vault.adapter.exists(`${PLUGINS_DIR}/${name}`);
    if (!exists) {
      return `Plugin **${name}** is not installed. Use \`/plugin install ${ref}\` to install it.`;
    }

    try {
      await this.execAsync(`git -C "${pluginDir}" pull --ff-only`);
      return `Updated **${name}**.`;
    } catch (err) {
      return `Failed to update **${name}**: ${String(err)}`;
    }
  }

  /**
   * Fetches all marketplace indexes and lists available plugins.
   *
   * @param context - Runtime context.
   */
  private async discoverPlugins(context: PluginCommandContext): Promise<string> {
    const marketplaces = context.settings.marketplaces;
    const entries = Object.entries(marketplaces);

    if (entries.length === 0) {
      return "No marketplaces configured. Use `/plugin marketplace add <name> <owner/repo>` to add one.";
    }

    const lines: string[] = ["**Available plugins:**", ""];

    for (const [mktName, source] of entries) {
      const index = await this.fetchMarketplaceIndex(source, context);
      if (!index) {
        lines.push(`- **${mktName}** (${source}): _Failed to fetch index_`);
        continue;
      }

      lines.push(`**${mktName}** (${source}):`);
      if (index.plugins.length === 0) {
        lines.push("  _No plugins listed_");
      } else {
        for (const plugin of index.plugins) {
          const version = plugin.version ? ` v${plugin.version}` : "";
          const desc = plugin.description ? ` - ${plugin.description}` : "";
          lines.push(`  - **${plugin.name}**${version}${desc}`);
        }
      }
      lines.push("");
    }

    return lines.join("\n").trimEnd();
  }

  /**
   * Validates a plugin manifest at the given path (or the plugins directory).
   *
   * @param path    - Optional vault-relative path to a plugin directory.
   * @param context - Runtime context.
   */
  private async validatePlugin(
    path: string,
    context: PluginCommandContext
  ): Promise<string> {
    const targetDir = path || PLUGINS_DIR;

    try {
      const manifestPath = `${targetDir}/.claude-plugin/plugin.json`;
      const exists = await context.vault.adapter.exists(manifestPath);

      if (!exists) {
        return `No manifest found at \`${manifestPath}\`.\n\nA valid plugin must contain \`.claude-plugin/plugin.json\`.`;
      }

      const content = await context.vault.adapter.read(manifestPath);
      let raw: unknown;
      try {
        raw = JSON.parse(content);
      } catch {
        return `Invalid JSON in \`${manifestPath}\`.`;
      }

      if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        return `Manifest at \`${manifestPath}\` must be a JSON object.`;
      }

      const obj = raw as Record<string, unknown>;
      const errors: string[] = [];

      if (typeof obj["name"] !== "string" || !obj["name"]) {
        errors.push('- `name` is required and must be a non-empty string.');
      }

      if (errors.length > 0) {
        return `**Validation failed** for \`${manifestPath}\`:\n\n${errors.join("\n")}`;
      }

      return `**Valid** manifest at \`${manifestPath}\`.\n\nName: \`${obj["name"] as string}\`${obj["version"] ? `\nVersion: \`${obj["version"] as string}\`` : ""}`;
    } catch (err) {
      return `Error validating plugin: ${String(err)}`;
    }
  }

  // ---------------------------------------------------------------------------
  // Marketplace subcommands
  // ---------------------------------------------------------------------------

  /**
   * Routes `marketplace` subcommands.
   *
   * @param args    - Everything after `marketplace`.
   * @param context - Runtime context.
   */
  private async marketplaceSubcommand(
    args: string,
    context: PluginCommandContext
  ): Promise<string> {
    const parts = args.trim().split(/\s+/);
    const sub = parts[0];
    const rest = parts.slice(1).join(" ").trim();

    switch (sub) {
      case "":
      case "list":
        return this.marketplaceList(context);
      case "add":
        return this.marketplaceAdd(rest, context);
      case "remove":
        return this.marketplaceRemove(rest, context);
      default:
        return [
          "Usage:",
          "  `/plugin marketplace list` - List configured marketplaces",
          "  `/plugin marketplace add <name> <owner/repo>` - Add a marketplace",
          "  `/plugin marketplace remove <name>` - Remove a marketplace",
        ].join("\n");
    }
  }

  /** Lists configured marketplace sources. */
  private marketplaceList(context: PluginCommandContext): Promise<string> {
    const entries = Object.entries(context.settings.marketplaces);
    if (entries.length === 0) {
      return Promise.resolve(
        "No marketplaces configured.\n\nUse `/plugin marketplace add <name> <owner/repo>` to add one."
      );
    }
    const lines = ["**Configured marketplaces:**", ""];
    for (const [name, source] of entries) {
      lines.push(`- **${name}**: \`${source}\``);
    }
    return Promise.resolve(lines.join("\n"));
  }

  /**
   * Adds a marketplace source to settings.
   *
   * @param args    - `<name> <owner/repo>`.
   * @param context - Runtime context.
   */
  private async marketplaceAdd(
    args: string,
    context: PluginCommandContext
  ): Promise<string> {
    const parts = args.trim().split(/\s+/);
    if (parts.length < 2) {
      return "Usage: `/plugin marketplace add <name> <owner/repo>`\n\nExample: `/plugin marketplace add my-market MyOrg/my-market`";
    }
    const [name, source] = parts;
    context.settings.marketplaces[name] = source;
    await context.saveSettings();
    return `Added marketplace **${name}** (\`${source}\`).`;
  }

  /**
   * Removes a marketplace source from settings.
   *
   * @param name    - Marketplace name to remove.
   * @param context - Runtime context.
   */
  private async marketplaceRemove(
    name: string,
    context: PluginCommandContext
  ): Promise<string> {
    if (!name) {
      return "Usage: `/plugin marketplace remove <name>`";
    }
    if (!context.settings.marketplaces[name]) {
      return `Marketplace **${name}** is not configured.`;
    }
    delete context.settings.marketplaces[name];
    await context.saveSettings();
    return `Removed marketplace **${name}**.`;
  }

  // ---------------------------------------------------------------------------
  // Help text
  // ---------------------------------------------------------------------------

  private buildHelp(): string {
    return [
      "**Plugin commands:**",
      "",
      "  `/plugin` or `/plugin list` - List installed plugins",
      "  `/plugin install <plugin>@<marketplace>` - Install a plugin",
      "  `/plugin uninstall <plugin>@<marketplace>` - Remove a plugin",
      "  `/plugin enable <plugin>@<marketplace>` - Enable a plugin (stub)",
      "  `/plugin disable <plugin>@<marketplace>` - Disable a plugin (stub)",
      "  `/plugin update <plugin>@<marketplace>` - Update an installed plugin",
      "  `/plugin discover` - Browse all plugins across all marketplaces",
      "  `/plugin validate [path]` - Validate a plugin manifest",
      "  `/plugin marketplace list` - List configured marketplaces",
      "  `/plugin marketplace add <name> <owner/repo>` - Add a marketplace",
      "  `/plugin marketplace remove <name>` - Remove a marketplace",
    ].join("\n");
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Vault base path used for shell commands.
   */
  private get basePath(): string {
    return (
      (this.vault.adapter as unknown as { basePath?: string }).basePath ?? "."
    );
  }

  /**
   * Parses a plugin reference of the form `<name>@<marketplace>`.
   *
   * Splits on the last `@` to support plugin names that may contain `@`.
   *
   * @param ref - The raw reference string.
   * @returns Parsed `{ name, marketplace }`, or `undefined` if no `@` present.
   */
  private parsePluginRef(
    ref: string
  ): { name: string; marketplace: string } | undefined {
    const atIndex = ref.lastIndexOf("@");
    if (atIndex === -1) return undefined;
    return {
      name: ref.slice(0, atIndex),
      marketplace: ref.slice(atIndex + 1),
    };
  }

  /**
   * Wraps `child_process.exec` in a Promise.
   *
   * @param command - Shell command to run.
   * @returns Stdout string on success.
   * @throws Error with stderr message on non-zero exit.
   */
  private execAsync(command: string): Promise<string> {
    return new Promise((resolve, reject) => {
      exec(command, { timeout: 60000 }, (err, stdout, stderr) => {
        if (err) {
          reject(new Error(stderr || err.message));
        } else {
          resolve(stdout.trim());
        }
      });
    });
  }

  /**
   * Fetches a marketplace index by reading from a local cache first, then
   * falling back to a shallow git clone.
   *
   * Local cache path:
   * `{PLUGINS_DIR}/_marketplaces/{source-with-slashes-replaced}/.claude-plugin/marketplace.json`
   *
   * @param source  - Marketplace `owner/repo` string.
   * @param context - Runtime context.
   * @returns Parsed {@link MarketplaceIndex}, or `undefined` on failure.
   */
  private async fetchMarketplaceIndex(
    source: string,
    context: PluginCommandContext
  ): Promise<import("../core/types").MarketplaceIndex | undefined> {
    const cacheKey = source.replace(/\//g, "-");
    const cachePath = `${PLUGINS_DIR}/_marketplaces/${cacheKey}/.claude-plugin/marketplace.json`;

    // Try local cache first
    try {
      const cacheExists = await context.vault.adapter.exists(cachePath);
      if (cacheExists) {
        const raw = await context.vault.adapter.read(cachePath);
        const parsed = MarketplaceLoader.parseIndex(raw);
        if (parsed) return parsed;
      }
    } catch {
      // Cache miss -- fall through to git clone
    }

    // Fetch via git clone
    const cloneUrl = `https://github.com/${source}.git`;
    const destDir = `${this.basePath}/${PLUGINS_DIR}/_marketplaces/${cacheKey}`;

    try {
      await this.execAsync(
        `git clone --depth 1 "${cloneUrl}" "${destDir}"`
      );
      const raw = await context.vault.adapter.read(cachePath);
      return MarketplaceLoader.parseIndex(raw) ?? undefined;
    } catch {
      return undefined;
    }
  }
}
