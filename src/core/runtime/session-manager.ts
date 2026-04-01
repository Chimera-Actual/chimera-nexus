/**
 * @file Session pool with priority queue and concurrency control.
 *
 * Manages a bounded pool of concurrent Claude sessions, queuing new requests
 * when the concurrency limit is reached and honouring priority ordering.
 */

// TODO: Not yet implemented -- implement priority queue and concurrency semaphore.

import { ChimeraSettings } from "../types";

/**
 * Manages the lifecycle of active Claude sessions with concurrency control.
 */
export class SessionManager {
  /**
   * @param settings - Plugin settings (used for `maxConcurrentSessions`).
   */
  constructor(private readonly settings: ChimeraSettings) {}

  /**
   * Creates a new session for the named agent, queuing if at capacity.
   *
   * @param agent - Name of the agent to create a session for.
   * @param priority - Numeric priority (higher value runs sooner).
   * @returns The UUID of the newly created session.
   */
  async createSession(agent: string, priority: number): Promise<string> {
    void this.settings;
    void agent;
    void priority;
    throw new Error("Not implemented");
  }

  /**
   * Ends an active session and releases its slot in the pool.
   *
   * @param sessionId - UUID of the session to end.
   */
  async endSession(sessionId: string): Promise<void> {
    void sessionId;
    throw new Error("Not implemented");
  }
}
