/**
 * @file Detects and handles missed scheduled task runs.
 *
 * When the plugin starts after a period of inactivity, this module compares
 * each task's `lastRun` timestamp against the current time to identify any
 * runs that were skipped while Obsidian was closed.
 */

// TODO: Not yet implemented -- implement lastRun comparison and catch-up logic.

import { ScheduledTask } from "../types";

/**
 * Detects scheduled tasks that were not executed during a downtime window.
 */
export class MissedRunHandler {
  /**
   * Compares each task's `lastRun` timestamp against `now` and returns the
   * subset of tasks that have missed at least one scheduled run.
   *
   * @param tasks - All known scheduled tasks.
   * @returns Tasks that have one or more missed runs.
   */
  async checkMissedRuns(tasks: ScheduledTask[]): Promise<ScheduledTask[]> {
    void tasks;
    throw new Error("Not implemented");
  }
}
