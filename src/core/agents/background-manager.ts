/**
 * @file Non-blocking background agent execution pool.
 *
 * Submits agent tasks to a background worker pool, tracks their execution
 * status, and allows in-flight tasks to be cancelled.
 */

// TODO: Not yet implemented -- implement worker pool and status tracking map.

import { AgentDefinition } from "../types";

/**
 * Manages a pool of non-blocking background agent executions.
 */
export class BackgroundManager {
  /**
   * Submits an agent task for background execution.
   *
   * @param agent - The agent definition to use.
   * @param task - The task prompt to send to the agent.
   * @returns A unique execution ID for status polling and cancellation.
   */
  submit(agent: AgentDefinition, task: string): string {
    void agent;
    void task;
    throw new Error("Not implemented");
  }

  /**
   * Returns the current status string for the given execution ID.
   *
   * @param id - The execution ID returned by {@link submit}.
   * @returns A human-readable status such as `"running"`, `"done"`, or `"failed"`.
   */
  getStatus(id: string): string {
    void id;
    throw new Error("Not implemented");
  }

  /**
   * Cancels an in-flight background execution.
   *
   * @param id - The execution ID returned by {@link submit}.
   */
  cancel(id: string): void {
    void id;
    throw new Error("Not implemented");
  }
}
