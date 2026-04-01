/**
 * @file Manages /loop session-scoped repeating tasks.
 *
 * Tracks active loop tasks within the current plugin session and provides
 * add, cancel, and list operations for use by the /loop slash command.
 */

import { LoopTask } from "../types";

/** Maximum number of simultaneous loops allowed per scheduler instance. */
const MAX_LOOPS = 50;

/** Internal state entry pairing a task with its active interval timer. */
interface LoopEntry {
  task: LoopTask;
  timer: ReturnType<typeof setInterval> | null;
}

/**
 * Manages a set of session-scoped repeating loop tasks.
 *
 * Tasks are stored in memory only and are automatically cancelled when the
 * session ends. Each task fires on its configured millisecond interval and
 * is optionally auto-expired when its `expiresAt` timestamp passes.
 */
export class LoopScheduler {
  private loops: Map<string, LoopEntry> = new Map();
  private timers: Map<string, ReturnType<typeof setInterval>> = new Map();

  /**
   * Registers a new loop task and begins its interval.
   *
   * The `onTick` callback is invoked on every tick. After each tick the task's
   * `runCount` is incremented and `lastRun` is updated. If the task has an
   * `expiresAt` value and it has passed, the loop is cancelled automatically.
   *
   * @param task - The loop task configuration to register.
   * @param onTick - Async callback invoked on each tick with the current task state.
   * @throws {Error} If the scheduler already holds {@link MAX_LOOPS} active loops.
   */
  addLoop(task: LoopTask, onTick: (task: LoopTask) => Promise<void>): void {
    if (this.loops.size >= MAX_LOOPS) {
      throw new Error(
        `LoopScheduler: cannot add loop "${task.id}" — maximum of ${MAX_LOOPS} loops reached.`
      );
    }

    const entry: LoopEntry = { task: { ...task }, timer: null };
    this.loops.set(task.id, entry);

    const timer = setInterval(() => {
      void (async () => {
        const current = this.loops.get(task.id);
        if (!current) return;

        // Auto-expire: cancel if expiresAt is set and has passed.
        if (current.task.expiresAt) {
          const expiry = new Date(current.task.expiresAt);
          if (!isNaN(expiry.getTime()) && expiry <= new Date()) {
            this.cancelLoop(task.id);
            return;
          }
        }

        current.task.lastRun = new Date().toISOString();
        current.task.runCount += 1;

        await onTick(current.task);
      })();
    }, task.interval);

    entry.timer = timer;
    this.timers.set(task.id, timer);
  }

  /**
   * Cancels the loop task with the given ID and removes it from the scheduler.
   *
   * A no-op if no loop with `id` exists.
   *
   * @param id - The ID of the loop task to cancel.
   */
  cancelLoop(id: string): void {
    const timer = this.timers.get(id);
    if (timer !== undefined) {
      clearInterval(timer);
      this.timers.delete(id);
    }
    this.loops.delete(id);
  }

  /**
   * Cancels all active loop tasks.
   */
  cancelAll(): void {
    for (const id of [...this.loops.keys()]) {
      this.cancelLoop(id);
    }
  }

  /**
   * Returns a snapshot of all currently active loop tasks.
   *
   * @returns Array of active {@link LoopTask} objects (copies of internal state).
   */
  listLoops(): LoopTask[] {
    return [...this.loops.values()].map((entry) => ({ ...entry.task }));
  }

  /**
   * Returns the loop task with the given ID, or `undefined` if not found.
   *
   * @param id - The loop task ID to look up.
   * @returns A copy of the {@link LoopTask}, or `undefined`.
   */
  getLoop(id: string): LoopTask | undefined {
    const entry = this.loops.get(id);
    return entry ? { ...entry.task } : undefined;
  }
}
