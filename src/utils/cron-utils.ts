/**
 * @file Cron expression matching and next-run calculation.
 *
 * Convenience wrappers around the lower-level {@link parseCron} evaluator,
 * providing standalone functions for the most common cron queries.
 */

import { parseCron } from "../core/scheduler/cron-parser";

/**
 * Returns `true` if `date` matches the 5-field cron `expression`.
 *
 * @param expression - A standard 5-field cron string (e.g. `"0 9 * * 1-5"`).
 * @param date - The date to test against the expression.
 * @returns `true` if the date satisfies the expression.
 */
export function matchesCron(expression: string, date: Date): boolean {
  return parseCron(expression).matches(date);
}

/**
 * Returns the next date strictly after `after` on which the cron `expression`
 * fires.
 *
 * @param expression - A standard 5-field cron string.
 * @param after - The reference date; the result will be strictly after this.
 * @returns The next matching date.
 */
export function nextCronRun(expression: string, after: Date): Date {
  return parseCron(expression).nextRun(after);
}
