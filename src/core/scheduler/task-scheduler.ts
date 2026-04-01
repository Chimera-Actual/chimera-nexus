/**
 * @file Persistent cron-based task scheduler.
 *
 * Loads scheduled task definitions from the vault, evaluates cron expressions,
 * and dispatches tasks when their scheduled time arrives.
 */

// TODO: Not yet implemented -- implement task persistence and cron dispatch loop.

import { Vault } from "obsidian";
import { ScheduledTask } from "../types";

/**
 * Loads and executes cron-scheduled tasks stored in the vault.
 */
export class TaskScheduler {
  /**
   * @param vault - The Obsidian Vault instance used for task persistence.
   */
  constructor(private readonly vault: Vault) {}

  /**
   * Reads all scheduled task definitions from the vault.
   *
   * @returns Array of scheduled tasks.
   */
  async loadTasks(): Promise<ScheduledTask[]> {
    void this.vault;
    throw new Error("Not implemented");
  }

  /**
   * Executes a single scheduled task immediately.
   *
   * @param task - The task to run.
   */
  async runTask(task: ScheduledTask): Promise<void> {
    void task;
    throw new Error("Not implemented");
  }
}
