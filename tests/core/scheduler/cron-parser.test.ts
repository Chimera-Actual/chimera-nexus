import { parseCron } from "../../../src/core/scheduler/cron-parser";
import { matchesCron, nextCronRun } from "../../../src/utils/cron-utils";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a Date at a specific local time without seconds/ms. */
function d(
  year: number,
  month: number, // 1-based
  day: number,
  hour = 0,
  minute = 0
): Date {
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

// ---------------------------------------------------------------------------
// parseCron – matches()
// ---------------------------------------------------------------------------

describe("parseCron – matches()", () => {
  test("1. '* * * * *' matches any date", () => {
    const cron = parseCron("* * * * *");
    expect(cron.matches(d(2024, 1, 1, 0, 0))).toBe(true);
    expect(cron.matches(d(2024, 6, 15, 12, 30))).toBe(true);
    expect(cron.matches(d(2024, 12, 31, 23, 59))).toBe(true);
  });

  test("2. '0 8 * * *' matches 8:00 AM only", () => {
    const cron = parseCron("0 8 * * *");
    expect(cron.matches(d(2024, 3, 15, 8, 0))).toBe(true);
    expect(cron.matches(d(2024, 3, 15, 8, 1))).toBe(false);
    expect(cron.matches(d(2024, 3, 15, 7, 0))).toBe(false);
    expect(cron.matches(d(2024, 3, 15, 9, 0))).toBe(false);
  });

  test("3. '0 8 * * 1-5' matches weekdays at 8 AM", () => {
    const cron = parseCron("0 8 * * 1-5");
    // 2024-03-18 is a Monday (day 1)
    expect(cron.matches(d(2024, 3, 18, 8, 0))).toBe(true);
    // 2024-03-22 is a Friday (day 5)
    expect(cron.matches(d(2024, 3, 22, 8, 0))).toBe(true);
    // 2024-03-23 is a Saturday (day 6) – should NOT match
    expect(cron.matches(d(2024, 3, 23, 8, 0))).toBe(false);
    // 2024-03-24 is a Sunday (day 0) – should NOT match
    expect(cron.matches(d(2024, 3, 24, 8, 0))).toBe(false);
    // Correct day but wrong time
    expect(cron.matches(d(2024, 3, 18, 9, 0))).toBe(false);
  });

  test("4. '*/15 * * * *' matches every 15 minutes (0, 15, 30, 45)", () => {
    const cron = parseCron("*/15 * * * *");
    expect(cron.matches(d(2024, 1, 1, 10, 0))).toBe(true);
    expect(cron.matches(d(2024, 1, 1, 10, 15))).toBe(true);
    expect(cron.matches(d(2024, 1, 1, 10, 30))).toBe(true);
    expect(cron.matches(d(2024, 1, 1, 10, 45))).toBe(true);
    expect(cron.matches(d(2024, 1, 1, 10, 1))).toBe(false);
    expect(cron.matches(d(2024, 1, 1, 10, 14))).toBe(false);
    expect(cron.matches(d(2024, 1, 1, 10, 16))).toBe(false);
  });

  test("5. '0 0 1 * *' matches first of every month at midnight", () => {
    const cron = parseCron("0 0 1 * *");
    expect(cron.matches(d(2024, 1, 1, 0, 0))).toBe(true);
    expect(cron.matches(d(2024, 7, 1, 0, 0))).toBe(true);
    expect(cron.matches(d(2024, 12, 1, 0, 0))).toBe(true);
    // Day 2 – should NOT match
    expect(cron.matches(d(2024, 1, 2, 0, 0))).toBe(false);
    // Wrong time
    expect(cron.matches(d(2024, 1, 1, 0, 1))).toBe(false);
  });

  test("6. '5,10,15 * * * *' matches minutes 5, 10, 15", () => {
    const cron = parseCron("5,10,15 * * * *");
    expect(cron.matches(d(2024, 1, 1, 10, 5))).toBe(true);
    expect(cron.matches(d(2024, 1, 1, 10, 10))).toBe(true);
    expect(cron.matches(d(2024, 1, 1, 10, 15))).toBe(true);
    expect(cron.matches(d(2024, 1, 1, 10, 0))).toBe(false);
    expect(cron.matches(d(2024, 1, 1, 10, 6))).toBe(false);
    expect(cron.matches(d(2024, 1, 1, 10, 20))).toBe(false);
  });

  test("bonus: day-of-week names (MON-FRI)", () => {
    const cron = parseCron("0 8 * * MON-FRI");
    expect(cron.matches(d(2024, 3, 18, 8, 0))).toBe(true);  // Monday
    expect(cron.matches(d(2024, 3, 22, 8, 0))).toBe(true);  // Friday
    expect(cron.matches(d(2024, 3, 23, 8, 0))).toBe(false); // Saturday
  });

  test("bonus: month names (JAN,JUL,DEC)", () => {
    const cron = parseCron("0 0 1 JAN,JUL,DEC *");
    expect(cron.matches(d(2024, 1, 1, 0, 0))).toBe(true);
    expect(cron.matches(d(2024, 7, 1, 0, 0))).toBe(true);
    expect(cron.matches(d(2024, 12, 1, 0, 0))).toBe(true);
    expect(cron.matches(d(2024, 3, 1, 0, 0))).toBe(false);
  });

  test("bonus: step within range (1-10/2 matches 1,3,5,7,9)", () => {
    const cron = parseCron("1-10/2 * * * *");
    [1, 3, 5, 7, 9].forEach((m) =>
      expect(cron.matches(d(2024, 1, 1, 0, m))).toBe(true)
    );
    [0, 2, 4, 6, 8, 10, 11].forEach((m) =>
      expect(cron.matches(d(2024, 1, 1, 0, m))).toBe(false)
    );
  });
});

// ---------------------------------------------------------------------------
// parseCron – nextRun()
// ---------------------------------------------------------------------------

describe("parseCron – nextRun()", () => {
  test("7. nextRun finds the correct next time", () => {
    const cron = parseCron("0 9 * * *");
    // Starting well before 9 AM – next run should be 9:00 same day.
    const after = d(2024, 3, 15, 7, 0);
    const next = cron.nextRun(after);
    expect(next).toEqual(d(2024, 3, 15, 9, 0));
  });

  test("8. nextRun from 7:59 with '0 8 * * *' returns 8:00 same day", () => {
    const after = d(2024, 3, 15, 7, 59);
    const next = parseCron("0 8 * * *").nextRun(after);
    expect(next).toEqual(d(2024, 3, 15, 8, 0));
  });

  test("9. nextRun from 8:01 with '0 8 * * *' returns 8:00 next day", () => {
    const after = d(2024, 3, 15, 8, 1);
    const next = parseCron("0 8 * * *").nextRun(after);
    expect(next).toEqual(d(2024, 3, 16, 8, 0));
  });

  test("nextRun for '*/15 * * * *' from :07 returns :15", () => {
    const after = d(2024, 6, 1, 10, 7);
    const next = parseCron("*/15 * * * *").nextRun(after);
    expect(next).toEqual(d(2024, 6, 1, 10, 15));
  });

  test("nextRun for '*/15 * * * *' from :45 returns :00 next hour", () => {
    const after = d(2024, 6, 1, 10, 45);
    const next = parseCron("*/15 * * * *").nextRun(after);
    expect(next).toEqual(d(2024, 6, 1, 11, 0));
  });

  test("nextRun is strictly after 'after', not equal", () => {
    // Even if 'after' itself matches, nextRun should return a later time.
    const after = d(2024, 3, 15, 8, 0);
    const next = parseCron("0 8 * * *").nextRun(after);
    expect(next.getTime()).toBeGreaterThan(after.getTime());
    expect(next).toEqual(d(2024, 3, 16, 8, 0));
  });
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

describe("parseCron – error handling", () => {
  test("10. Invalid expression (wrong field count) throws", () => {
    expect(() => parseCron("* * * *")).toThrow();
    expect(() => parseCron("* * * * * *")).toThrow();
    expect(() => parseCron("")).toThrow();
  });

  test("Invalid field value (out of range) throws", () => {
    expect(() => parseCron("60 * * * *")).toThrow();
    expect(() => parseCron("* 24 * * *")).toThrow();
  });

  test("Invalid token throws", () => {
    expect(() => parseCron("abc * * * *")).toThrow();
  });
});

// ---------------------------------------------------------------------------
// cron-utils wrappers
// ---------------------------------------------------------------------------

describe("cron-utils convenience wrappers", () => {
  test("matchesCron delegates correctly", () => {
    expect(matchesCron("0 8 * * *", d(2024, 3, 15, 8, 0))).toBe(true);
    expect(matchesCron("0 8 * * *", d(2024, 3, 15, 9, 0))).toBe(false);
  });

  test("nextCronRun delegates correctly", () => {
    const result = nextCronRun("0 8 * * *", d(2024, 3, 15, 7, 59));
    expect(result).toEqual(d(2024, 3, 15, 8, 0));
  });
});
