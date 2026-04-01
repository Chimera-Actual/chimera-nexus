/**
 * @file Creates compressed session summaries for long-term memory.
 *
 * Condenses a full {@link Session} transcript into a compact
 * {@link SessionSummary} suitable for long-term storage and retrieval.
 */

import { Vault, normalizePath } from "obsidian";
import { Session, SessionSummary } from "../types";
import { estimateTokens } from "../../utils/token-counter";
import { stringifyFrontmatter } from "../../utils/frontmatter";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Number of top-frequency words to surface as key topics. */
const KEY_TOPICS_COUNT = 5;

/** Minimum word length considered meaningful for topic extraction. */
const MIN_WORD_LENGTH = 4;

/** Maximum characters used for a title derived from the first user message. */
const TITLE_TRUNCATE_LENGTH = 50;

/** Stop-words excluded from topic extraction. */
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
  "want", "need", "make", "take", "come", "know", "think", "time",
  "work", "good", "well", "back", "even", "much", "many", "give",
  "look", "seem", "feel", "keep", "find", "tell", "call", "show",
  "help", "turn", "let", "put", "still", "get", "use", "see", "said",
]);

const DECISION_PATTERNS = [
  /\blet'?s go with\b/i,
  /\bI decided\b/i,
  /\bwe'?ll use\b/i,
  /\bthe plan is\b/i,
];

// ---------------------------------------------------------------------------
// SessionSummarizer
// ---------------------------------------------------------------------------

/**
 * Produces a condensed summary from a completed session transcript.
 *
 * Summarisation is heuristic-based (word frequency + pattern matching) and
 * does not require an LLM call, making it safe to run synchronously at the
 * end of every session without incurring additional API cost.
 */
export class SessionSummarizer {
  /**
   * Summarises `session` into a compact {@link SessionSummary}.
   *
   * Uses word-frequency analysis to identify key topics and simple pattern
   * matching to extract decisions. Token counts are estimated from raw
   * character lengths rather than a full tokeniser.
   *
   * @param session - The completed session to summarise.
   * @returns A condensed summary of the session.
   */
  async summarize(session: Session): Promise<SessionSummary> {
    try {
      const keyTopics = this.extractKeyTopics(session);
      const decisions = this.extractDecisions(session);
      const tokenCount = this.countTokens(session);
      const title = this.resolveTitle(session);

      return {
        sessionId: session.sessionId,
        agent: session.agent,
        title,
        keyTopics,
        decisions,
        created: new Date().toISOString(),
        tokenCount,
      };
    } catch (err) {
      console.error("[SessionSummarizer] summarize failed:", err);
      // Return a minimal valid summary rather than bubbling up.
      return {
        sessionId: session.sessionId,
        agent: session.agent,
        title: session.title || "Untitled Session",
        keyTopics: [],
        decisions: [],
        created: new Date().toISOString(),
        tokenCount: 0,
      };
    }
  }

  /**
   * Writes `summary` as a markdown file inside the vault's session memory
   * folder at `.claude/memory/sessions/{date}-{sessionId-prefix}.md`.
   *
   * @param vault - The Obsidian Vault instance used to write the file.
   * @param summary - The session summary to persist.
   */
  async saveSummary(vault: Vault, summary: SessionSummary): Promise<void> {
    try {
      const date = summary.created.slice(0, 10); // YYYY-MM-DD
      const idPrefix = summary.sessionId.slice(0, 8);
      const fileName = `${date}-${idPrefix}.md`;
      const path = normalizePath(`.claude/memory/sessions/${fileName}`);

      const frontmatter: Record<string, unknown> = {
        session_id: summary.sessionId,
        agent: summary.agent,
        title: summary.title,
        created: summary.created,
        token_count: summary.tokenCount,
        tags: ["chimera/session-summary"],
      };

      const topicsLine =
        summary.keyTopics.length > 0 ? summary.keyTopics.join(", ") : "none";

      const decisionsSection =
        summary.decisions.length > 0
          ? summary.decisions.map((d) => `- ${d}`).join("\n")
          : "- none";

      const messageCount = summary.tokenCount > 0
        ? `${summary.tokenCount} tokens`
        : "unknown tokens";

      const body = [
        `# Session Summary: ${summary.title}`,
        "",
        "## Key Topics",
        `- ${topicsLine}`,
        "",
        "## Decisions",
        decisionsSection,
        "",
        "## Token Usage",
        `${messageCount} across session`,
        "",
      ].join("\n");

      const output = stringifyFrontmatter(frontmatter, body);
      await vault.adapter.write(path, output);
    } catch (err) {
      console.error("[SessionSummarizer] saveSummary failed:", err);
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Finds the top-{@link KEY_TOPICS_COUNT} most frequently mentioned
   * meaningful words across all session messages.
   *
   * @param session - Source session.
   * @returns Array of topic strings, most frequent first.
   */
  private extractKeyTopics(session: Session): string[] {
    const freq = new Map<string, number>();

    for (const msg of session.messages) {
      const words = msg.content.toLowerCase().match(/\b[a-z]+\b/g) ?? [];
      for (const word of words) {
        if (word.length < MIN_WORD_LENGTH) continue;
        if (STOP_WORDS.has(word)) continue;
        freq.set(word, (freq.get(word) ?? 0) + 1);
      }
    }

    return [...freq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, KEY_TOPICS_COUNT)
      .map(([word]) => word);
  }

  /**
   * Scans user messages for decision-language patterns and returns the
   * matching sentences.
   *
   * @param session - Source session.
   * @returns Array of decision strings.
   */
  private extractDecisions(session: Session): string[] {
    const decisions: string[] = [];

    for (const msg of session.messages) {
      if (msg.role !== "user") continue;

      const sentences = msg.content.split(/(?<=[.!?])\s+|(?:\r?\n)+/);
      for (const sentence of sentences) {
        const trimmed = sentence.trim();
        if (trimmed.length === 0) continue;
        if (DECISION_PATTERNS.some((re) => re.test(trimmed))) {
          decisions.push(trimmed);
        }
      }
    }

    return decisions;
  }

  /**
   * Sums estimated token counts across all messages in `session`.
   *
   * @param session - Source session.
   * @returns Total estimated token count.
   */
  private countTokens(session: Session): number {
    return session.messages.reduce(
      (sum, msg) => sum + estimateTokens(msg.content),
      0
    );
  }

  /**
   * Returns the session title, falling back to the first user message
   * truncated to {@link TITLE_TRUNCATE_LENGTH} characters.
   *
   * @param session - Source session.
   * @returns Resolved title string.
   */
  private resolveTitle(session: Session): string {
    if (session.title && session.title.trim().length > 0) {
      return session.title.trim();
    }

    const firstUser = session.messages.find((m) => m.role === "user");
    if (!firstUser) return "Untitled Session";

    const text = firstUser.content.trim();
    if (text.length <= TITLE_TRUNCATE_LENGTH) return text;
    return text.slice(0, TITLE_TRUNCATE_LENGTH).trimEnd() + "...";
  }
}
