/**
 * @file Reads and merges .claude/settings.json with ~/.claude/settings.json.
 *
 * Produces a {@link ResolvedClaudeSettings} object by deep-merging the global
 * user settings with any vault-local overrides, following the same precedence
 * rules as the Claude CLI.
 */

import { Vault } from "obsidian";
import { ResolvedClaudeSettings, HookDefinition, HookEvent, HookHandler } from "../types";

// ---------------------------------------------------------------------------
// Internal shape of settings.json on disk
// ---------------------------------------------------------------------------

/**
 * A single hook entry as it appears in settings.json, keyed by event name.
 * One of `command`, `url`, `prompt`, or `agentName` must be present.
 */
interface RawHookEntry {
  matcher?: string;
  command?: string;
  url?: string;
  prompt?: string;
  agentName?: string;
}

/**
 * Raw shape of a Claude Code settings.json file.
 * All fields are optional — the file may be partial.
 */
interface RawSettings {
  permissions?: {
    allow?: string[];
    deny?: string[];
    ask?: string[];
  };
  /** Hooks keyed by event name, e.g. `"PreToolUse"`. */
  hooks?: Record<string, RawHookEntry[]>;
  env?: Record<string, string>;
  mcpServers?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Return a deduplicated copy of an array, preserving first-occurrence order. */
function dedup(arr: string[]): string[] {
  return [...new Set(arr)];
}

/** Empty resolved settings — the safe zero-value for a missing file. */
function emptySettings(): ResolvedClaudeSettings {
  return {
    permissions: { allow: [], deny: [], ask: [] },
    hooks: [],
    env: {},
    mcpServers: {},
  };
}

/**
 * Convert a {@link RawHookEntry} to a {@link HookHandler}.
 * Returns `null` when the entry has no recognisable handler field.
 */
function rawEntryToHandler(entry: RawHookEntry): HookHandler | null {
  if (entry.command !== undefined) {
    return { type: "command", command: entry.command };
  }
  if (entry.url !== undefined) {
    return { type: "http", url: entry.url };
  }
  if (entry.prompt !== undefined) {
    return { type: "prompt", prompt: entry.prompt };
  }
  if (entry.agentName !== undefined) {
    return { type: "agent", agentName: entry.agentName };
  }
  return null;
}

/**
 * Convert the raw hooks map from settings.json into our {@link HookDefinition[]} format.
 *
 * Each event key (e.g. `"PreToolUse"`) maps to an array of raw entries.  Each
 * entry with a valid handler becomes one {@link HookDefinition} so that the
 * matcher is preserved per-entry.
 */
function convertHooks(raw: Record<string, RawHookEntry[]>): HookDefinition[] {
  const result: HookDefinition[] = [];

  for (const [eventKey, entries] of Object.entries(raw)) {
    // Only process event keys that are known HookEvent values.
    if (!Object.values(HookEvent).includes(eventKey as HookEvent)) {
      console.warn(`[SettingsLoader] Unknown hook event "${eventKey}" — skipping.`);
      continue;
    }
    const event = eventKey as HookEvent;

    if (!Array.isArray(entries)) continue;

    for (const entry of entries) {
      const handler = rawEntryToHandler(entry);
      if (handler === null) {
        console.warn(`[SettingsLoader] Hook entry for "${eventKey}" has no recognised handler field — skipping.`);
        continue;
      }
      const def: HookDefinition = {
        event,
        handlers: [handler],
      };
      if (entry.matcher !== undefined) {
        def.matcher = entry.matcher;
      }
      result.push(def);
    }
  }

  return result;
}

/**
 * Safely parse a JSON string, returning `null` on parse failure.
 * Logs a warning with the supplied `label` when parsing fails.
 */
function tryParseJson(raw: string, label: string): unknown | null {
  try {
    return JSON.parse(raw) as unknown;
  } catch (err) {
    console.warn(`[SettingsLoader] Failed to parse JSON from ${label}:`, err);
    return null;
  }
}

/**
 * Type-narrow an unknown value to {@link RawSettings}.
 * Returns `null` when the value is not a plain object.
 */
function toRawSettings(parsed: unknown, label: string): RawSettings | null {
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    console.warn(`[SettingsLoader] Settings from ${label} is not a plain object — ignoring.`);
    return null;
  }
  return parsed as RawSettings;
}

// ---------------------------------------------------------------------------
// SettingsLoader
// ---------------------------------------------------------------------------

/**
 * Loads and merges Claude settings from vault-local and global config files.
 *
 * The vault-local file (`.claude/settings.json`) is read via the Obsidian
 * {@link Vault} adapter.  User-level settings (`~/.claude/settings.json`)
 * require platform-specific home-directory detection that is not yet
 * available in the Obsidian environment.
 *
 * @example
 * ```ts
 * const loader = new SettingsLoader(app.vault);
 * const settings = await loader.loadSettings();
 * ```
 */
