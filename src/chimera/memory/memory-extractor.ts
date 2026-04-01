/**
 * @file Extracts memory signals from completed sessions.
 *
 * Analyses a finished session transcript and writes relevant facts, decisions,
 * and patterns to the appropriate vault memory files.
 */

import type { Vault} from "obsidian";
import { normalizePath } from "obsidian";

import type { ConversationMessage,Session } from "../types";
import { parseFrontmatter, stringifyFrontmatter } from "../utils/frontmatter";

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface ExtractedSignals {
  corrections: string[];
  decisions: string[];
  userFacts: string[];
}

// ---------------------------------------------------------------------------
// Pattern constants
// ---------------------------------------------------------------------------

const CORRECTION_PATTERNS = [
  /\bno,\s/i,
  /\bactually,\s/i,
  /\bthat'?s wrong\b/i,
  /\bnot that\b/i,
  /\bI meant\b/i,
];

const DECISION_PATTERNS = [
  /\blet'?s go with\b/i,
  /\bI decided\b/i,
  /\bwe'?ll use\b/i,
  /\bthe plan is\b/i,
];

const USER_FACT_PATTERNS = [
  /\bI am a\b/i,
  /\bI work at\b/i,
  /\bmy name is\b/i,
  /\bI prefer\b/i,
];

/** Minimum number of mentions for a topic to be considered a repeated pattern. */
const REPEATED_PATTERN_THRESHOLD = 3;

/** Stop-words excluded from repeated-pattern detection. */
const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "can", "shall", "that", "this", "these",
  "those", "it", "its", "i", "you", "we", "they", "he", "she",
  "my", "your", "our", "their", "me", "him", "her", "us", "them",
  "so", "if", "as", "by", "from", "up", "about", "into", "through",
  "just", "not", "no", "yes", "than", "then", "when", "where", "how",
  "what", "which", "who", "there", "here", "also", "more", "some",
  "all", "any", "each", "few", "most", "other", "such", "only", "own",
  "same", "like", "very", "too", "now", "out", "over", "after",
]);

// ---------------------------------------------------------------------------
// Target file paths
// ---------------------------------------------------------------------------

const CORRECTIONS_PATH = ".claude/memory/knowledge/corrections.md";
const DECISIONS_PATH = ".claude/memory/knowledge/decisions.md";
const HUMAN_PATH = ".claude/memory/system/human.md";

/**
 * Extracts and stores memory signals from a completed session.
 */
export class MemoryExtractor {
  /**
   * @param vault - The Obsidian Vault instance used to write memory files.
   */
  constructor(private readonly vault: Vault) {}

  /**
   * Analyses `session` and writes extracted signals to vault memory files.
   *
   * Scans the session transcript for corrections, decisions, and user facts,
   * then appends each category to its corresponding memory file. Also detects
   * topics mentioned three or more times and logs them as decisions.
   *
   * @param session - The completed session to extract signals from.
   */
  async extractFromSession(session: Session): Promise<void> {
    try {
      const signals = this.extractSignals(session.messages);

      if (signals.corrections.length > 0) {
        await this.appendToMemoryFile(
          CORRECTIONS_PATH,
          signals.corrections,
          {
            description: "User corrections captured from sessions",
            memtype: "knowledge",
            tier: "indexed",
            tags: ["chimera/corrections"],
            created: new Date().toISOString(),
            updated: new Date().toISOString(),
          }
        );
      }

      if (signals.decisions.length > 0) {
        await this.appendToMemoryFile(
          DECISIONS_PATH,
          signals.decisions,
          {
            description: "Decisions and plans captured from sessions",
            memtype: "knowledge",
            tier: "indexed",
            tags: ["chimera/decisions"],
            created: new Date().toISOString(),
            updated: new Date().toISOString(),
          }
        );
      }

      if (signals.userFacts.length > 0) {
        await this.appendToMemoryFile(
          HUMAN_PATH,
          signals.userFacts,
          {
            description: "Facts about the user captured from sessions",
            memtype: "system",
            tier: "pinned",
            tags: ["chimera/human"],
            created: new Date().toISOString(),
            updated: new Date().toISOString(),
          }
        );
      }
    } catch (err) {
      console.error("[MemoryExtractor] extractFromSession failed:", err);
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Scans `messages` for correction, decision, user-fact, and repeated-pattern
   * signals and returns them grouped by category.
   *
   * @param messages - The full session transcript.
   * @returns Grouped signal strings.
   */
  private extractSignals(messages: ConversationMessage[]): ExtractedSignals {
    const corrections: string[] = [];
    const decisions: string[] = [];
    const userFacts: string[] = [];

    // Word frequency map for repeated-pattern detection (user messages only).
    const wordFreq = new Map<string, number>();

    for (const msg of messages) {
      if (msg.role !== "user") continue;

      const text = msg.content;

      // Split into sentences for finer-grained extraction.
      const sentences = text.split(/(?<=[.!?])\s+|(?:\r?\n)+/);

      for (const sentence of sentences) {
        const trimmed = sentence.trim();
        if (trimmed.length === 0) continue;

        if (CORRECTION_PATTERNS.some((re) => re.test(trimmed))) {
          corrections.push(trimmed);
        }

        if (DECISION_PATTERNS.some((re) => re.test(trimmed))) {
          decisions.push(trimmed);
        }

        if (USER_FACT_PATTERNS.some((re) => re.test(trimmed))) {
          userFacts.push(trimmed);
        }
      }

      // Accumulate word frequencies for repeated-pattern detection.
      const words = text.toLowerCase().match(/\b[a-z]{4,}\b/g) ?? [];
      for (const word of words) {
        if (STOP_WORDS.has(word)) continue;
        wordFreq.set(word, (wordFreq.get(word) ?? 0) + 1);
      }
    }

    // Collect repeated topics (3+ mentions) as decision entries.
    for (const [word, count] of wordFreq) {
      if (count >= REPEATED_PATTERN_THRESHOLD) {
        decisions.push(`Repeated topic: "${word}" (mentioned ${count} times)`);
      }
    }

    return { corrections, decisions, userFacts };
  }

  /**
   * Reads `path` from the vault, appends `entries` with timestamps to the
   * body, updates the `updated` frontmatter field, and writes the file back.
   *
   * Creates the file with `defaultFrontmatter` if it does not yet exist.
   *
   * @param path - Vault-relative path to the target memory file.
   * @param entries - Strings to append as new list items.
   * @param defaultFrontmatter - Frontmatter to use when creating the file.
   */
  private async appendToMemoryFile(
    path: string,
    entries: string[],
    defaultFrontmatter: Record<string, unknown>
  ): Promise<void> {
    try {
      const normalised = normalizePath(path);
      const now = new Date().toISOString();

      let rawContent: string;
      try {
        rawContent = await this.vault.adapter.read(normalised);
      } catch {
        // File does not exist -- start with frontmatter only.
        rawContent = stringifyFrontmatter(defaultFrontmatter, "");
      }

      const { frontmatter, body } = parseFrontmatter(rawContent);

      // Build new lines to append.
      const newLines = entries
        .map((entry) => `- [${now}] ${entry}`)
        .join("\n");

      const updatedBody =
        body.trimEnd() + (body.trim().length > 0 ? "\n" : "") + newLines + "\n";

      frontmatter["updated"] = now;

      const output = stringifyFrontmatter(frontmatter, updatedBody);
      await this.vault.adapter.write(normalised, output);
    } catch (err) {
      console.error(`[MemoryExtractor] appendToMemoryFile failed for ${path}:`, err);
    }
  }
}
