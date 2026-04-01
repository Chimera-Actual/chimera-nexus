/**
 * @file Renders agent completion notification cards.
 *
 * When a background agent finishes, a completion card is inserted into the
 * chat panel summarising the outcome and linking to any output file.
 */

// TODO: Not yet implemented -- build card DOM and vault-link click handler.

/**
 * Renders an inline completion notification inside the chat panel.
 */
export class CompletionCard {
  /**
   * Inserts a completion card into `container`.
   *
   * @param container - The element that will receive the card.
   * @param agentName - Display name of the agent that completed.
   * @param summary - Brief text summarising what the agent did.
   * @param outputPath - Optional vault-relative path to the agent's output note.
   */
  show(
    container: HTMLElement,
    agentName: string,
    summary: string,
    outputPath?: string
  ): void {
    void container;
    void agentName;
    void summary;
    void outputPath;
    throw new Error("Not implemented");
  }
}
