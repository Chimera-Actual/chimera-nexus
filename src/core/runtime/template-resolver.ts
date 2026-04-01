/**
 * @file Resolves {{variable}} template strings in prompts and paths.
 *
 * Replaces `{{variable}}` placeholders in prompt templates and vault paths
 * with the corresponding values from a supplied variable map, as well as
 * a set of built-in date/time variables.
 */

// ---------------------------------------------------------------------------
// Module-private helpers
// ---------------------------------------------------------------------------

/** Returns a zero-padded string of `n` with at least `width` digits. */
function pad(n: number, width = 2): string {
  return String(n).padStart(width, "0");
}

/** Formats a Date as YYYY-MM-DD. */
function formatDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Returns a new Date shifted by `days` calendar days. */
function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Returns the ISO 8601 week number for `date`.
 *
 * Algorithm: find the Thursday in the same week (ISO weeks start on Monday),
 * then compute which week of the year that Thursday falls in.
 */
function getISOWeek(date: Date): number {
  const d = new Date(date);
  // Set to nearest Thursday: current date + 4 - current day number (Mon=1)
  const day = d.getDay() || 7; // treat Sunday (0) as 7
  d.setDate(d.getDate() + 4 - day);
  // Get first day of year
  const yearStart = new Date(d.getFullYear(), 0, 1);
  // Calculate full weeks to nearest Thursday
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

/**
 * Applies a custom format string to `date`.
 *
 * Supported tokens: YYYY, MM, DD, HH, mm, ss.
 */
function applyDateFormat(date: Date, format: string): string {
  return format
    .replace("YYYY", String(date.getFullYear()))
    .replace("MM", pad(date.getMonth() + 1))
    .replace("DD", pad(date.getDate()))
    .replace("HH", pad(date.getHours()))
    .replace("mm", pad(date.getMinutes()))
    .replace("ss", pad(date.getSeconds()));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Replaces all `{{variable}}` placeholders in `template` with values from
 * `vars` and a set of built-in date/time variables.
 *
 * **Built-in variables** (always available):
 * - `{{today}}` — today's date as `YYYY-MM-DD`
 * - `{{yesterday}}` — yesterday's date as `YYYY-MM-DD`
 * - `{{tomorrow}}` — tomorrow's date as `YYYY-MM-DD`
 * - `{{now}}` — current ISO timestamp
 * - `{{week}}` — ISO week number, e.g. `W14`
 * - `{{date:FORMAT}}` — current date with a custom format; supported tokens
 *   are `YYYY`, `MM`, `DD`, `HH`, `mm`, `ss`
 *
 * User-provided `vars` override built-ins when names collide.
 * Unknown placeholders are left unchanged.
 *
 * @param template - The template string containing `{{variable}}` tokens.
 * @param vars - Optional map of variable name to replacement value.
 * @returns The resolved string with all known placeholders substituted.
 */
export function resolveTemplate(
  template: string,
  vars?: Record<string, string>
): string {
  const now = new Date();

  const builtins: Record<string, string> = {
    today: formatDate(now),
    yesterday: formatDate(addDays(now, -1)),
    tomorrow: formatDate(addDays(now, 1)),
    now: now.toISOString(),
    week: `W${getISOWeek(now)}`,
  };

  // User-supplied vars override built-ins.
  const allVars: Record<string, string> = { ...builtins, ...vars };

  return template.replace(/\{\{([^}]+)\}\}/g, (match, key: string) => {
    const trimmed = key.trim();

    // Handle {{date:FORMAT}}
    if (trimmed.startsWith("date:")) {
      const format = trimmed.slice(5);
      return applyDateFormat(now, format);
    }

    return allVars[trimmed] ?? match; // leave unknown vars as-is
  });
}
