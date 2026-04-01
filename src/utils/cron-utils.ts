/**
 * @file Cron expression matching and next-run calculation.
 *
 * Convenience wrappers around the lower-level {@link parseCron} evaluator,
 * providing standalone functions for the most common cron queries.
 */

// TODO: Not yet implemented -- delegate to parseCron once implemented.

/**
 * Returns `true` if `date` matches the 5-field cron `expression`.
 *
 * @param expression - A standard 5-field cron string (e.g. `"0 9 * * 1-5"`).
 * @param date - The date to test against the expression.
 * @returns `true` if the date satisfies the expression.
 */
export function matchesCron(expression: string, date: Date): boolean {
  void expression;
  void date;
  throw new Error("Not implemented");
}

/**
 * Returns the next date after `after` on which the cron `expression` fires.
 *
 * @param expression - A standard 5-field cron string.
 * @param after - The reference date; the result will be strictly after this.
 * @returns The next matching date.
 */
export function nextCronRun(expression: string, after: Date): Date {
  void expression;
  void after;
  throw new Error("Not implemented");
}
