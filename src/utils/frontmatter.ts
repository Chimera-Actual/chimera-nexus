/**
 * @file YAML frontmatter parsing and serialization.
 *
 * Splits a markdown string into its YAML frontmatter block and body, and
 * provides the reverse operation for writing notes back to disk.
 *
 * Uses a lightweight manual parser -- no external YAML library required.
 * Handles simple key-value pairs, arrays (both inline and block), booleans,
 * numbers, and quoted strings. Does NOT handle nested objects or multi-line
 * values beyond arrays.
 */

/**
 * Splits a markdown string into its YAML frontmatter and body.
 *
 * If no frontmatter fence (`---`) is found, `frontmatter` will be an empty
 * object and `body` will be the full input string.
 *
 * @param content - Raw markdown string potentially containing a frontmatter block.
 * @returns An object containing the parsed `frontmatter` map and the `body` text.
 */
export function parseFrontmatter(content: string): {
  frontmatter: Record<string, unknown>;
  body: string;
} {
  if (!content.startsWith("---")) {
    return { frontmatter: {}, body: content };
  }

  const endIndex = content.indexOf("\n---", 3);
  if (endIndex === -1) {
    return { frontmatter: {}, body: content };
  }

  const yamlBlock = content.slice(4, endIndex).trim();
  const body = content.slice(endIndex + 4).replace(/^\r?\n/, "");
  const frontmatter: Record<string, unknown> = {};

  const lines = yamlBlock.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const match = line.match(/^(\w[\w\-]*)\s*:\s*(.*)/);
    if (!match) {
      i++;
      continue;
    }

    const key = match[1];
    const rawValue = match[2].trim();

    // Check for block array (value is empty, next lines start with "  - ")
    if (rawValue === "" && i + 1 < lines.length && lines[i + 1].match(/^\s+-\s/)) {
      const items: string[] = [];
      i++;
      while (i < lines.length && lines[i].match(/^\s+-\s/)) {
        const itemMatch = lines[i].match(/^\s+-\s+(.*)/);
        if (itemMatch) {
          items.push(parseScalar(itemMatch[1].trim()) as string);
        }
        i++;
      }
      frontmatter[key] = items;
      continue;
    }

    // Inline array: [item1, item2]
    if (rawValue.startsWith("[") && rawValue.endsWith("]")) {
      const inner = rawValue.slice(1, -1);
      if (inner.trim() === "") {
        frontmatter[key] = [];
      } else {
        frontmatter[key] = inner.split(",").map((s) => parseScalar(s.trim()));
      }
      i++;
      continue;
    }

    frontmatter[key] = parseScalar(rawValue);
    i++;
  }

  return { frontmatter, body };
}

/**
 * Parses a single YAML scalar value into its JavaScript equivalent.
 *
 * @param value - The raw string value from the YAML line.
 * @returns Parsed boolean, number, null, or string.
 */
function parseScalar(value: string): unknown {
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null" || value === "~" || value === "") return null;

  // Quoted string -- strip quotes
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  // Number
  if (/^-?\d+(\.\d+)?$/.test(value)) {
    return Number(value);
  }

  return value;
}

/**
 * Serialises a frontmatter map and body back into a single markdown string.
 *
 * @param frontmatter - Key-value pairs to write into the YAML block.
 * @param body - The markdown body that follows the frontmatter fence.
 * @returns A complete markdown string with a `---` delimited frontmatter block.
 */
export function stringifyFrontmatter(
  frontmatter: Record<string, unknown>,
  body: string
): string {
  const lines: string[] = ["---"];

  for (const [key, value] of Object.entries(frontmatter)) {
    if (Array.isArray(value)) {
      if (value.length === 0) {
        lines.push(`${key}: []`);
      } else {
        lines.push(`${key}:`);
        for (const item of value) {
          lines.push(`  - ${formatScalar(item)}`);
        }
      }
    } else {
      lines.push(`${key}: ${formatScalar(value)}`);
    }
  }

  lines.push("---");
  return lines.join("\n") + "\n" + body;
}

/**
 * Formats a scalar value for YAML output.
 *
 * @param value - The value to format.
 * @returns A YAML-safe string representation.
 */
function formatScalar(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean") return String(value);
  if (typeof value === "number") return String(value);
  const str = String(value);
  // Quote strings that contain special YAML characters
  if (/[:#\[\]{}&*!|>%@`,]/.test(str) || str === "" || str === "true" || str === "false") {
    return `"${str.replace(/"/g, '\\"')}"`;
  }
  return str;
}
