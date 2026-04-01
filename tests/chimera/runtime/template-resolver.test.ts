/**
 * @file Unit tests for resolveTemplate.
 */

import { resolveTemplate } from "../../../src/chimera/runtime/template-resolver";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns today's date as YYYY-MM-DD using the same local-time logic as the
 *  implementation so that tests remain timezone-consistent. */
function localDateString(offset = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/** Simple ISO week helper mirroring the implementation's algorithm. */
function isoWeek(date: Date): number {
  const d = new Date(date);
  const day = d.getDay() || 7;
  d.setDate(d.getDate() + 4 - day);
  const yearStart = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("resolveTemplate", () => {
  // 1. {{today}}
  it("resolves {{today}} to YYYY-MM-DD format", () => {
    const result = resolveTemplate("{{today}}");
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result).toBe(localDateString(0));
  });

  // 2. {{yesterday}}
  it("resolves {{yesterday}} to the previous day", () => {
    const result = resolveTemplate("{{yesterday}}");
    expect(result).toBe(localDateString(-1));
  });

  // 3. {{tomorrow}}
  it("resolves {{tomorrow}} to the next day", () => {
    const result = resolveTemplate("{{tomorrow}}");
    expect(result).toBe(localDateString(1));
  });

  // 4. {{now}}
  it("resolves {{now}} to an ISO timestamp", () => {
    const before = Date.now();
    const result = resolveTemplate("{{now}}");
    const after = Date.now();
    const ts = new Date(result).getTime();
    // The resolved timestamp must fall within the test's time window.
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
    // Must look like an ISO string.
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  // 5. {{week}}
  it("resolves {{week}} to W## format", () => {
    const result = resolveTemplate("{{week}}");
    expect(result).toMatch(/^W\d{1,2}$/);
    const expected = `W${isoWeek(new Date())}`;
    expect(result).toBe(expected);
  });

  // 6. {{date:FORMAT}}
  it("resolves {{date:YYYY-MM-DD}} correctly", () => {
    const result = resolveTemplate("{{date:YYYY-MM-DD}}");
    expect(result).toBe(localDateString(0));
  });

  it("resolves {{date:YYYY/MM/DD}} with custom separators", () => {
    const result = resolveTemplate("{{date:YYYY/MM/DD}}");
    const today = localDateString(0).replace(/-/g, "/");
    expect(result).toBe(today);
  });

  // 7. Custom variables from vars parameter
  it("resolves custom variables from the vars parameter", () => {
    const result = resolveTemplate("Hello {{name}}!", { name: "World" });
    expect(result).toBe("Hello World!");
  });

  it("resolves multiple different custom variables", () => {
    const result = resolveTemplate("{{greeting}}, {{name}}!", {
      greeting: "Hi",
      name: "Alice",
    });
    expect(result).toBe("Hi, Alice!");
  });

  // 8. Custom vars override builtins
  it("custom vars override built-in variables", () => {
    const result = resolveTemplate("{{today}}", { today: "overridden" });
    expect(result).toBe("overridden");
  });

  // 9. Unknown variables left as-is
  it("leaves unknown variables unchanged", () => {
    const result = resolveTemplate("{{unknown}}");
    expect(result).toBe("{{unknown}}");
  });

  it("leaves unknown variables unchanged when other vars are resolved", () => {
    const result = resolveTemplate("{{today}} and {{unknown}}");
    expect(result).toContain("{{unknown}}");
    expect(result).not.toContain("{{today}}");
  });

  // 10. Empty template
  it("returns an empty string for an empty template", () => {
    expect(resolveTemplate("")).toBe("");
  });

  // 11. Template with no variables
  it("returns the template unchanged when it contains no placeholders", () => {
    const plain = "No placeholders here.";
    expect(resolveTemplate(plain)).toBe(plain);
  });

  // 12. Multiple variables in one string
  it("resolves multiple built-in variables in a single template", () => {
    const result = resolveTemplate(
      "Today: {{today}}, Yesterday: {{yesterday}}, Tomorrow: {{tomorrow}}"
    );
    expect(result).toBe(
      `Today: ${localDateString(0)}, Yesterday: ${localDateString(-1)}, Tomorrow: ${localDateString(1)}`
    );
  });

  // Bonus: nested braces don't crash
  it("handles nested braces gracefully without crashing", () => {
    expect(() => resolveTemplate("{{{today}}}")).not.toThrow();
    // {{{today}}} does not match the {{...}} pattern (extra outer brace),
    // so it is left unchanged rather than partially resolved.
    const result = resolveTemplate("{{{today}}}");
    expect(result).toBe("{{{today}}}");
  });
});
