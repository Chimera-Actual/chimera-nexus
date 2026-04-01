/**
 * @file Obsidian sidebar chat view for Chimera Nexus.
 *
 * Renders the full chat UI inside Obsidian's right sidebar leaf. The view
 * handles agent switching, @mention detection, streaming SDK responses, hook
 * execution, and post-session processing (memory extraction and summarization).
 *
 * Layout mirrors the Claudian plugin's design language with chimera- prefixed
 * CSS classes throughout. Header is minimal (logo + title only), action buttons
 * live in a nav row between messages and input, agent selection uses a hover
 * dropdown, and permission mode uses a toggle switch.
 */

import { ItemView, Notice, WorkspaceLeaf, setIcon } from "obsidian";

import {
  ChimeraSettings,
  AgentDefinition,
  Session,
  HookEvent,
  MentionResult,
  PermissionMode,
  AuthMethod,
  SessionIndexEntry,
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

// ---------------------------------------------------------------------------
// ChimeraChatView
// ---------------------------------------------------------------------------

/**
 * Obsidian sidebar view that renders the Chimera Nexus chat interface.
 *
 * Lifecycle:
 * - {@link onOpen} builds the full DOM layout mirroring Claudian's design.
 * - {@link onClose} runs post-session processing (save, memory extraction,
 *   summarization) before tearing down.
 *
 * Public helper surface:
 * - {@link addMessage} appends a message bubble to the chat area.
 * - {@link handleSend} dispatches user messages to the SDK with streaming.
 * - {@link updateStatus} updates the status bar text.
 */
export class ChimeraChatView extends ItemView {
  // -------------------------------------------------------------------------
  // Private DOM references
  // -------------------------------------------------------------------------

  private messagesEl!: HTMLElement;
  private inputEl!: HTMLTextAreaElement;
  private statusBarEl!: HTMLElement;
  private statusDotEl!: HTMLElement;
  private statusTextEl!: HTMLElement;
  private welcomeEl!: HTMLElement | null;
  private historyMenuEl!: HTMLElement | null;
  private agentLabelEl!: HTMLElement;
  private agentDropdownEl!: HTMLElement;
  private permissionLabelEl!: HTMLElement;
  private permissionToggleEl!: HTMLElement;

  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------

  private plugin: ChimeraNexusPluginRef;
  private currentSession: Session | null = null;
  private currentAgent: AgentDefinition | null = null;
  private agents: AgentDefinition[] = [];
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
   * Builds the Claudian-matched DOM layout: minimal header (logo + title),
   * messages area, nav row with action buttons between messages and input,
   * bordered input wrapper with toolbar containing model label, agent hover
   * dropdown, and permission toggle switch.
   */
  async onOpen(): Promise<void> {
    const container = this.containerEl;
    container.empty();

    // Root wrapper
    const root = container.createDiv({ cls: "chimera-container" });

    // ------------------------------------------------------------------
    // 1. Header - ONLY logo + title (nothing else)
    // ------------------------------------------------------------------

    const header = root.createDiv({ cls: "chimera-header" });
    const titleSlot = header.createDiv({ cls: "chimera-title-slot" });

    // Brand logo (8-point star)
    const logoEl = titleSlot.createSpan({ cls: "chimera-logo" });
    logoEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="var(--chimera-brand)" stroke="none"><path d="M12 2L14 10L22 12L14 14L12 22L10 14L2 12L10 10Z"/></svg>`;

    titleSlot.createEl("h4", { cls: "chimera-title-text", text: "Chimera Nexus" });

    // ------------------------------------------------------------------
    // 2. Messages wrapper
    // ------------------------------------------------------------------

    const messagesWrapper = root.createDiv({ cls: "chimera-messages-wrapper" });
    this.messagesEl = messagesWrapper.createDiv({ cls: "chimera-messages" });
    this.showWelcome();

    // ------------------------------------------------------------------
    // 3. Input container
    // ------------------------------------------------------------------

    const inputContainer = root.createDiv({ cls: "chimera-input-container" });

    // 3a. Nav row (between messages and input, like Claudian's tab badges)
    const navRow = inputContainer.createDiv({ cls: "chimera-input-nav-row" });
    const navActions = navRow.createDiv({ cls: "chimera-nav-actions" });

    // New session button
    const newBtn = navActions.createEl("span", { cls: "chimera-header-btn" });
    setIcon(newBtn, "square-plus");
    newBtn.title = "New session";
    newBtn.addEventListener("click", () => {
      this.startNewSession();
      this.messagesEl.innerHTML = "";
      this.showWelcome();
      this.updateStatus("New session started.");
    });

    // New conversation button
    const editBtn = navActions.createEl("span", { cls: "chimera-header-btn" });
    setIcon(editBtn, "square-pen");
    editBtn.title = "New conversation";
    editBtn.addEventListener("click", () => {
      this.startNewSession();
      this.messagesEl.innerHTML = "";
      this.showWelcome();
      this.updateStatus("New conversation.");
    });

    // History button + dropdown container
    const historyContainer = navActions.createDiv({ cls: "chimera-history-container" });
    const historyBtn = historyContainer.createEl("span", { cls: "chimera-header-btn" });
    setIcon(historyBtn, "history");
    historyBtn.title = "Session history";
    this.historyMenuEl = historyContainer.createDiv({ cls: "chimera-history-menu" });
    historyBtn.addEventListener("click", () => {
      this.toggleHistory();
    });

    // 3b. Input wrapper (bordered box)
    const inputWrapper = inputContainer.createDiv({ cls: "chimera-input-wrapper" });

    this.inputEl = inputWrapper.createEl("textarea", { cls: "chimera-input" });
    this.inputEl.placeholder = "How can I help you today?";
    this.inputEl.rows = 3;
    this.inputEl.setAttribute("dir", "auto");

    // Enter to send, Shift+Enter for newline (NO send button)
    this.inputEl.addEventListener("keydown", (evt: KeyboardEvent) => {
      if (evt.key === "Enter" && !evt.shiftKey) {
        evt.preventDefault();
        this.handleSend();
      }
    });

    // 3c. Input toolbar (inside input wrapper, at bottom)
    const toolbar = inputWrapper.createDiv({ cls: "chimera-input-toolbar" });

    // Model label (like Claudian's model selector, read-only for now)
    const modelLabel = toolbar.createDiv({ cls: "chimera-model-label" });
    modelLabel.textContent = "Sonnet";

    // Agent selector (hover dropdown like Claudian's model dropdown)
    this.buildAgentSelector(toolbar);

    // Permission toggle (Safe/YOLO toggle switch)
    this.buildPermissionToggle(toolbar);

    // ------------------------------------------------------------------
    // 4. Status bar
    // ------------------------------------------------------------------

    this.statusBarEl = root.createDiv({ cls: "chimera-status-bar" });
    this.statusDotEl = this.statusBarEl.createEl("span", { cls: "chimera-status-dot" });
    this.statusTextEl = this.statusBarEl.createEl("span");
    this.updateConnectionStatus();

    // ------------------------------------------------------------------
    // 5. Load agents and populate controls
    // ------------------------------------------------------------------

    try {
      this.agents = await this.plugin.agentLoader.loadAgents();
    } catch {
      // Logged internally by AgentLoader.
    }

    this.refreshAgentDropdown();

    const entries = this.plugin.sessionIndex.getEntries();
    this.refreshHistoryMenu(entries);
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
   * No role labels -- user messages right-aligned with dark bubble, assistant
   * messages transparent full-width left-aligned.
   *
   * @param role    - Either `"user"` or `"assistant"`.
   * @param content - Plain-text message content to display.
   */
  addMessage(role: "user" | "assistant", content: string): void {
    this.clearWelcome();

    const msgEl = this.messagesEl.createDiv({
      cls: `chimera-message chimera-message-${role}`,
    });

    const contentEl = msgEl.createDiv({ cls: "chimera-message-content" });
    contentEl.textContent = content;

    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }

  /**
   * Reads the current textarea value, processes @mentions and hooks, then
   * dispatches the message to the SDK with streaming response callbacks.
   */
  async handleSend(): Promise<void> {
    const text = this.inputEl.value.trim();
    if (!text || this.isStreaming) return;

    this.clearWelcome();

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
    this.updateConnectionStatus();
    this.statusTextEl.textContent = text;
  }

  // -------------------------------------------------------------------------
  // Private helpers - UI builders
  // -------------------------------------------------------------------------

  /**
   * Builds the agent hover-dropdown in the input toolbar (like Claudian's
   * model dropdown).
   */
  private buildAgentSelector(toolbar: HTMLElement): void {
    const wrapper = toolbar.createDiv({ cls: "chimera-agent-selector-wrapper" });
    this.agentLabelEl = wrapper.createDiv({ cls: "chimera-agent-label" });
    this.agentLabelEl.textContent = "Default";
    this.agentDropdownEl = wrapper.createDiv({ cls: "chimera-agent-dropdown" });
  }

  /**
   * Refreshes the agent dropdown options to match the current agents list.
   */
  private refreshAgentDropdown(): void {
    this.agentDropdownEl.innerHTML = "";

    // Default option
    const defaultOpt = this.agentDropdownEl.createDiv({ cls: "chimera-agent-option" });
    defaultOpt.textContent = "Default";
    if (!this.currentAgent) defaultOpt.addClass("selected");
    defaultOpt.addEventListener("click", () => this.handleAgentChange(""));

    // Agent options
    for (const agent of this.agents) {
      const opt = this.agentDropdownEl.createDiv({ cls: "chimera-agent-option" });
      opt.textContent = agent.name;
      if (this.currentAgent?.name === agent.name) opt.addClass("selected");
      opt.addEventListener("click", () => this.handleAgentChange(agent.name));
    }
  }

  /**
   * Builds the permission toggle switch in the input toolbar (like Claudian's
   * Safe/YOLO toggle).
   */
  private buildPermissionToggle(toolbar: HTMLElement): void {
    const toggle = toolbar.createDiv({ cls: "chimera-permission-toggle" });
    this.permissionLabelEl = toggle.createSpan({ cls: "chimera-permission-label" });
    this.permissionToggleEl = toggle.createDiv({ cls: "chimera-toggle-switch" });
    this.updatePermissionDisplay();
    this.permissionToggleEl.addEventListener("click", () => this.togglePermission());
  }

  /**
   * Updates the permission toggle visual state to match the current setting.
   */
  private updatePermissionDisplay(): void {
    const mode = this.plugin.settings.permissionMode;
    if (mode === PermissionMode.YOLO) {
      this.permissionToggleEl.addClass("active");
      this.permissionLabelEl.textContent = "YOLO";
    } else {
      this.permissionToggleEl.removeClass("active");
      this.permissionLabelEl.textContent = "Safe";
    }
  }

  /**
   * Toggles between Safe and YOLO permission modes.
   */
  private async togglePermission(): Promise<void> {
    const current = this.plugin.settings.permissionMode;
    const next = current === PermissionMode.YOLO ? PermissionMode.Safe : PermissionMode.YOLO;
    this.plugin.settings.permissionMode = next;
    await this.plugin.saveSettings();
    this.updatePermissionDisplay();
  }

  // -------------------------------------------------------------------------
  // Private helpers - UI state
  // -------------------------------------------------------------------------

  /**
   * Shows the centered welcome/empty state in the messages area.
   */
  private showWelcome(): void {
    this.welcomeEl = this.messagesEl.createDiv({ cls: "chimera-welcome" });
    this.welcomeEl.createDiv({ cls: "chimera-welcome-greeting", text: "What can I help with?" });
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
   * Updates the connection status dot in the status bar.
   */
  private updateConnectionStatus(): void {
    const settings = this.plugin.settings;
    let label: string;
    let isConnected: boolean;

    if (settings.authMethod === AuthMethod.CLI) {
      label = `CLI (${settings.cliPath})`;
      isConnected = true;
    } else if (settings.authMethod === AuthMethod.APIKey && settings.apiKey) {
      label = "API Key";
      isConnected = true;
    } else {
      label = "Not configured";
      isConnected = false;
    }

    this.statusDotEl.className = isConnected
      ? "chimera-status-dot connected"
      : "chimera-status-dot disconnected";

    // Only update text if no explicit status has been set
    if (!this.statusTextEl.textContent || this.statusTextEl.textContent === label) {
      this.statusTextEl.textContent = label;
    }
  }

  /**
   * Toggles the session history dropdown visibility.
   */
  private toggleHistory(): void {
    if (!this.historyMenuEl) return;

    if (this.historyMenuEl.hasClass("is-visible")) {
      this.historyMenuEl.removeClass("is-visible");
    } else {
      // Refresh entries before showing
      const entries = this.plugin.sessionIndex.getEntries();
      this.refreshHistoryMenu(entries);
      this.historyMenuEl.addClass("is-visible");
    }
  }

  /**
   * Refreshes the history menu entries.
   */
  private refreshHistoryMenu(entries: SessionIndexEntry[]): void {
    if (!this.historyMenuEl) return;
    this.historyMenuEl.innerHTML = "";

    if (entries.length === 0) {
      const emptyEl = this.historyMenuEl.createDiv({ cls: "chimera-history-item" });
      emptyEl.createDiv({ cls: "chimera-history-title", text: "No sessions yet" });
      return;
    }

    for (const entry of entries.slice(0, 20)) {
      const item = this.historyMenuEl.createDiv({ cls: "chimera-history-item" });
      item.createDiv({ cls: "chimera-history-title", text: entry.title || "Untitled" });
      item.createDiv({ cls: "chimera-history-meta", text: entry.updated?.slice(0, 10) || "" });
      if (this.currentSession?.sessionId === entry.sessionId) item.addClass("active");
      item.addEventListener("click", () => {
        this.handleSessionResume(entry.sessionId);
        this.historyMenuEl?.removeClass("is-visible");
      });
    }
  }

  // -------------------------------------------------------------------------
  // Private helpers - session management
  // -------------------------------------------------------------------------

  /**
   * Creates a new {@link Session} object with a random ID and sets it as the
   * current session.
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
    this.clearWelcome();

    const msgEl = this.messagesEl.createDiv({
      cls: "chimera-message chimera-message-assistant",
    });

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
   * is cleared, and the agent dropdown is refreshed.
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

    // Update the agent label and dropdown selection.
    this.agentLabelEl.textContent = this.currentAgent?.name ?? "Default";
    this.refreshAgentDropdown();

    // Clear messages area and show welcome for new agent.
    this.messagesEl.innerHTML = "";
    this.showWelcome();

    const agentLabel = this.currentAgent?.name ?? "Default Chimera";
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

      // Update agent label.
      this.agentLabelEl.textContent = this.currentAgent?.name ?? "Default";
      this.refreshAgentDropdown();

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
