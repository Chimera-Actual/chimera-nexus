/**
 * @file 5-field cron expression evaluator.
 *
 * Parses standard 5-field cron expressions (`minute hour day month weekday`)
 * and provides `matches` and `nextRun` query methods.
 */

// TODO: Not yet implemented -- implement field tokenizer and date arithmetic.

/**
 * Parses a 5-field cron expression and returns query helpers.
 *
 * @param expression - A standard 5-field cron string (e.g. `"0 9 * * 1-5"`).
 * @returns An object with `matches(date)` and `nextRun(after)` methods.
 */
export function parseCron(expression: string): {
  /** Returns `true` if `date` satisfies the cron expression. */
  matches(date: Date): boolean;
  /** Returns the next date after `after` that satisfies the expression. */
  nextRun(after: Date): Date;
} {
  void expression;
  throw new Error("Not implemented");
}
