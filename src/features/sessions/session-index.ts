/**
 * @file Lightweight JSON index cache at .claude/sessions/index.json.
 *
 * Keeps a fast-lookup index so the UI can list sessions without parsing every
 * individual session note. Supports incremental updates and full rebuilds.
 */

// TODO: Not yet implemented -- implement JSON read/write and full rebuild scan.

import { Vault } from "obsidian";
import { SessionIndexEntry } from "../../core/types";

/**
 * Manages the session index cache stored at `.claude/sessions/index.json`.
 */
export class SessionIndex {
  private entries: SessionIndexEntry[] = [];

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
    void this.vault;
    void entry;
    throw new Error("Not implemented");
  }

  /**
   * Updates an existing entry in the index and persists it.
   *
   * @param entry - Updated session index entry (matched by `sessionId`).
   */
  async updateSession(entry: SessionIndexEntry): Promise<void> {
    void this.vault;
    void entry;
    throw new Error("Not implemented");
  }

  /**
   * Removes an entry from the index by session ID and persists it.
   *
   * @param sessionId - The UUID of the session to remove.
   */
  async removeSession(sessionId: string): Promise<void> {
    void this.vault;
    void sessionId;
    throw new Error("Not implemented");
  }

  /**
   * Scans all session notes and rebuilds the index from scratch.
   */
  async rebuildIndex(): Promise<void> {
    void this.vault;
    throw new Error("Not implemented");
  }

  /**
   * Returns the current in-memory list of index entries.
   *
   * @returns A shallow copy of the entries array.
   */
  getEntries(): SessionIndexEntry[] {
    return [...this.entries];
  }
}
