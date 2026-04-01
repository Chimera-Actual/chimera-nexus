/**
 * @file Approximate token counting and budget-aware truncation.
 *
 * Provides fast heuristic token estimation and a truncation helper that
 * keeps a text string within a given token budget.
 */

// TODO: Not yet implemented -- implement character-ratio estimator and truncation loop.

/**
 * Returns an approximate token count for `text`.
 *
 * Uses a simple character-based heuristic (roughly 4 characters per token
 * for English prose) rather than a full tokenizer for performance.
 *
 * @param text - The text to estimate.
 * @returns Estimated token count.
 */
export function estimateTokens(text: string): number {
  void text;
  throw new Error("Not implemented");
}

/**
 * Truncates `text` so that its estimated token count does not exceed `budget`.
 *
 * Truncation removes content from the end of the string.
 *
 * @param text - The text to truncate.
 * @param budget - Maximum number of tokens allowed.
 * @returns The (possibly truncated) text.
 */
export function truncateToTokenBudget(text: string, budget: number): string {
  void text;
  void budget;
  throw new Error("Not implemented");
}
