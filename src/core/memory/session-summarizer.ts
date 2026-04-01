/**
 * @file Creates compressed session summaries for long-term memory.
 *
 * Condenses a full {@link Session} transcript into a compact
 * {@link SessionSummary} suitable for long-term storage and retrieval.
 */

// TODO: Not yet implemented -- implement summarisation via Claude API call.

import { Session, SessionSummary } from "../types";

/**
 * Produces a condensed summary from a completed session transcript.
 */
export class SessionSummarizer {
  /**
   * Summarises `session` into a compact {@link SessionSummary}.
   *
   * @param session - The completed session to summarise.
   * @returns A condensed summary of the session.
   */
  async summarize(session: Session): Promise<SessionSummary> {
    void session;
    throw new Error("Not implemented");
  }
}
