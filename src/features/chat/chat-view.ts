/**
 * @file Obsidian sidebar chat view for Chimera Nexus.
 *
 * Renders the full chat UI inside Obsidian's right sidebar leaf. The view
 * handles agent switching, @mention detection, streaming SDK responses, hook
 * execution, and post-session processing (memory extraction and summarization).
 */

import { ItemView, Notice, WorkspaceLeaf } from "obsidian";

import {
  ChimeraSettings,
  AgentDefinition,
  Session,
  HookEvent,
  MentionResult,
  PermissionMode,
  AuthMethod,
} from "../../core/types";
import { SdkWrapper } from "../../core/runtime/sdk-wrapper";
import { MemoryInjector } from "../../core/memory/memory-injector";
import { MemoryExtractor } from "../../core/memory/memory-extractor";
import { SessionSummarizer } from "../../core/memory/session-summarizer";
import { SessionStore } from "../../features/sessions/session-store";
import { SessionIndex } from "../../features/sessions/session-index";
import { AgentLoader } from "../../core/claude-compat/agent-loader";
import { HookManager } from "../../core/claude-compat/hook-manager";
import { detectMention } from "./mention-detector";
import { AgentSelector } from "./agent-selector";
import { SlashCommandRegistry, SlashCommandContext } from "../../commands/slash-commands";
import { tryAutoCommit } from "../../utils/vault-helpers";

// ---------------------------------------------------------------------------
// View type constant
// ---------------------------------------------------------------------------

/** Identifier registered with Obsidian's workspace for this view type. */
export const VIEW_TYPE_CHIMERA_CHAT = "chimera-nexus-chat";

// ---------------------------------------------------------------------------
// Minimal plugin interface (avoids circular import with main.ts)
// ---------------------------------------------------------------------------

