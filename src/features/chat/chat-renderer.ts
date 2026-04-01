/**
 * @file Renders chat messages with markdown support.
 *
 * Converts raw markdown strings from the agent or user into HTML nodes and
 * appends them to a container element in the Obsidian chat view.
 */

// TODO: Not yet implemented -- wire up Obsidian MarkdownRenderer API.

/**
 * Handles DOM-level rendering of individual chat messages.
 */
export class ChatRenderer {
  /**
   * Renders a single chat message into `container`.
   *
   * @param container - The parent element that will receive the rendered node.
   * @param role - Either `"user"` or `"assistant"`.
   * @param content - Raw markdown content to render.
   */
  renderMessage(container: HTMLElement, role: string, content: string): void {
    void container;
    void role;
    void content;
    throw new Error("Not implemented");
  }
}
