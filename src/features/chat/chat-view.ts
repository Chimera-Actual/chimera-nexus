/**
 * @file Obsidian sidebar chat view for Chimera Nexus.
 *
 * Renders the full chat UI inside Obsidian's right sidebar leaf. The view is
 * a functional shell: messages are displayed locally and a placeholder
 * "Thinking..." response is shown after each user message. Real agent
 * integration is wired in later tasks.
 */

import { ItemView, WorkspaceLeaf } from "obsidian";

// ---------------------------------------------------------------------------
// View type constant
// ---------------------------------------------------------------------------

/** Identifier registered with Obsidian's workspace for this view type. */
export const VIEW_TYPE_CHIMERA_CHAT = "chimera-nexus-chat";

// ---------------------------------------------------------------------------
// Minimal plugin interface (avoids circular import with main.ts)
// ---------------------------------------------------------------------------

interface ChimeraNexusPluginRef {
  // Reserved for future wiring to settings / SDK / session store.
}

// ---------------------------------------------------------------------------
// ChimeraChatView
// ---------------------------------------------------------------------------

/**
 * Obsidian sidebar view that renders the Chimera Nexus chat interface.
 *
 * Lifecycle:
 * - {@link onOpen} builds the full DOM layout and attaches event listeners.
 * - {@link onClose} tears down any listeners added outside of Obsidian's own
 *   event system.
 *
 * Public helper surface:
 * - {@link addMessage} appends a labelled message bubble to the chat area.
 * - {@link handleSend} reads the textarea, posts the user message, and
 *   enqueues a placeholder assistant reply.
 * - {@link updateStatus} updates the status bar text.
 */
export class ChimeraChatView extends ItemView {
  // -------------------------------------------------------------------------
  // Private DOM references
  // -------------------------------------------------------------------------

  private agentSelect!: HTMLSelectElement;
  private sessionListEl!: HTMLElement;
  private messagesEl!: HTMLElement;
  private inputEl!: HTMLTextAreaElement;
  private statusBarEl!: HTMLElement;

  // -------------------------------------------------------------------------
  // Constructor
  // -------------------------------------------------------------------------

  constructor(
    leaf: WorkspaceLeaf,
    // Plugin reference retained for future SDK / settings wiring.
    _plugin: ChimeraNexusPluginRef,
  ) {
    super(leaf);
  }

  // -------------------------------------------------------------------------
  // ItemView contract
  // -------------------------------------------------------------------------

  /** Returns the unique view type identifier registered with Obsidian. */
  getViewType(): string {
    return VIEW_TYPE_CHIMERA_CHAT;
  }

  /** Returns the human-readable label shown in the tab strip. */
  getDisplayText(): string {
    return "Chimera Nexus";
  }

  /** Returns the Lucide icon name rendered in the tab strip. */
  getIcon(): string {
    return "bot";
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /**
   * Called by Obsidian when the leaf is opened.
   *
   * Builds the complete chat UI layout and attaches all event listeners.
   * All DOM nodes are created via the standard `createElement` / `appendChild`
   * API to stay framework-agnostic and match Obsidian's own patterns.
   */
  async onOpen(): Promise<void> {
    const container = this.containerEl;
    container.empty();

    // Root wrapper
    const root = container.createDiv({ cls: "chimera-chat-container" });

    // ------------------------------------------------------------------
    // 1. Agent selector
    // ------------------------------------------------------------------

    const selectorArea = root.createDiv({ cls: "chimera-agent-selector" });

    this.agentSelect = selectorArea.createEl("select");
    const defaultOption = this.agentSelect.createEl("option");
    defaultOption.value = "default";
    defaultOption.textContent = "Default Chimera";

    const newSessionBtn = selectorArea.createEl("button");
    newSessionBtn.textContent = "New Session";
    newSessionBtn.addEventListener("click", () => {
      this.updateStatus("New session started.");
    });

    // ------------------------------------------------------------------
    // 2. Session list
    // ------------------------------------------------------------------

    this.sessionListEl = root.createDiv({ cls: "chimera-session-list" });
    this.sessionListEl.textContent = "No sessions yet";

    // ------------------------------------------------------------------
    // 3. Messages area
    // ------------------------------------------------------------------

    this.messagesEl = root.createDiv({ cls: "chimera-messages" });

    const welcomeMsg = this.messagesEl.createDiv({ cls: "chimera-message" });
    welcomeMsg.textContent =
      "Welcome to Chimera Nexus. Select an agent or start chatting.";

    // ------------------------------------------------------------------
    // 4. Input area
    // ------------------------------------------------------------------

    const inputArea = root.createDiv({ cls: "chimera-input-area" });

    this.inputEl = inputArea.createEl("textarea");
    this.inputEl.placeholder = "Type a message... (use @agent to delegate)";
    this.inputEl.rows = 2;

    this.inputEl.addEventListener("keydown", (evt: KeyboardEvent) => {
      if (evt.key === "Enter" && !evt.shiftKey) {
        evt.preventDefault();
        this.handleSend();
      }
      // Shift+Enter falls through and inserts a newline naturally.
    });

    const sendBtn = inputArea.createEl("button");
    sendBtn.textContent = "Send";
    sendBtn.addEventListener("click", () => {
      this.handleSend();
    });

    // ------------------------------------------------------------------
    // 5. Status bar
    // ------------------------------------------------------------------

    this.statusBarEl = root.createDiv({ cls: "chimera-status-bar" });
    this.statusBarEl.textContent = "Ready";
  }

  /**
   * Called by Obsidian when the leaf is closed.
   *
   * All listeners attached via `addEventListener` directly to DOM nodes owned
   * by this view are automatically garbage-collected when the DOM is destroyed.
   * This hook is kept for any future cleanup that requires explicit teardown
   * (e.g. external subscriptions or timers).
   */
  async onClose(): Promise<void> {
    // No external subscriptions to clean up at this stage.
  }

  // -------------------------------------------------------------------------
  // Public helpers
  // -------------------------------------------------------------------------

  /**
   * Appends a message bubble to the messages area and scrolls to the bottom.
   *
   * @param role    - Either `"user"` or `"assistant"`.
   * @param content - Plain-text message content to display.
   */
  addMessage(role: "user" | "assistant", content: string): void {
    const msgEl = this.messagesEl.createDiv({
      cls: `chimera-message is-${role}`,
    });

    const roleLabel = msgEl.createDiv({ cls: "chimera-message-role" });
    roleLabel.textContent = role === "user" ? "You" : "Chimera";

    const contentEl = msgEl.createDiv({ cls: "chimera-message-content" });
    contentEl.textContent = content;

    // Auto-scroll to the newly added message.
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }

  /**
   * Reads the current textarea value, posts it as a user message, clears the
   * input, and enqueues a placeholder assistant reply after a short delay.
   *
   * When real SDK integration is added this method will be the primary hook
   * point for dispatching messages to the agent.
   */
  handleSend(): void {
    const text = this.inputEl.value.trim();
    if (!text) return;

    this.addMessage("user", text);
    this.inputEl.value = "";
    this.updateStatus("Thinking...");

    // Placeholder: simulate an async assistant reply.
    setTimeout(() => {
      this.addMessage("assistant", "Thinking...");
      this.updateStatus("Ready");
    }, 500);
  }

  /**
   * Replaces the status bar text with the supplied string.
   *
   * @param text - Status message to display (e.g. `"Ready"`, `"Thinking..."`).
   */
  updateStatus(text: string): void {
    this.statusBarEl.textContent = text;
  }
}
