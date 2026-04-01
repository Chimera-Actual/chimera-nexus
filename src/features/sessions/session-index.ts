/**
 * @file Lightweight JSON index cache at .claude/sessions/index.json.
 *
 * Keeps a fast-lookup index so the UI can list sessions without parsing every
 * individual session note. Supports incremental updates and full rebuilds.
 *
 * The JSON index is a cache only -- the session markdown files in
 * `.claude/sessions/` are the source of truth.
 */

import { Vault, normalizePath } from "obsidian";
import { SessionIndexEntry } from "../../core/types";
import { parseFrontmatter } from "../../utils/frontmatter";

const INDEX_PATH = normalizePath(".claude/sessions/index.json");
const SESSIONS_DIR = normalizePath(".claude/sessions");

/**
 * Manages the session index cache stored at `.claude/sessions/index.json`.
 *
 * All mutating operations persist the updated index to disk immediately.
 * Use {@link rebuildIndex} to reconstruct the cache from the on-disk session
 * notes when the cache may be stale (e.g. on plugin startup).
 */
export class SessionIndex {
  private entries: SessionIndexEntry[] = [];
  private lastRebuilt: string = "";

  /**
   * @param vault - The Obsidian Vault instance used for file I/O.
   */
  constructor(private readonly vault: Vault) {}

  /**
   * Adds a new entry to the index and persists it.
   *
   * @param entry - The session index entry to add.
   */
  async addSession(entry: SessionIndexEntry): Promise<void> {
    try {
      this.entries.push(entry);
      await this.save();
    } catch (err) {
      console.warn("[SessionIndex] addSession failed:", err);
    }
  }

  /**
   * Updates an existing entry in the index by sessionId and persists it.
   * If no matching entry is found the entry is appended instead.
   *
   * @param entry - Updated session index entry (matched by `sessionId`).
   */
  async updateSession(entry: SessionIndexEntry): Promise<void> {
    try {
      const idx = this.entries.findIndex((e) => e.sessionId === entry.sessionId);
      if (idx !== -1) {
        this.entries[idx] = entry;
      } else {
        this.entries.push(entry);
      }
      await this.save();
    } catch (err) {
      console.warn("[SessionIndex] updateSession failed:", err);
    }
  }

  /**
   * Removes an entry from the index by session ID and persists it.
   *
   * @param sessionId - The UUID of the session to remove.
   */
  async removeSession(sessionId: string): Promise<void> {
    try {
      this.entries = this.entries.filter((e) => e.sessionId !== sessionId);
      await this.save();
    } catch (err) {
      console.warn("[SessionIndex] removeSession failed:", err);
    }
  }

  /**
   * Returns the current in-memory list of index entries, optionally filtered
   * by agent name, sorted by `updated` descending (newest first).
   *
   * @param agent - If provided, only entries for this agent are returned.
   * @returns A filtered and sorted shallow copy of the entries array.
   */
  getEntries(agent?: string): SessionIndexEntry[] {
    const filtered =
      agent !== undefined
        ? this.entries.filter((e) => e.agent === agent)
        : [...this.entries];

    return filtered.sort((a, b) => {
      if (a.updated > b.updated) return -1;
      if (a.updated < b.updated) return 1;
      return 0;
    });
  }

  /**
   * Scans all session notes under `.claude/sessions/` and rebuilds the index
   * from scratch by parsing each file's YAML frontmatter.
   *
   * Replaces the in-memory entries array, updates `lastRebuilt`, and persists
   * the result to disk. Missing directory is handled gracefully.
   */
  async rebuildIndex(): Promise<void> {
    try {
      const rebuilt: SessionIndexEntry[] = [];

      let listed: { files: string[]; folders: string[] };
      try {
        listed = await this.vault.adapter.list(SESSIONS_DIR);
      } catch {
        // Directory does not exist yet -- nothing to index.
        this.entries = rebuilt;
        this.lastRebuilt = new Date().toISOString();
        await this.save();
        return;
      }

      const mdFiles = this.collectMdFiles(listed);

      for (const filePath of mdFiles) {
        try {
          const raw = await this.vault.adapter.read(filePath);
          const { frontmatter } = parseFrontmatter(raw);
          const entry = this.entryFromFrontmatter(frontmatter, filePath);
          if (entry !== null) {
            rebuilt.push(entry);
          }
        } catch (fileErr) {
          console.warn(`[SessionIndex] rebuildIndex: failed to read ${filePath}:`, fileErr);
        }
      }

      this.entries = rebuilt;
      this.lastRebuilt = new Date().toISOString();
      await this.save();
    } catch (err) {
      console.warn("[SessionIndex] rebuildIndex failed:", err);
    }
  }

