/**
 * @file Approximate token counting and budget-aware truncation.
 *
 * Provides fast heuristic token estimation and a truncation helper that
 * keeps a text string within a given token budget.
 */

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
  if (text.length === 0) return 0;
  return Math.ceil(text.length / 4);
}

/**
 * Truncates `text` so that its estimated token count does not exceed `budget`.
 *
 * Truncation removes content from the end of the string. Tries to find a
 * sentence boundary first, then a word boundary, and finally hard-truncates.
 * Appends "..." when truncation occurs.
 *
 * @param text - The text to truncate.
 * @param budget - Maximum number of tokens allowed.
 * @returns The (possibly truncated) text.
 */
export function truncateToTokenBudget(text: string, budget: number): string {
  const charLimit = budget * 4;

  if (text.length <= charLimit) {
    return text;
  }

  const slice = text.slice(0, charLimit);

  // Try sentence boundary: . ! ? followed by space or end of slice
  const sentenceMatch = slice.match(/^(.*[.!?])(?:\s|$)/s);
  if (sentenceMatch) {
    // Find the last sentence boundary within the slice
    const lastSentence = slice.search(/[.!?](?:\s|$)(?!.*[.!?](?:\s|$))/s);
    if (lastSentence !== -1) {
      // Find the position after the punctuation
      const endPos = lastSentence + 1;
      return slice.slice(0, endPos) + "...";
    }
  }

  // Try word boundary: last space
  const lastSpace = slice.lastIndexOf(" ");
  if (lastSpace !== -1) {
    return slice.slice(0, lastSpace) + "...";
  }

  // Hard truncate
  return slice + "...";
}
