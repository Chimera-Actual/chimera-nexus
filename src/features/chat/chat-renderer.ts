/**
 * @file Renders chat messages with markdown support.
 *
 * Converts raw markdown strings from the agent or user into HTML nodes and
 * appends them to a container element in the Obsidian chat view.
 */

import { App, MarkdownRenderer, Component } from "obsidian";

/** CSS class prefix for streamed messages so they can be located later. */
const STREAMING_CLASS = "chimera-message-streaming";

/**
 * Handles DOM-level rendering of individual chat messages.
 */
export class ChatRenderer {
  /** Throw-away Component required by MarkdownRenderer.render. */
  private readonly component: Component;

  /**
   * @param app - The Obsidian App instance used for MarkdownRenderer access.
   */
  constructor(private readonly app: App) {
    this.component = new Component();
    this.component.load();
  }

  /**
   * Renders a single chat message into `container`.
   *
   * For assistant messages the content is passed through Obsidian's
   * MarkdownRenderer so that links, code blocks, and other markdown features
   * render correctly. User messages are displayed as plain text.
   *
   * @param container - The parent element that will receive the rendered node.
   * @param role - Either `"user"` or `"assistant"`.
   * @param content - Raw markdown content to render.
   */
  renderMessage(
    container: HTMLElement,
    role: "user" | "assistant",
    content: string
  ): void {
    const messageEl = container.createDiv({
      cls: `chimera-message is-${role}`,
    });

    const roleEl = messageEl.createDiv({ cls: "chimera-message-role" });
    roleEl.textContent = role === "user" ? "You" : "Chimera";

    const contentEl = messageEl.createDiv({ cls: "chimera-message-content" });

    if (role === "assistant") {
      this.renderMarkdown(contentEl, content);
    } else {
      contentEl.textContent = content;
    }
  }

  /**
   * Creates or updates a streaming message element in `container`.
   *
   * If a streaming element already exists in the container it is reused;
   * otherwise a new one is created. The content element is returned so the
   * caller can append further chunks.
   *
   * @param container - The parent element that hosts the streaming message.
   * @param content - The current accumulated content to display.
   * @returns The content div element that holds the streamed text.
   */
  renderStreamingMessage(
    container: HTMLElement,
    content: string
  ): HTMLElement {
    let streamEl = container.querySelector<HTMLElement>(
      `.${STREAMING_CLASS}`
    );

    if (!streamEl) {
      const messageEl = container.createDiv({
        cls: `chimera-message is-assistant ${STREAMING_CLASS}`,
      });
      const roleEl = messageEl.createDiv({ cls: "chimera-message-role" });
      roleEl.textContent = "Chimera";
      streamEl = messageEl.createDiv({ cls: "chimera-message-content" });
    }

    streamEl.textContent = content;
    return streamEl;
  }

  /**
   * Renders a system or informational message with muted, centered styling.
   *
   * @param container - The parent element that will receive the message.
   * @param text - Plain text to display.
   */
  renderSystemMessage(container: HTMLElement, text: string): void {
    const el = container.createDiv({ cls: "chimera-system-message" });
    el.textContent = text;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Renders `markdown` into `el` using Obsidian's MarkdownRenderer.
   * Falls back to plain textContent if rendering fails.
   */
  private renderMarkdown(el: HTMLElement, markdown: string): void {
    try {
      // MarkdownRenderer.render is async but we intentionally do not await it
      // so the message appears immediately; Obsidian patches the DOM in place.
      void MarkdownRenderer.render(
        this.app,
        markdown,
        el,
        "",
        this.component
      );
    } catch {
      el.textContent = markdown;
    }
  }
}
