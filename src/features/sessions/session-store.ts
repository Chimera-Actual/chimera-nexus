/**
 * @file Read/write session markdown files in .claude/sessions/.
 *
 * Provides a high-level API for persisting and retrieving full {@link Session}
 * records as vault notes with YAML frontmatter.
 */

// TODO: Not yet implemented -- wire up Vault API read/write with frontmatter serialisation.

import { Vault } from "obsidian";
import { Session } from "../../core/types";

/**
 * Manages persistence of session notes in the vault's `.claude/sessions/` folder.
 */
export class SessionStore {
  /**
   * @param vault - The Obsidian Vault instance used for file I/O.
   */
  constructor(private readonly vault: Vault) {}

  /**
   * Persists a session record as a markdown note.
   *
   * @param session - The session to save.
   */
  async saveSession(session: Session): Promise<void> {
    void this.vault;
    void session;
    throw new Error("Not implemented");
  }

  /**
   * Loads a session record from a vault-relative path.
   *
   * @param path - Vault-relative path to the session note.
   * @returns The parsed {@link Session} object.
   */
  async loadSession(path: string): Promise<Session> {
    void this.vault;
    void path;
    throw new Error("Not implemented");
  }

  /**
   * Lists all session records, optionally filtered by agent name.
   *
   * @param agent - If provided, only sessions for this agent are returned.
   * @returns Array of sessions sorted newest-first.
   */
  async listSessions(agent?: string): Promise<Session[]> {
    void this.vault;
    void agent;
    throw new Error("Not implemented");
  }
}
