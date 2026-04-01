import { parseFrontmatter, stringifyFrontmatter } from "../../src/utils/frontmatter";

describe("parseFrontmatter", () => {
  it("parses standard frontmatter with string values", () => {
    const input = `---
title: Hello World
author: Jane Doe
---
Body text here.`;
    const { frontmatter, body } = parseFrontmatter(input);
    expect(frontmatter.title).toBe("Hello World");
    expect(frontmatter.author).toBe("Jane Doe");
    expect(body).toBe("Body text here.");
  });

  it("parses boolean values", () => {
    const input = `---
published: true
draft: false
---
`;
    const { frontmatter } = parseFrontmatter(input);
    expect(frontmatter.published).toBe(true);
    expect(frontmatter.draft).toBe(false);
  });

  it("parses number values", () => {
    const input = `---
priority: 42
weight: 3.14
---
`;
    const { frontmatter } = parseFrontmatter(input);
    expect(frontmatter.priority).toBe(42);
    expect(frontmatter.weight).toBe(3.14);
  });

  it("parses block arrays (lines starting with '  - ')", () => {
    const input = `---
tags:
  - typescript
  - testing
  - jest
---
`;
    const { frontmatter } = parseFrontmatter(input);
    expect(frontmatter.tags).toEqual(["typescript", "testing", "jest"]);
  });

  it("parses inline arrays ([item1, item2])", () => {
    const input = `---
categories: [news, tech, science]
---
`;
    const { frontmatter } = parseFrontmatter(input);
    expect(frontmatter.categories).toEqual(["news", "tech", "science"]);
  });

  it("parses empty inline arrays ([])", () => {
    const input = `---
tags: []
---
`;
    const { frontmatter } = parseFrontmatter(input);
    expect(frontmatter.tags).toEqual([]);
  });

  it("parses quoted strings (double quotes)", () => {
    const input = `---
title: "My: Special Title"
---
`;
    const { frontmatter } = parseFrontmatter(input);
    expect(frontmatter.title).toBe("My: Special Title");
  });

  it("parses quoted strings (single quotes)", () => {
    const input = `---
title: 'Single Quoted'
---
`;
    const { frontmatter } = parseFrontmatter(input);
    expect(frontmatter.title).toBe("Single Quoted");
  });

  it("returns empty frontmatter when no --- delimiters", () => {
    const input = "Just plain text, no frontmatter at all.";
    const { frontmatter, body } = parseFrontmatter(input);
    expect(frontmatter).toEqual({});
    expect(body).toBe(input);
  });

  it("returns empty frontmatter when only opening --- exists", () => {
    const input = `---
title: Orphaned
no closing delimiter`;
    const { frontmatter, body } = parseFrontmatter(input);
    expect(frontmatter).toEqual({});
    expect(body).toBe(input);
  });

  it("handles empty body after frontmatter", () => {
    const input = `---
title: No Body
---`;
    const { frontmatter, body } = parseFrontmatter(input);
    expect(frontmatter.title).toBe("No Body");
    expect(body).toBe("");
  });

  it("handles special characters in values", () => {
    const input = `---
description: "hello: world [test] {foo}"
---
`;
    const { frontmatter } = parseFrontmatter(input);
    expect(frontmatter.description).toBe("hello: world [test] {foo}");
  });
});

describe("stringifyFrontmatter", () => {
  it("roundtrip: parse then stringify produces equivalent output", () => {
    const input = `---
title: Hello World
published: true
priority: 5
---
Body content here.`;
    const { frontmatter, body } = parseFrontmatter(input);
    const output = stringifyFrontmatter(frontmatter, body);
    const reparsed = parseFrontmatter(output);
    expect(reparsed.frontmatter).toEqual(frontmatter);
    expect(reparsed.body).toBe(body);
  });

  it("stringifyFrontmatter with arrays", () => {
    const frontmatter = { tags: ["alpha", "beta", "gamma"] };
    const body = "Some content.";
    const output = stringifyFrontmatter(frontmatter, body);
    expect(output).toContain("tags:");
    expect(output).toContain("  - alpha");
    expect(output).toContain("  - beta");
    expect(output).toContain("  - gamma");
    expect(output).toContain(body);
    // Verify it round-trips correctly
    const { frontmatter: reparsed } = parseFrontmatter(output);
    expect(reparsed.tags).toEqual(["alpha", "beta", "gamma"]);
  });

  it("stringifyFrontmatter with empty object produces valid output", () => {
    const output = stringifyFrontmatter({}, "Body text.");
    expect(output).toMatch(/^---\n---\n/);
    expect(output).toContain("Body text.");
    // Should be parseable without error
    const { frontmatter, body } = parseFrontmatter(output);
    expect(frontmatter).toEqual({});
    expect(body).toBe("Body text.");
  });
});
