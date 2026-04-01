/**
 * @file Extracts memory signals from completed sessions.
 *
 * Analyses a finished session transcript and writes relevant facts, decisions,
 * and patterns to the appropriate vault memory files.
 */

// TODO: Not yet implemented -- implement signal extraction and memory file updates.

import { Vault } from "obsidian";
import { Session } from "../types";

/**
 * Extracts and stores memory signals from a completed session.
 */
export class MemoryExtractor {
  /**
   * @param vault - The Obsidian Vault instance used to write memory files.
   */
  constructor(private readonly vault: Vault) {}

  /**
   * Analyses `session` and writes extracted signals to vault memory files.
   *
   * @param session - The completed session to extract signals from.
   */
  async extractFromSession(session: Session): Promise<void> {
    void this.vault;
    void session;
    throw new Error("Not implemented");
  }
}
