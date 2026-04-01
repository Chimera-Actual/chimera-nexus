/**
 * @file 5-field cron expression evaluator.
 *
 * Parses standard 5-field cron expressions (`minute hour day month weekday`)
 * and provides `matches` and `nextRun` query methods.
 */

/** Represents a parsed and queryable cron expression. */
export interface CronExpression {
  /** Returns `true` if `date` satisfies the cron expression. */
  matches(date: Date): boolean;
  /** Returns the next date strictly after `after` that satisfies the expression. */
  nextRun(after: Date): Date;
}

/** Maps day-of-week name abbreviations to their numeric equivalents (Sunday=0). */
const DAY_NAMES: Record<string, number> = {
  SUN: 0,
  MON: 1,
  TUE: 2,
  WED: 3,
  THU: 4,
  FRI: 5,
  SAT: 6,
};

/** Maps month name abbreviations to their numeric equivalents (January=1). */
const MONTH_NAMES: Record<string, number> = {
  JAN: 1,
  FEB: 2,
  MAR: 3,
  APR: 4,
  MAY: 5,
  JUN: 6,
  JUL: 7,
  AUG: 8,
  SEP: 9,
  OCT: 10,
  NOV: 11,
  DEC: 12,
};

/**
 * Normalise a single token that may be a name alias (e.g. "MON", "JAN") or a
 * plain integer string. Returns the numeric string to use in further parsing.
 */
function resolveAlias(token: string, names: Record<string, number>): string {
  const upper = token.toUpperCase();
  if (upper in names) {
    return String(names[upper]);
  }
  return token;
}

/**
 * Parse a single cron field token (may include aliases) into the integer it
 * represents. Throws if the result is not a finite integer.
 */
function parseToken(
  token: string,
  names: Record<string, number>
): number {
  const resolved = resolveAlias(token, names);
  const n = Number(resolved);
  if (!Number.isInteger(n)) {
    throw new Error(`Invalid cron token: "${token}"`);
  }
  return n;
}

/**
 * Expand a single cron field string into the `Set<number>` of valid values.
 *
 * Supported syntax:
 * - `*`           – all values in [min, max]
 * - `n`           – single value
 * - `n-m`         – inclusive range
 * - `* /step`     – every `step` starting from `min` (no space in real usage)
 * - `n-m/step`    – every `step` within range
 * - `a,b,c`       – comma-separated list (each part may itself use the above)
 *
 * @param field  - The raw field string from the cron expression.
 * @param min    - The minimum valid value for this field.
 * @param max    - The maximum valid value for this field.
 * @param names  - Optional name-to-number alias map (e.g. day/month names).
 */
function expandField(
  field: string,
  min: number,
  max: number,
  names: Record<string, number> = {}
): Set<number> {
  const result = new Set<number>();

  // Comma-separated list: split and recurse.
  if (field.includes(",")) {
    for (const part of field.split(",")) {
      for (const v of expandField(part.trim(), min, max, names)) {
        result.add(v);
      }
    }
    return result;
  }

  // Step syntax: <range>/<step>
  if (field.includes("/")) {
    const slashIdx = field.indexOf("/");
    const rangePart = field.slice(0, slashIdx);
    const stepStr = field.slice(slashIdx + 1);
    const step = Number(stepStr);
    if (!Number.isInteger(step) || step < 1) {
      throw new Error(`Invalid step in cron field: "${field}"`);
    }

    let rangeMin = min;
    let rangeMax = max;

    if (rangePart !== "*") {
      if (rangePart.includes("-")) {
        const [lo, hi] = rangePart.split("-");
        rangeMin = parseToken(lo, names);
        rangeMax = parseToken(hi, names);
      } else {
        rangeMin = parseToken(rangePart, names);
        rangeMax = max;
      }
    }

    for (let v = rangeMin; v <= rangeMax; v += step) {
      if (v >= min && v <= max) result.add(v);
    }
    return result;
  }

  // Wildcard: all values.
  if (field === "*") {
    for (let v = min; v <= max; v++) result.add(v);
    return result;
  }

  // Range: n-m
  if (field.includes("-")) {
    const [lo, hi] = field.split("-");
    const rangeMin = parseToken(lo, names);
    const rangeMax = parseToken(hi, names);
    for (let v = rangeMin; v <= rangeMax; v++) {
      if (v >= min && v <= max) result.add(v);
    }
    return result;
  }

  // Single value.
  const v = parseToken(field, names);
  if (v < min || v > max) {
    throw new Error(`Cron value ${v} out of range [${min}, ${max}]`);
  }
  result.add(v);
  return result;
}

/**
 * Parses a 5-field cron expression and returns query helpers.
 *
 * Fields (space-separated): `minute hour day-of-month month day-of-week`
 *
 * Supported field syntax:
 * - `*`              – every value
 * - `n`              – single number
 * - `n-m`            – inclusive range
 * - `* /step`        – step from minimum (no space in real usage: `*\/5`)
 * - `n-m/step`       – step within range
 * - `a,b,c`          – comma list (each part may be any of the above)
 * - Day-of-week names: `SUN MON TUE WED THU FRI SAT`
 * - Month names:      `JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC`
 *
 * @param expression - A standard 5-field cron string (e.g. `"0 9 * * 1-5"`).
 * @returns A {@link CronExpression} with `matches(date)` and `nextRun(after)`.
 * @throws {Error} If the expression does not contain exactly 5 fields or any
 *   field contains an invalid token or out-of-range value.
 */
export function parseCron(expression: string): CronExpression {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) {
    throw new Error(
      `Invalid cron expression: expected 5 fields, got ${fields.length}: "${expression}"`
    );
  }

  const [minuteField, hourField, domField, monthField, dowField] = fields;

  const minutes = expandField(minuteField, 0, 59);
  const hours = expandField(hourField, 0, 23);
  const daysOfMonth = expandField(domField, 1, 31);
  const months = expandField(monthField, 1, 12, MONTH_NAMES);
  const daysOfWeek = expandField(dowField, 0, 6, DAY_NAMES);

  /**
   * Check whether a given `Date` matches all five cron fields.
   * Note: month from `getMonth()` is 0-based; day-of-week from `getDay()` is
   * already 0-based (Sunday=0).
   */
  function matches(date: Date): boolean {
    return (
      minutes.has(date.getMinutes()) &&
      hours.has(date.getHours()) &&
      daysOfMonth.has(date.getDate()) &&
      months.has(date.getMonth() + 1) &&
      daysOfWeek.has(date.getDay())
    );
  }

  /**
   * Find the next time strictly after `after` that satisfies the cron
   * expression by advancing minute-by-minute up to 366 days ahead.
   *
   * @throws {Error} If no matching time is found within the safety limit.
   */
  function nextRun(after: Date): Date {
    // Start one minute after the given date, truncated to whole minutes.
    const candidate = new Date(after);
    candidate.setSeconds(0, 0);
    candidate.setMinutes(candidate.getMinutes() + 1);

    const limitMs = 366 * 24 * 60 * 60 * 1000; // 366 days
    const deadline = new Date(after.getTime() + limitMs);

    while (candidate < deadline) {
      if (matches(candidate)) {
        return new Date(candidate);
      }
      candidate.setMinutes(candidate.getMinutes() + 1);
    }

    throw new Error(
      `No next run found within 366 days for cron expression: "${expression}"`
    );
  }

  return { matches, nextRun };
}