interface ChimeraNexusPluginRef {
  settings: ChimeraSettings;
  sdkWrapper: SdkWrapper;
  memoryInjector: MemoryInjector;
  memoryExtractor: MemoryExtractor;
  sessionSummarizer: SessionSummarizer;
  sessionStore: SessionStore;
  sessionIndex: SessionIndex;
  agentLoader: AgentLoader;
  hookManager: HookManager;
  slashCommands: SlashCommandRegistry;
  saveSettings(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generates a pseudo-random UUID v4 string. */
function generateUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Returns a human-readable label for a permission mode value. */
function permissionLabel(mode: PermissionMode): string {
  switch (mode) {
    case PermissionMode.Safe: return "Safe";
    case PermissionMode.Plan: return "Plan";
    case PermissionMode.YOLO: return "YOLO";
    default: return "Safe";
  }
}

/** Returns the CSS modifier class name for a permission mode. */
function permissionClass(mode: PermissionMode): string {
  switch (mode) {
    case PermissionMode.Safe: return "is-safe";
    case PermissionMode.Plan: return "is-plan";
    case PermissionMode.YOLO: return "is-yolo";
    default: return "is-safe";
  }
}

// ---------------------------------------------------------------------------
// ChimeraChatView
// ---------------------------------------------------------------------------

/**
 * Obsidian sidebar view that renders the Chimera Nexus chat interface.
 *
 * Lifecycle:
 * - {@link onOpen} builds the full DOM layout, loads agents and sessions,
 *   and attaches event listeners.
 * - {@link onClose} runs post-session processing (save, memory extraction,
 *   summarization) before tearing down.
 *
 * Public helper surface:
 * - {@link addMessage} appends a labelled message bubble to the chat area.
 * - {@link handleSend} dispatches user messages to the SDK with streaming.
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
  private welcomeEl!: HTMLElement | null;
  private permissionPillEl!: HTMLElement;
  private connectionStatusEl!: HTMLElement;

  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------

  private plugin: ChimeraNexusPluginRef;
  private currentSession: Session | null = null;
  private currentAgent: AgentDefinition | null = null;
  private agents: AgentDefinition[] = [];
  private agentSelectorComponent: AgentSelector | null = null;
  private isStreaming = false;

  // -------------------------------------------------------------------------
  // Constructor
  // -------------------------------------------------------------------------

  constructor(
    leaf: WorkspaceLeaf,
    plugin: ChimeraNexusPluginRef,
  ) {
    super(leaf);
    this.plugin = plugin;
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
   * Builds the complete chat UI layout, loads agents and session index entries,
   * wires up the AgentSelector component, and attaches all event listeners.
   */
  async onOpen(): Promise<void> {
    const container = this.containerEl;
    container.empty();

    // Root wrapper
    const root = container.createDiv({ cls: "chimera-chat-container" });

    // ------------------------------------------------------------------
    // 1. Header bar
    // ------------------------------------------------------------------

    const header = root.createDiv({ cls: "chimera-header" });

    // Title
    header.createEl("span", { cls: "chimera-header-title", text: "Chimera Nexus" });

    // Agent selector dropdown (compact, in header)
    this.agentSelect = header.createEl("select");
    const defaultOption = this.agentSelect.createEl("option");
    defaultOption.value = "default";
    defaultOption.textContent = "Default";

    this.agentSelect.addEventListener("change", () => {
      const value = this.agentSelect.value;
      this.handleAgentChange(value === "default" ? "" : value);
    });

    // Permission mode pill
    this.permissionPillEl = header.createDiv({ cls: "chimera-permission-pill" });
    this.renderPermissionPill();

    // New session button
    const newSessionBtn = header.createEl("button", { cls: "chimera-new-session-btn" });
    newSessionBtn.textContent = "+";
    newSessionBtn.title = "New Session";
    newSessionBtn.addEventListener("click", () => {
      this.startNewSession();
      this.messagesEl.innerHTML = "";
      this.showWelcome();
      this.updateStatus("New session started.");
    });

    // ------------------------------------------------------------------
    // 2. Session list (collapsible, hidden by default)
    // ------------------------------------------------------------------

    this.sessionListEl = root.createDiv({ cls: "chimera-session-list" });

    // ------------------------------------------------------------------
    // 3. Messages area with welcome state
    // ------------------------------------------------------------------

    this.messagesEl = root.createDiv({ cls: "chimera-messages" });
    this.showWelcome();

    // ------------------------------------------------------------------
    // 4. Input area
    // ------------------------------------------------------------------

    const inputArea = root.createDiv({ cls: "chimera-input-area" });

    this.inputEl = inputArea.createEl("textarea");
    this.inputEl.placeholder = "Message Chimera... (use @agent to delegate)";
    this.inputEl.rows = 2;

    this.inputEl.addEventListener("keydown", (evt: KeyboardEvent) => {
      if (evt.key === "Enter" && !evt.shiftKey) {
        evt.preventDefault();
        this.handleSend();
      }
      // Shift+Enter falls through and inserts a newline naturally.
    });

    const sendBtn = inputArea.createEl("button", { cls: "chimera-send-btn" });
    sendBtn.innerHTML = "&#9654;"; // Right-pointing triangle (play icon)
    sendBtn.title = "Send message";
    sendBtn.addEventListener("click", () => {
      this.handleSend();
    });

    // ------------------------------------------------------------------
    // 5. Status bar with connection indicator
    // ------------------------------------------------------------------

    this.statusBarEl = root.createDiv({ cls: "chimera-status-bar" });

    this.connectionStatusEl = this.statusBarEl.createDiv({ cls: "chimera-connection-status" });
    this.updateConnectionStatus();

    // ------------------------------------------------------------------
    // 6. Load agents and wire up AgentSelector
    // ------------------------------------------------------------------

    try {
      this.agents = await this.plugin.agentLoader.loadAgents();
    } catch {
      // Logged internally by AgentLoader.
    }

    // Populate the header agent dropdown
    for (const agent of this.agents) {
      const opt = this.agentSelect.createEl("option");
      opt.value = agent.name;
      opt.textContent = agent.name;
    }

    // Also wire up the AgentSelector component for session list management.
    // We create a hidden container for it since we use the header dropdown.
    const selectorArea = root.createDiv({ cls: "chimera-agent-selector" });
    this.agentSelectorComponent = new AgentSelector(
      selectorArea,
      this.agents,
      (agentName) => this.handleAgentChange(agentName),
      (sessionId) => this.handleSessionResume(sessionId),
    );
    this.agentSelectorComponent.render();

    // Load session index entries for the session list.
    const entries = this.plugin.sessionIndex.getEntries();
    this.agentSelectorComponent.setSessions(entries);
  }

  /**
   * Called by Obsidian when the leaf is closed.
   *
   * Runs post-session processing if there is an active session with messages:
   * saves the session, extracts memory signals (if enabled), and creates a
   * summary note.
   */
  async onClose(): Promise<void> {
    if (this.currentSession && this.currentSession.messages.length > 0) {
      try {
        this.currentSession.status = "completed";
        await this.plugin.sessionStore.saveSession(this.currentSession);

        // Extract memory signals.
        if (this.plugin.settings.autoMemory) {
          await this.plugin.memoryExtractor.extractFromSession(this.currentSession);
        }

        // Create and save a session summary.
        const summary = await this.plugin.sessionSummarizer.summarize(this.currentSession);
        await this.plugin.sessionSummarizer.saveSummary(
          this.app.vault,
          summary,
        );

        // Auto-commit via Obsidian Git if available.
        try {
          const committed = await tryAutoCommit(
            this.app,
            `[chimera] Session ${this.currentSession.sessionId.slice(0, 8)} completed`
          );
          if (committed) {
            console.log("Chimera: auto-committed session data");
          }
        } catch {
          // Best effort, ignore failures.
        }
      } catch (err) {
        console.warn("Failed post-session processing:", err);
      }
    }
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
    // Clear welcome state on first message.
    this.clearWelcome();

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
   * Reads the current textarea value, processes @mentions and hooks, then
   * dispatches the message to the SDK with streaming response callbacks.
   */
  async handleSend(): Promise<void> {
    const text = this.inputEl.value.trim();
    if (!text || this.isStreaming) return;

    // Check for slash command before anything else.
    if (this.plugin.slashCommands.isSlashCommand(text)) {
      this.addMessage("user", text);
      this.inputEl.value = "";

      const context: SlashCommandContext = {
        vault: this.app.vault,
        settings: this.plugin.settings,
        addChatMessage: (role, content) => this.addMessage(role, content),
      };

      try {
        const result = await this.plugin.slashCommands.execute(text, context);
        this.addMessage("assistant", result);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        this.addMessage("assistant", `Command error: ${errorMsg}`);
      }
      return;
    }

    // Check for @mention.
    const agentNames = this.agents.map((a) => a.name);
    const mention = detectMention(text, agentNames);

    if (mention) {
      await this.handleMention(mention);
      this.inputEl.value = "";
      return;
    }

    // Fire UserPromptSubmit hook.
    const hookResult = await this.plugin.hookManager.fireHook(HookEvent.UserPromptSubmit, text);
    if (!hookResult.proceed) {
      this.addMessage("assistant", `Hook blocked: ${hookResult.error || "Operation blocked by hook"}`);
      return;
    }
    const finalText = hookResult.modifiedInput || text;

    // Add user message to UI and session.
    this.addMessage("user", finalText);
    this.inputEl.value = "";
    this.isStreaming = true;
    this.updateStatus("Thinking...");

    // Track in current session.
    if (!this.currentSession) {
      this.startNewSession();
    }
    this.currentSession!.messages.push({
      role: "user",
      content: finalText,
      timestamp: new Date().toISOString(),
    });

    // Build system prompt.
    let systemPrompt: string;
    try {
      systemPrompt = await this.plugin.memoryInjector.buildSystemPromptContext();
    } catch {
      systemPrompt = "You are Chimera Nexus, an AI assistant in Obsidian.";
    }

    // If using a specific agent, prepend agent system prompt.
    if (this.currentAgent?.systemPrompt) {
      systemPrompt = this.currentAgent.systemPrompt + "\n\n" + systemPrompt;
    }

    // Create a placeholder message element for streaming.
    const assistantMsgEl = this.createStreamingMessage();

    // Send via SDK.
    let fullResponse = "";
    this.plugin.sdkWrapper.sendMessage(finalText, systemPrompt, {
      onChunk: (chunk) => {
        fullResponse += chunk;
        this.updateStreamingMessage(assistantMsgEl, fullResponse);
      },
      onComplete: async (completeText) => {
        this.isStreaming = false;
        this.updateStatus("Ready");

        // Add to session.
        this.currentSession!.messages.push({
          role: "assistant",
          content: completeText,
          timestamp: new Date().toISOString(),
        });
        this.currentSession!.messageCount = this.currentSession!.messages.length;
        this.currentSession!.updated = new Date().toISOString();

        // Fire Stop hook.
        await this.plugin.hookManager.fireHook(HookEvent.Stop);

        // Save session.
        try {
          await this.plugin.sessionStore.saveSession(this.currentSession!);
          await this.plugin.sessionIndex.updateSession({
            sessionId: this.currentSession!.sessionId,
            agent: this.currentSession!.agent,
            title: this.currentSession!.title,
            created: this.currentSession!.created,
            updated: this.currentSession!.updated,
            messageCount: this.currentSession!.messageCount,
            status: this.currentSession!.status,
            path: `.claude/sessions/${this.currentSession!.agent || "default"}/${this.currentSession!.sessionId}.md`,
          });
        } catch (err) {
          console.warn("Failed to save session:", err);
        }
      },
      onError: (error) => {
        this.isStreaming = false;
        this.updateStreamingMessage(assistantMsgEl, `Error: ${error.message}`);
        this.updateStatus("Error occurred");
      },
    });
  }

  /**
   * Replaces the status bar text with the supplied string.
   *
   * @param text - Status message to display (e.g. `"Ready"`, `"Thinking..."`).
   */
  updateStatus(text: string): void {
    // Update connection status then append the status text.
    this.updateConnectionStatus();

    // Add a text span after the connection indicator.
    let statusTextEl = this.statusBarEl.querySelector(".chimera-status-text") as HTMLElement | null;
    if (!statusTextEl) {
      statusTextEl = this.statusBarEl.createEl("span", { cls: "chimera-status-text" });
    }
    statusTextEl.textContent = text;
  }

  // -------------------------------------------------------------------------
  // Private helpers - UI
  // -------------------------------------------------------------------------

  /**
   * Shows the centered welcome/empty state in the messages area.
   */
  private showWelcome(): void {
    this.welcomeEl = this.messagesEl.createDiv({ cls: "chimera-welcome" });
    this.welcomeEl.createDiv({ cls: "chimera-welcome-icon", text: "\uD83E\uDD16" });
    this.welcomeEl.createEl("h3", { text: "Chimera Nexus" });
    this.welcomeEl.createEl("p", { text: "Start a conversation, select an agent, or type /help" });
  }

  /**
   * Removes the welcome state from the messages area if present.
   */
  private clearWelcome(): void {
    if (this.welcomeEl) {
      this.welcomeEl.remove();
      this.welcomeEl = null;
    }
  }

  /**
   * Renders the permission mode pill in the header.
   */
  private renderPermissionPill(): void {
    const mode = this.plugin.settings.permissionMode;
    this.permissionPillEl.innerHTML = "";
    this.permissionPillEl.className = `chimera-permission-pill ${permissionClass(mode)}`;

    // Dot indicator
    this.permissionPillEl.createDiv({ cls: "chimera-permission-pill-dot" });

    // Dropdown inside the pill
    const select = this.permissionPillEl.createEl("select");
    for (const pm of [PermissionMode.Safe, PermissionMode.Plan, PermissionMode.YOLO]) {
      const opt = select.createEl("option");
      opt.value = pm;
      opt.textContent = permissionLabel(pm);
      if (pm === mode) opt.selected = true;
    }

    select.addEventListener("change", async () => {
      this.plugin.settings.permissionMode = select.value as PermissionMode;
      await this.plugin.saveSettings();
      this.renderPermissionPill();
    });
  }

  /**
   * Updates the connection status indicator in the status bar.
   */
  private updateConnectionStatus(): void {
    this.connectionStatusEl.innerHTML = "";

    const settings = this.plugin.settings;
    let label: string;
    let dotClass: string;

    if (settings.authMethod === AuthMethod.CLI) {
      label = `Connected via CLI (${settings.cliPath})`;
      dotClass = "is-connected";
    } else if (settings.authMethod === AuthMethod.APIKey && settings.apiKey) {
      label = "Connected via API Key";
      dotClass = "is-connected";
    } else {
      label = "Not configured";
      dotClass = "is-disconnected";
    }

    this.connectionStatusEl.createDiv({ cls: `chimera-connection-dot ${dotClass}` });
    this.connectionStatusEl.createEl("span", { text: label });
  }

  // -------------------------------------------------------------------------
  // Private helpers - session management
  // -------------------------------------------------------------------------

  /**
   * Creates a new {@link Session} object with a random ID and sets it as the
   * current session.
   *
   * The agent name is taken from the currently selected agent, or `"default"`
   * if no agent is selected. The title is derived from the first user message
   * later during summarization.
   */
  private startNewSession(): void {
    const now = new Date().toISOString();
    this.currentSession = {
      sessionId: generateUUID(),
      agent: this.currentAgent?.name ?? "",
      title: "",
      created: now,
      updated: now,
      model: "claude-sonnet-4-20250514",
      tokensUsed: 0,
      messageCount: 0,
      status: "active",
      outputFiles: [],
      tags: [],
      messages: [],
    };
  }

  // -------------------------------------------------------------------------
  // Private helpers - streaming UI
  // -------------------------------------------------------------------------

  /**
   * Creates a new assistant message div in the messages area with empty content
   * suitable for progressive streaming updates.
   *
   * @returns The content element that should be updated with streaming text.
   */
  private createStreamingMessage(): HTMLElement {
    // Clear welcome state on streaming start.
    this.clearWelcome();

    const msgEl = this.messagesEl.createDiv({
      cls: "chimera-message is-assistant",
    });

    const roleLabel = msgEl.createDiv({ cls: "chimera-message-role" });
    roleLabel.textContent = "Chimera";

    const contentEl = msgEl.createDiv({ cls: "chimera-message-content" });
    contentEl.textContent = "";

    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    return contentEl;
  }

  /**
   * Updates the text content of a streaming message element and scrolls
   * the messages area to the bottom.
   *
   * @param el - The content element returned by {@link createStreamingMessage}.
   * @param content - The full accumulated response text so far.
   */
  private updateStreamingMessage(el: HTMLElement, content: string): void {
    el.textContent = content;
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }

  // -------------------------------------------------------------------------
  // Private helpers - agent switching
  // -------------------------------------------------------------------------

  /**
   * Handles switching to a different agent.
   *
   * If the current session has messages it is paused and saved before the
   * switch. A new session is started for the selected agent, the messages area
   * is cleared, and the session list is refreshed.
   *
   * @param agentName - Name of the agent to switch to, or empty string for default.
   */
  private async handleAgentChange(agentName: string): Promise<void> {
    // Save current session if it has messages.
    if (this.currentSession && this.currentSession.messages.length > 0) {
      try {
        this.currentSession.status = "paused";
        this.currentSession.updated = new Date().toISOString();
        await this.plugin.sessionStore.saveSession(this.currentSession);
        await this.plugin.sessionIndex.updateSession({
          sessionId: this.currentSession.sessionId,
          agent: this.currentSession.agent,
          title: this.currentSession.title,
          created: this.currentSession.created,
          updated: this.currentSession.updated,
          messageCount: this.currentSession.messageCount,
          status: this.currentSession.status,
          path: `.claude/sessions/${this.currentSession.agent || "default"}/${this.currentSession.sessionId}.md`,
        });
      } catch (err) {
        console.warn("Failed to save session during agent switch:", err);
      }
    }

    // Find the agent definition by name (or null for default).
    if (agentName) {
      this.currentAgent = this.agents.find((a) => a.name === agentName) ?? null;
    } else {
      this.currentAgent = null;
    }

    // Start a new session for the new agent.
    this.startNewSession();

    // Update session list for the selected agent.
    if (this.agentSelectorComponent) {
      const entries = this.plugin.sessionIndex.getEntries(agentName || undefined);
      this.agentSelectorComponent.setSessions(entries);
    }

    // Sync the header dropdown.
    this.agentSelect.value = agentName || "default";

    // Clear messages area and show welcome for new agent.
    this.messagesEl.innerHTML = "";
    const agentLabel = this.currentAgent?.name ?? "Default Chimera";
    this.showWelcome();

    this.updateStatus(`Agent: ${agentLabel}`);
  }

  // -------------------------------------------------------------------------
  // Private helpers - session resume
  // -------------------------------------------------------------------------

  /**
   * Resumes a previous session by loading it from the store and re-rendering
   * its messages in the chat area.
   *
   * @param sessionId - The UUID of the session to resume.
   */
  private async handleSessionResume(sessionId: string): Promise<void> {
    // Find the session entry from the index.
    const entries = this.plugin.sessionIndex.getEntries();
    const entry = entries.find((e) => e.sessionId === sessionId);
    if (!entry) {
      new Notice("Session not found in index.");
      return;
    }

    try {
      // Load the full session from the store.
      const session = await this.plugin.sessionStore.loadSession(entry.path);
      session.status = "active";
      session.updated = new Date().toISOString();
      this.currentSession = session;

      // Set the matching agent.
      if (session.agent) {
        this.currentAgent = this.agents.find((a) => a.name === session.agent) ?? null;
      } else {
        this.currentAgent = null;
      }

      // Clear messages area and re-render all messages.
      this.messagesEl.innerHTML = "";
      this.welcomeEl = null;
      for (const msg of session.messages) {
        this.addMessage(msg.role, msg.content);
      }

      const sessionLabel = session.title || session.sessionId.slice(0, 8);
      this.updateStatus(`Resumed session: ${sessionLabel}`);
    } catch (err) {
      console.warn("Failed to resume session:", err);
      new Notice("Failed to load session. Check console for details.");
    }
  }

  // -------------------------------------------------------------------------
  // Private helpers - @mention handling
  // -------------------------------------------------------------------------

  /**
   * Processes an @mention detected in user input.
   *
   * For foreground mentions, the agent's system prompt is used and the response
   * is streamed inline. For background mentions, a placeholder message is shown
   * (background execution is not yet wired to the background-manager).
   *
   * @param mention - The parsed mention result from the mention detector.
   */
  private async handleMention(mention: MentionResult): Promise<void> {
    // Find the agent definition.
    const agent = this.agents.find((a) => a.name === mention.agentName);
    if (!agent) {
      this.addMessage("assistant", `Unknown agent: @${mention.agentName}`);
      return;
    }

    if (mention.background) {
      // Background execution stub.
      this.addMessage("user", mention.originalMessage);
      this.addMessage("assistant", `Starting @${mention.agentName} in background.`);
      this.updateStatus(`@${mention.agentName} running in background`);
      // TODO: Wire to background-manager once implemented.
      return;
    }

    // Foreground execution: stream the agent's response inline.
    this.addMessage("user", mention.originalMessage);
    this.addMessage("assistant", `[@${mention.agentName}] Processing...`);

    // Ensure we have a session.
    if (!this.currentSession) {
      this.startNewSession();
    }
    this.currentSession!.messages.push({
      role: "user",
      content: mention.originalMessage,
      timestamp: new Date().toISOString(),
    });

    // Build agent-specific system prompt.
    let systemPrompt: string;
    try {
      systemPrompt = await this.plugin.memoryInjector.buildSystemPromptContext();
    } catch {
      systemPrompt = "You are Chimera Nexus, an AI assistant in Obsidian.";
    }
    if (agent.systemPrompt) {
      systemPrompt = agent.systemPrompt + "\n\n" + systemPrompt;
    }

    // Create streaming message element.
    const assistantMsgEl = this.createStreamingMessage();
    this.isStreaming = true;
    this.updateStatus(`@${mention.agentName} responding...`);

    let fullResponse = "";
    this.plugin.sdkWrapper.sendMessage(mention.task, systemPrompt, {
      onChunk: (chunk) => {
        fullResponse += chunk;
        this.updateStreamingMessage(assistantMsgEl, `[@${mention.agentName}] ${fullResponse}`);
      },
      onComplete: async (completeText) => {
        this.isStreaming = false;
        this.updateStreamingMessage(assistantMsgEl, `[@${mention.agentName}] ${completeText}`);
        this.addMessage("assistant", `[@${mention.agentName}] Complete`);
        this.updateStatus("Ready");

        // Add to session.
        this.currentSession!.messages.push({
          role: "assistant",
          content: `[@${mention.agentName}] ${completeText}`,
          timestamp: new Date().toISOString(),
        });
        this.currentSession!.messageCount = this.currentSession!.messages.length;
        this.currentSession!.updated = new Date().toISOString();

        // Save session.
        try {
          await this.plugin.sessionStore.saveSession(this.currentSession!);
        } catch (err) {
          console.warn("Failed to save session after mention:", err);
        }
      },
      onError: (error) => {
        this.isStreaming = false;
        this.updateStreamingMessage(assistantMsgEl, `[@${mention.agentName}] Error: ${error.message}`);
        this.updateStatus("Error occurred");
      },
    });
  }
}