export class SettingsLoader {
  /**
   * @param vault - The Obsidian Vault instance used to access vault-local files.
   */
  constructor(private readonly vault: Vault) {}

  /**
   * Reads both settings files and returns a merged {@link ResolvedClaudeSettings}.
   *
   * Vault-local (project) settings take precedence over global user settings:
   * - `env` and `mcpServers`: project keys overwrite user keys.
   * - `permissions.allow/deny/ask`: arrays are merged and deduplicated.
   *   **Deny always wins** — any tool present in deny is removed from allow and ask.
   * - `hooks`: arrays are concatenated (user first, project second).
   *
   * Missing files return empty defaults.  Malformed JSON logs a warning and
   * is treated as an empty file.
   *
   * @returns The merged Claude settings.
   */
  async loadSettings(): Promise<ResolvedClaudeSettings> {
    // TODO: Load user-level settings from ~/.claude/settings.json once
    //       platform-specific home-directory detection is available in the
    //       Obsidian plugin environment.
    const userSettings = emptySettings();

    const projectSettings = await this.readProjectSettings();

    return this.merge(userSettings, projectSettings);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Attempt to read `.claude/settings.json` from the vault root.
   * Returns empty defaults when the file is absent or unparseable.
   */
  private async readProjectSettings(): Promise<ResolvedClaudeSettings> {
    const path = ".claude/settings.json";

    try {
      const exists = await this.vault.adapter.exists(path);
      if (!exists) {
        return emptySettings();
      }

      const raw = await this.vault.adapter.read(path);
      const parsed = tryParseJson(raw, path);
      if (parsed === null) {
        return emptySettings();
      }

      const rawSettings = toRawSettings(parsed, path);
      if (rawSettings === null) {
        return emptySettings();
      }

      return this.resolveRaw(rawSettings);
    } catch (err) {
      console.warn(`[SettingsLoader] Error reading project settings from ${path}:`, err);
      return emptySettings();
    }
  }

  /**
   * Convert a {@link RawSettings} object into a {@link ResolvedClaudeSettings}.
   */
  private resolveRaw(raw: RawSettings): ResolvedClaudeSettings {
    const allow = Array.isArray(raw.permissions?.allow) ? [...raw.permissions!.allow] : [];
    const deny = Array.isArray(raw.permissions?.deny) ? [...raw.permissions!.deny] : [];
    const ask = Array.isArray(raw.permissions?.ask) ? [...raw.permissions!.ask] : [];

    const hooks =
      raw.hooks !== null && typeof raw.hooks === "object" && !Array.isArray(raw.hooks)
        ? convertHooks(raw.hooks as Record<string, RawHookEntry[]>)
        : [];

    const env =
      raw.env !== null && typeof raw.env === "object" && !Array.isArray(raw.env)
        ? { ...(raw.env as Record<string, string>) }
        : {};

    const mcpServers =
      raw.mcpServers !== null &&
      typeof raw.mcpServers === "object" &&
      !Array.isArray(raw.mcpServers)
        ? { ...(raw.mcpServers as Record<string, unknown>) }
        : {};

    return { permissions: { allow, deny, ask }, hooks, env, mcpServers };
  }

  /**
   * Merge user-level and project-level settings, with project taking precedence.
   *
   * Deny-wins rule: any tool in the merged deny list is removed from allow and ask.
   */
  private merge(
    user: ResolvedClaudeSettings,
    project: ResolvedClaudeSettings,
  ): ResolvedClaudeSettings {
    const mergedDeny = dedup([...user.permissions.deny, ...project.permissions.deny]);
    const denySet = new Set(mergedDeny);

    const mergedAllow = dedup(
      [...user.permissions.allow, ...project.permissions.allow].filter((t) => !denySet.has(t)),
    );

    const mergedAsk = dedup(
      [...user.permissions.ask, ...project.permissions.ask].filter((t) => !denySet.has(t)),
    );

    const mergedHooks: HookDefinition[] = [...user.hooks, ...project.hooks];

    const mergedEnv: Record<string, string> = { ...user.env, ...project.env };

    const mergedMcpServers: Record<string, unknown> = {
      ...user.mcpServers,
      ...project.mcpServers,
    };

    return {
      permissions: {
        allow: mergedAllow,
        deny: mergedDeny,
        ask: mergedAsk,
      },
      hooks: mergedHooks,
      env: mergedEnv,
      mcpServers: mergedMcpServers,
    };
  }
}
