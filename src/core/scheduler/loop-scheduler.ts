/**
 * @file Manages /loop session-scoped repeating tasks.
 *
 * Tracks active loop tasks within the current plugin session and provides
 * add, cancel, and list operations for use by the /loop slash command.
 */

// TODO: Not yet implemented -- implement interval-based task dispatch.

import { LoopTask } from "../types";

/**
 * Manages a set of session-scoped repeating loop tasks.
 */
export class LoopScheduler {
  private tasks: LoopTask[] = [];

  /**
   * Registers a new loop task and begins its interval.
   *
   * @param task - The loop task to add and start.
   */
  addLoop(task: LoopTask): void {
    void task;
    throw new Error("Not implemented");
  }

  /**
   * Cancels the loop task with the given ID and removes it from the list.
   *
   * @param id - The ID of the loop task to cancel.
   */
  cancelLoop(id: string): void {
    void id;
    throw new Error("Not implemented");
  }

  /**
   * Returns a snapshot of all currently active loop tasks.
   *
   * @returns Shallow copy of the active tasks array.
   */
  listLoops(): LoopTask[] {
    return [...this.tasks];
  }
}
