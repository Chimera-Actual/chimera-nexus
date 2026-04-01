/**
 * @file Session pool with priority queue and concurrency control.
 *
 * Manages a bounded pool of concurrent Claude sessions, queuing new requests
 * when the concurrency limit is reached and honouring priority ordering.
 *
 * Priority levels:
 *   1 (highest) = User chat
 *   2 = /loop tasks
 *   3 = Scheduled tasks
 *   4 = Background agents
 *   5 (lowest) = Dream cycle
 */

import { ChimeraSettings } from "../types";

/** Generates a RFC-4122 v4 UUID without external dependencies. */
function generateId(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** An actively running Claude session. */
interface ActiveSession {
  id: string;
  agent: string;
  priority: number;
  startedAt: string;
}

/** A session request that is waiting for a concurrency slot. */
interface QueuedSession {
  id: string;
  agent: string;
  priority: number;
  resolve: (id: string) => void;
  reject: (err: Error) => void;
}

/**
 * Manages the lifecycle of active Claude sessions with concurrency control.
 */
export class SessionManager {
  private activeSessions: Map<string, ActiveSession> = new Map();
  private queue: QueuedSession[] = [];
  private maxConcurrent: number;

  /**
   * @param settings - Plugin settings (used for `maxConcurrentSessions`).
   */
  constructor(private readonly settings: ChimeraSettings) {
    this.maxConcurrent = settings.maxConcurrentSessions;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Requests a session for the named agent.
   *
   * If a concurrency slot is available the session starts immediately.
   * Otherwise the request is queued and the returned promise resolves when a
   * slot opens.
   *
   * @param agent - Name of the agent to create a session for.
   * @param priority - Numeric priority (lower number = higher priority).
   * @returns Resolves to the UUID of the newly created session.
   */
  requestSession(agent: string, priority: number): Promise<string> {
    if (this.activeSessions.size < this.maxConcurrent) {
      const id = this.activateSession(agent, priority);
      return Promise.resolve(id);
    }

    // Slot not available — enqueue and return a deferred promise.
    return new Promise<string>((resolve, reject) => {
      const queued: QueuedSession = {
        id: generateId(),
        agent,
        priority,
        resolve,
        reject,
      };
      this.queue.push(queued);
      // Keep the queue sorted: lowest priority number (highest urgency) first.
      this.queue.sort((a, b) => a.priority - b.priority);
    });
  }

  /**
   * Alias for {@link requestSession} — matches the original stub signature.
   */
  async createSession(agent: string, priority: number): Promise<string> {
    return this.requestSession(agent, priority);
  }

  /**
   * Ends an active session and releases its slot.
   *
   * If any sessions are queued the highest-priority one is activated
   * immediately.
   *
   * @param sessionId - UUID of the session to end.
   */
  releaseSession(sessionId: string): void {
    this.activeSessions.delete(sessionId);
    this.promoteFromQueue();
  }

  /**
   * Alias for {@link releaseSession} — matches the original stub signature.
   */
  async endSession(sessionId: string): Promise<void> {
    this.releaseSession(sessionId);
  }

  /**
   * Returns all currently active sessions.
   */
  getActiveSessions(): ActiveSession[] {
    return Array.from(this.activeSessions.values());
  }

  /**
   * Returns the number of sessions currently waiting in the queue.
   */
  getQueueLength(): number {
    return this.queue.length;
  }

  /**
   * Returns `true` if a session with the given priority can start immediately
   * (i.e. a slot is free).
   *
   * @param priority - Priority level to check (unused for the slot test, kept
   *   in signature for future preemption logic).
   */
  isSlotAvailable(_priority: number): boolean {
    return this.activeSessions.size < this.maxConcurrent;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /** Creates an active-session record and stores it; returns the new UUID. */
  private activateSession(agent: string, priority: number): string {
    const id = generateId();
    this.activeSessions.set(id, {
      id,
      agent,
      priority,
      startedAt: new Date().toISOString(),
    });
    return id;
  }

  /**
   * If there are queued sessions and a slot is now available, dequeue the
   * highest-priority entry and resolve its promise.
   */
  private promoteFromQueue(): void {
    if (this.queue.length === 0) return;
    if (this.activeSessions.size >= this.maxConcurrent) return;

    // Queue is already sorted; take the first (highest-priority) entry.
    const next = this.queue.shift()!;
    const id = this.activateSession(next.agent, next.priority);
    next.resolve(id);
  }
}