  /**
   * Loads the index cache from `.claude/sessions/index.json` into memory.
   * If the file does not exist the entries array is left empty.
   */
  async load(): Promise<void> {
    try {
      const raw = await this.vault.adapter.read(INDEX_PATH);
      const parsed: unknown = JSON.parse(raw);
      if (
        parsed !== null &&
        typeof parsed === "object" &&
        "entries" in parsed &&
        Array.isArray((parsed as Record<string, unknown>).entries)
      ) {
        const data = parsed as { entries: unknown[]; lastRebuilt?: unknown };
        this.entries = data.entries.filter(isSessionIndexEntry);
        if (typeof data.lastRebuilt === "string") {
          this.lastRebuilt = data.lastRebuilt;
        }
      }
    } catch {
      // File does not exist or is malformed -- start with empty index.
      this.entries = [];
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Serializes the current entries and metadata to disk.
   */
  private async save(): Promise<void> {
    const json = JSON.stringify({ entries: this.entries, lastRebuilt: this.lastRebuilt }, null, 2);

    // Ensure the parent directory exists.
    try {
      await this.vault.adapter.list(SESSIONS_DIR);
    } catch {
      await this.vault.adapter.mkdir(SESSIONS_DIR);
    }

    await this.vault.adapter.write(INDEX_PATH, json);
  }

  /**
   * Recursively collects .md file paths from a directory listing result.
   */
  private collectMdFiles(listed: { files: string[]; folders: string[] }): string[] {
    const mdFiles: string[] = listed.files.filter((f) => f.endsWith(".md"));
    // Note: vault.adapter.list is not recursive, but session notes live at one
    // level of depth under SESSIONS_DIR. If sub-folders are ever introduced
    // this will need to be extended.
    return mdFiles;
  }

  /**
   * Builds a {@link SessionIndexEntry} from a parsed frontmatter object.
   * Returns null if required fields are missing.
   */
  private entryFromFrontmatter(
    frontmatter: Record<string, unknown>,
    filePath: string
  ): SessionIndexEntry | null {
    const sessionId = asString(frontmatter["session_id"]);
    if (sessionId === null) return null;

    return {
      sessionId,
      agent: asString(frontmatter["agent"]) ?? "",
      title: asString(frontmatter["title"]) ?? "",
      created: asString(frontmatter["created"]) ?? "",
      updated: asString(frontmatter["updated"]) ?? "",
      messageCount: asNumber(frontmatter["message_count"]) ?? 0,
      status: asString(frontmatter["status"]) ?? "",
      path: filePath,
    };
  }
}

// ---------------------------------------------------------------------------
// Type-narrowing utilities
// ---------------------------------------------------------------------------

function asString(value: unknown): string | null {
  if (typeof value === "string") return value;
  return null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number") return value;
  return null;
}

/**
 * Type-guard for {@link SessionIndexEntry} -- used when loading the JSON cache.
 */
function isSessionIndexEntry(value: unknown): value is SessionIndexEntry {
  if (value === null || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v["sessionId"] === "string" &&
    typeof v["agent"] === "string" &&
    typeof v["title"] === "string" &&
    typeof v["created"] === "string" &&
    typeof v["updated"] === "string" &&
    typeof v["messageCount"] === "number" &&
    typeof v["status"] === "string" &&
    typeof v["path"] === "string"
  );
}
