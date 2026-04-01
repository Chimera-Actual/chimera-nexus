/**
 * @file Renders chat messages, tool calls, and thinking blocks.
 *
 * All methods are static so they can be used without instantiation.
 * Tool calls and thinking blocks follow the Claudian collapsible pattern
 * with icon, name, summary, status, and expandable content.
 */

import { setIcon } from "obsidian";

/**
 * Handles DOM-level rendering of chat messages, tool call blocks, and
 * thinking indicators in the Chimera Nexus sidebar.
 */
export class ChatRenderer {
  /**
   * Renders a tool call block in the messages area.
   *
   * The block consists of a clickable header (icon, name, summary, status)
   * and a collapsible content area that toggles on click.
   *
   * @param container - Parent element to append the tool call block into.
   * @param toolName  - Name of the tool (e.g. `"Read"`, `"Bash"`).
   * @param summary   - One-line summary shown next to the tool name.
   * @param status    - Current execution status for the status icon.
   * @param content   - Optional detailed output shown when expanded.
   * @returns The root element of the rendered tool call block.
   */
  static renderToolCall(
    container: HTMLElement,
    toolName: string,
    summary: string,
    status: "running" | "completed" | "error",
    content?: string,
  ): HTMLElement {
    const block = container.createDiv({ cls: "chimera-tool-call" });

    const header = block.createDiv({ cls: "chimera-tool-header" });

    // Tool icon
    const iconEl = header.createSpan({ cls: "chimera-tool-icon" });
    const iconName = ChatRenderer.getToolIcon(toolName);
    setIcon(iconEl, iconName);

    // Tool name
    header.createSpan({ cls: "chimera-tool-name", text: toolName });

    // Summary
    if (summary) {
      header.createSpan({ cls: "chimera-tool-summary", text: summary });
    }

    // Status
    const statusEl = header.createSpan({ cls: `chimera-tool-status status-${status}` });
    if (status === "running") {
      setIcon(statusEl, "loader-2");
    } else if (status === "completed") {
      setIcon(statusEl, "check");
    } else {
      setIcon(statusEl, "x");
    }

    // Expandable content
    const contentEl = block.createDiv({ cls: "chimera-tool-content" });
    if (content) {
      contentEl.createDiv({ cls: "chimera-tool-lines", text: content });
    }

    // Toggle on click
    header.addEventListener("click", () => {
      contentEl.toggleClass("is-expanded", !contentEl.hasClass("is-expanded"));
    });

    return block;
  }

  /**
   * Renders a thinking block with a pulsing label and collapsible content.
   *
   * @param container - Parent element to append the thinking block into.
   * @param isActive  - Whether the model is currently thinking (shows pulse animation).
   * @param content   - Optional thinking text shown when expanded.
   * @param duration  - Optional duration string (e.g. `"3.2s"`) shown in the header.
   * @returns The root element of the rendered thinking block.
   */
  static renderThinkingBlock(
    container: HTMLElement,
    isActive: boolean,
    content?: string,
    duration?: string,
  ): HTMLElement {
    const block = container.createDiv({ cls: "chimera-thinking-block" });

    const header = block.createDiv({ cls: "chimera-thinking-header" });

    const iconEl = header.createSpan({ cls: "chimera-tool-icon" });
    setIcon(iconEl, "brain");

    const label = header.createSpan({ cls: "chimera-thinking-label" });
    label.textContent = isActive ? "Thinking..." : "Thinking";
    if (isActive) label.addClass("chimera-thinking-active");

    if (duration) {
      header.createSpan({ cls: "chimera-thinking-duration", text: duration });
    }

    const contentEl = block.createDiv({ cls: "chimera-thinking-content" });
    if (content) {
      contentEl.textContent = content;
    }

    header.addEventListener("click", () => {
      contentEl.toggleClass("is-expanded", !contentEl.hasClass("is-expanded"));
    });

    return block;
  }

  /**
   * Maps tool names to Obsidian Lucide icon names.
   *
   * @param toolName - The SDK tool name (e.g. `"Bash"`, `"Read"`).
   * @returns The Lucide icon identifier to use with `setIcon`.
   */
  static getToolIcon(toolName: string): string {
    const iconMap: Record<string, string> = {
      Bash: "terminal",
      Read: "book-open",
      Write: "file-edit",
      Edit: "diff",
      Glob: "search",
      Grep: "file-search",
      WebFetch: "globe",
      WebSearch: "search",
      TodoWrite: "check-square",
      Agent: "bot",
      Task: "bot",
      AskUserQuestion: "help-circle",
      NotebookEdit: "notebook-pen",
    };
    return iconMap[toolName] || "wrench";
  }

  /**
   * Renders a system/info message with muted styling.
   *
   * @param container - Parent element to append the message into.
   * @param text      - Plain text to display.
   * @returns The rendered system message element.
   */
  static renderSystemMessage(container: HTMLElement, text: string): HTMLElement {
    const el = container.createDiv({ cls: "chimera-system-message" });
    el.textContent = text;
    return el;
  }
}
