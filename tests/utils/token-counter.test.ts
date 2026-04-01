import { estimateTokens, truncateToTokenBudget } from "../../src/utils/token-counter";

describe("estimateTokens", () => {
  it("returns 0 for empty string", () => {
    expect(estimateTokens("")).toBe(0);
  });

  it("returns chars/4 rounded up", () => {
    // 9 chars -> ceil(9/4) = 3
    expect(estimateTokens("123456789")).toBe(3);
    // 8 chars -> ceil(8/4) = 2
    expect(estimateTokens("12345678")).toBe(2);
    // 12 chars -> ceil(12/4) = 3
    expect(estimateTokens("abcdefghijkl")).toBe(3);
  });

  it("handles short strings", () => {
    // 1 char -> ceil(1/4) = 1
    expect(estimateTokens("a")).toBe(1);
    // 4 chars -> ceil(4/4) = 1
    expect(estimateTokens("abcd")).toBe(1);
    // 5 chars -> ceil(5/4) = 2
    expect(estimateTokens("abcde")).toBe(2);
  });
});

describe("truncateToTokenBudget", () => {
  it("returns text as-is when within budget", () => {
    const text = "Hello world.";
    // 12 chars -> 3 tokens, budget 10 tokens = 40 chars -> no truncation
    expect(truncateToTokenBudget(text, 10)).toBe(text);
  });

  it("truncates at sentence boundary", () => {
    // budget 5 tokens = 20 chars
    // Text is longer than 20 chars; should cut at last sentence boundary within first 20 chars
    const text = "Hello world. This is extra text that goes on and on.";
    const result = truncateToTokenBudget(text, 5);
    expect(result).toContain("Hello world.");
    expect(result).toMatch(/\.\.\.$/);
    expect(result.length).toBeLessThan(text.length);
  });

  it("truncates at word boundary when no sentence boundary", () => {
    // budget 3 tokens = 12 chars
    // "Hello there everyone" - no sentence boundary in first 12 chars ("Hello there ")
    const text = "Hello there everyone is here";
    const result = truncateToTokenBudget(text, 3);
    expect(result).toMatch(/\.\.\.$/);
    // Should not cut mid-word
    const withoutEllipsis = result.slice(0, -3);
    expect(withoutEllipsis).toBe(withoutEllipsis.trimEnd());
  });

  it("hard truncates when no boundaries found", () => {
    // budget 1 token = 4 chars
    // "abcdefghij" - no spaces or sentence boundaries
    const text = "abcdefghij";
    const result = truncateToTokenBudget(text, 1);
    expect(result).toBe("abcd...");
  });

  it("appends '...' to truncated text", () => {
    const text = "This is a long sentence. And another one follows it closely.";
    const result = truncateToTokenBudget(text, 3); // 12 chars limit
    expect(result).toMatch(/\.\.\.$/);
  });

  it("truncateToTokenBudget handles budget of 0", () => {
    const text = "Any text at all";
    const result = truncateToTokenBudget(text, 0);
    // charLimit = 0, text.length > 0, so truncation occurs
    // slice(0, 0) = "" -> no boundaries -> hard truncate "" + "..."
    expect(result).toBe("...");
  });
});
