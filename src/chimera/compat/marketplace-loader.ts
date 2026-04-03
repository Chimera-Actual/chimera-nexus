/**
 * @file Parses marketplace.json indexes for plugin discovery.
 */

import { MarketplaceIndex, MarketplacePluginEntry, PluginSource } from "../types";

/**
 * Static utility class for parsing marketplace.json indexes and resolving plugin source URLs.
 * This is a pure parser -- no file I/O or git operations.
 */
export class MarketplaceLoader {
  /**
   * Parses raw JSON content into a validated {@link MarketplaceIndex}.
   *
   * Validates required fields: `name` (string), `owner` (object with `name` string),
   * and `plugins` (array). Plugin entries missing `name` or `source` are silently
   * skipped. The optional `metadata` block (`description`, `version`, `pluginRoot`)
   * is passed through as-is if present.
   *
   * @param raw - Raw JSON string content of a `marketplace.json` file.
   * @returns A validated `MarketplaceIndex`, or `undefined` if the content is
   *   invalid JSON or is missing required top-level fields.
   */
  static parseIndex(raw: string): MarketplaceIndex | undefined {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return undefined;
    }

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return undefined;
    }

    const obj = parsed as Record<string, unknown>;

    // Validate required: name
    if (typeof obj["name"] !== "string") {
      return undefined;
    }

    // Validate required: owner with name string
    if (
      !obj["owner"] ||
      typeof obj["owner"] !== "object" ||
      Array.isArray(obj["owner"]) ||
      typeof (obj["owner"] as Record<string, unknown>)["name"] !== "string"
    ) {
      return undefined;
    }

    // Validate required: plugins array
    if (!Array.isArray(obj["plugins"])) {
      return undefined;
    }

    const ownerObj = obj["owner"] as Record<string, unknown>;
    const owner: MarketplaceIndex["owner"] = {
      name: ownerObj["name"] as string,
      ...(typeof ownerObj["email"] === "string" ? { email: ownerObj["email"] } : {}),
    };

    // Parse optional metadata block
    let metadata: MarketplaceIndex["metadata"];
    if (obj["metadata"] && typeof obj["metadata"] === "object" && !Array.isArray(obj["metadata"])) {
      const metaObj = obj["metadata"] as Record<string, unknown>;
      metadata = {};
      if (typeof metaObj["description"] === "string") metadata.description = metaObj["description"];
      if (typeof metaObj["version"] === "string") metadata.version = metaObj["version"];
      if (typeof metaObj["pluginRoot"] === "string") metadata.pluginRoot = metaObj["pluginRoot"];
      if (Object.keys(metadata).length === 0) metadata = undefined;
    }

    // Parse plugin entries; skip entries missing name or source
    const plugins: MarketplacePluginEntry[] = [];
    for (const entry of obj["plugins"] as unknown[]) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
      const e = entry as Record<string, unknown>;
      if (typeof e["name"] !== "string") continue;
      if (e["source"] === undefined || e["source"] === null) continue;

      const plugin: MarketplacePluginEntry = {
        name: e["name"],
        source: e["source"] as PluginSource,
      };

      if (typeof e["description"] === "string") plugin.description = e["description"];
      if (typeof e["version"] === "string") plugin.version = e["version"];
      if (typeof e["category"] === "string") plugin.category = e["category"];
      if (Array.isArray(e["keywords"])) {
        plugin.keywords = (e["keywords"] as unknown[]).filter(
          (k): k is string => typeof k === "string"
        );
      }
      if (e["author"] && typeof e["author"] === "object" && !Array.isArray(e["author"])) {
        const a = e["author"] as Record<string, unknown>;
        if (typeof a["name"] === "string") {
          plugin.author = {
            name: a["name"],
            ...(typeof a["email"] === "string" ? { email: a["email"] } : {}),
            ...(typeof a["url"] === "string" ? { url: a["url"] } : {}),
          };
        }
      }

      plugins.push(plugin);
    }

    const index: MarketplaceIndex = {
      name: obj["name"] as string,
      owner,
      plugins,
    };

    if (metadata) index.metadata = metadata;

    return index;
  }

  /**
   * Resolves a {@link PluginSource} to a git clone URL.
   *
   * Resolution rules:
   * - **Relative path string** (starts with `"./"`): returns the `marketplaceRepo` URL,
   *   since the plugin lives inside the marketplace repository.
   * - **Bare URL string** (does not start with `"./"`): returned as-is.
   * - **`github` source**: constructs `https://github.com/{repo}.git`.
   * - **`url` source**: returns the `url` field directly.
   * - **`git-subdir` source**: returns the `url` field (the monorepo clone URL).
   *
   * @param source - The plugin source descriptor from a `MarketplacePluginEntry`.
   * @param marketplaceRepo - The git clone URL of the marketplace index repository.
   * @returns A git clone URL string.
   */
  static resolveGitUrl(source: PluginSource, marketplaceRepo: string): string {
    if (typeof source === "string") {
      // Relative path -> plugin lives inside the marketplace repo
      if (source.startsWith("./")) {
        return marketplaceRepo;
      }
      // Bare URL -> use directly
      return source;
    }

    switch (source.source) {
      case "github":
        return `https://github.com/${source.repo}.git`;
      case "url":
        return source.url;
      case "git-subdir":
        return source.url;
    }
  }
}
