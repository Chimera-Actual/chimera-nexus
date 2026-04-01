/**
 * @file Wraps the Claude Agent SDK for CLI and API key auth paths.
 *
 * Provides a unified `sendMessage` interface regardless of whether the user
 * is authenticating via the CLI or a direct API key.
 */

// TODO: Not yet implemented -- integrate with Claude Agent SDK streaming API.

import { ChimeraSettings } from "../types";

/**
 * Thin wrapper around the Claude Agent SDK that normalises auth paths.
 */
export class SdkWrapper {
  /**
   * @param settings - Plugin settings containing auth configuration.
   */
  constructor(private readonly settings: ChimeraSettings) {}

  /**
   * Sends a prompt to Claude and returns an async iterable of streamed chunks.
   *
   * @param prompt - The user prompt to send.
   * @param systemPrompt - System prompt to prepend for this turn.
   * @returns Async iterable yielding streamed text chunks.
   */
  async sendMessage(
    prompt: string,
    systemPrompt: string
  ): Promise<AsyncIterable<string>> {
    void this.settings;
    void prompt;
    void systemPrompt;
    throw new Error("Not implemented");
  }
}
