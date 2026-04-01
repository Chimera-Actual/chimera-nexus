/**
 * @file Parses @agent-name mentions from user input.
 *
 * Scans a raw user message for `@agentName` tokens and returns a structured
 * {@link MentionResult} when a known agent name is found.
 */

// TODO: Not yet implemented -- write regex parser and background-flag detection.

import { MentionResult } from "../../core/types";

/**
 * Scans `message` for a leading `@agentName` token that matches one of the
 * supplied `agentNames`.
 *
 * Returns a {@link MentionResult} if a match is found, or `null` otherwise.
 *
 * @param message - Raw user message text.
 * @param agentNames - Known agent names to match against.
 * @returns Parsed mention data, or `null` if no mention is present.
 */
export function detectMention(
  message: string,
  agentNames: string[]
): MentionResult | null {
  void message;
  void agentNames;
  throw new Error("Not implemented");
}
