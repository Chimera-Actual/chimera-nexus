/**
 * @file Parses @agent-name mentions from user input.
 *
 * Scans a raw user message for `@agentName` tokens and returns a structured
 * {@link MentionResult} when a known agent name is found.
 */

import { MentionResult } from "../../core/types";

/**
 * Scans `message` for a leading `@agentName` token that matches one of the
 * supplied `agentNames`.
 *
 * The pattern must appear at the start of the message or immediately after
 * whitespace. Matching is case-insensitive; the returned `agentName` uses
 * the canonical casing from the `agentNames` array. An optional `(bg)` or
 * `(background)` flag directly after the mention sets `background: true`.
 * Only the first matching mention is processed.
 *
 * @param message - Raw user message text.
 * @param agentNames - Known agent names to match against.
 * @returns Parsed mention data, or `null` if no mention is present.
 */
export function detectMention(
  message: string,
  agentNames: string[]
): MentionResult | null {
  if (!message || agentNames.length === 0) {
    return null;
  }

  for (const agentName of agentNames) {
    // Escape the agent name for use inside a regex literal.
    const escapedName = agentName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    // Match @agentName at start-of-string or after whitespace, then
    // optionally capture a background flag (bg)/(background), then capture
    // the remainder as the task.
    //
    // Group 1: the matched agent name (case-insensitive via flag i)
    // Group 2: the optional background flag token, e.g. "(bg)"
    // Group 3: everything after the mention + optional flag
    const pattern = new RegExp(
      `(?:^|(?<=\\s))@(${escapedName})(?:\\s+(\\((?:bg|background)\\)))?(.*)`,
      "is"
    );

    const match = pattern.exec(message);

    if (!match) {
      continue;
    }

    // Verify the @mention starts at position 0 or immediately after whitespace.
    const matchStart = match.index;
    if (matchStart !== 0 && !/\s/.test(message[matchStart - 1])) {
      continue;
    }

    const flagText = match[2] ?? "";
    const background = flagText === "(bg)" || flagText === "(background)";
    const task = (match[3] ?? "").trim();

    return {
      agentName,
      task,
      background,
      originalMessage: message,
    };
  }

  return null;
}
