/**
 * @file Detects and handles missed scheduled task runs.
 *
 * When the plugin starts after a period of inactivity, this module compares
 * each task's `lastRun` timestamp against the current time to identify any
 * runs that were skipped while Obsidian was closed.
 */

import { ScheduledTask } from "../types";

/** Maximum look-back window in milliseconds (7 days). */
const MAX_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Detects scheduled tasks that were not executed during a downtime window.
 */
export class MissedRunHandler {
  /**
   * Compares each task's `nextRun` and `lastRun` timestamps against `now` and
   * returns the subset of enabled tasks that have missed at least one scheduled
   * run, sorted oldest-first by `nextRun`.
   *
   * A task is considered missed when:
   * - It is enabled, AND
   * - Its `nextRun` timestamp is in the past, AND
   * - Its `lastRun` timestamp is within the maximum look-back window (7 days).
   *   Tasks not run in over 7 days are silently skipped to avoid an avalanche
   *   of catch-up runs after a long downtime.
   *
   * @param tasks - All known scheduled tasks.
   * @returns Tasks that have one or more missed runs, sorted by `nextRun` ascending.
   */
  async checkMissedRuns(tasks: ScheduledTask[]): Promise<ScheduledTask[]> {
    const now = Date.now();
    const lookbackCutoff = now - MAX_LOOKBACK_MS;

    const missed = tasks.filter((task) => {
      if (!task.enabled) return false;

      const nextRun = task.nextRun ? new Date(task.nextRun).getTime() : NaN;
      if (isNaN(nextRun) || nextRun >= now) return false;

      // If the task has never run, treat lastRun as epoch 0 — always within window.
      const lastRun =
        task.lastRun && task.lastRun.length > 0
          ? new Date(task.lastRun).getTime()
          : 0;

      // Skip tasks that haven't run in over the max look-back window.
      if (lastRun > 0 && lastRun < lookbackCutoff) return false;

      return true;
    });

    missed.sort((a, b) => {
      const aTime = new Date(a.nextRun).getTime();
      const bTime = new Date(b.nextRun).getTime();
      return aTime - bTime;
    });

    return missed;
  }

  /**
   * Returns the count of tasks that have missed runs.
   *
   * Uses the same eligibility criteria as {@link checkMissedRuns}.
   *
   * @param tasks - All known scheduled tasks.
   * @returns Number of tasks with missed runs.
   */
  getMissedCount(tasks: ScheduledTask[]): number {
    const now = Date.now();
    const lookbackCutoff = now - MAX_LOOKBACK_MS;

    return tasks.filter((task) => {
      if (!task.enabled) return false;

      const nextRun = task.nextRun ? new Date(task.nextRun).getTime() : NaN;
      if (isNaN(nextRun) || nextRun >= now) return false;

      const lastRun =
        task.lastRun && task.lastRun.length > 0
          ? new Date(task.lastRun).getTime()
          : 0;

      if (lastRun > 0 && lastRun < lookbackCutoff) return false;

      return true;
    }).length;
  }

  /**
   * Categorises tasks into three mutually exclusive groups.
   *
   * - `disabled` -- tasks where `enabled` is `false`.
   * - `missed`   -- enabled tasks whose `nextRun` is in the past and within the
   *                look-back window.
   * - `onTime`   -- all remaining enabled tasks.
   *
   * @param tasks - All known scheduled tasks.
   * @returns An object containing the three category arrays.
   */
  categorize(tasks: ScheduledTask[]): {
    missed: ScheduledTask[];
    onTime: ScheduledTask[];
    disabled: ScheduledTask[];
  } {
    const now = Date.now();
    const lookbackCutoff = now - MAX_LOOKBACK_MS;

    const missed: ScheduledTask[] = [];
    const onTime: ScheduledTask[] = [];
    const disabled: ScheduledTask[] = [];

    for (const task of tasks) {
      if (!task.enabled) {
        disabled.push(task);
        continue;
      }

      const nextRun = task.nextRun ? new Date(task.nextRun).getTime() : NaN;
      if (isNaN(nextRun) || nextRun >= now) {
        onTime.push(task);
        continue;
      }

      const lastRun =
        task.lastRun && task.lastRun.length > 0
          ? new Date(task.lastRun).getTime()
          : 0;

      if (lastRun > 0 && lastRun < lookbackCutoff) {
        // Over look-back window -- treat as on-time to avoid catch-up avalanche.
        onTime.push(task);
        continue;
      }

      missed.push(task);
    }

    return { missed, onTime, disabled };
  }
}
