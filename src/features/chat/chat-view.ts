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

import { ItemView, Notice, WorkspaceLeaf, setIcon, MarkdownRenderer, Component, Modal, Setting, App } from "obsidian";

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
import { ChatRenderer } from "./chat-renderer";
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
  private permissionBtnEl!: HTMLElement;
  private permissionDropdownEl!: HTMLElement;
  private modelSelectorEl!: HTMLElement;
  private modelLabelEl!: HTMLElement;
  private modelDropdownEl!: HTMLElement;
  private effortLabelEl!: HTMLElement;
  private effortDropdownEl!: HTMLElement;
  private externalContextDropdownEl!: HTMLElement;
  private slashDropdownEl!: HTMLElement;
  private slashSelectedIndex = -1;
  private convModeBtn!: HTMLElement;

  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------

  private plugin: ChimeraNexusPluginRef;
  private currentSession: Session | null = null;
  private currentAgent: AgentDefinition | null = null;
  private agents: AgentDefinition[] = [];
  private isStreaming = false;
  private renderComponent: Component = new Component();
  private outsideClickHandler: ((evt: MouseEvent) => void) | null = null;
  private thinkingIndicatorEl: HTMLElement | null = null;
  private thinkingStartTime = 0;
  private thinkingTimerInterval: number | null = null;

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
    this.renderComponent.load();

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

    // Slash command dropdown (positioned above input wrapper)
    this.slashDropdownEl = inputWrapper.createDiv({ cls: "chimera-slash-dropdown" });

    this.inputEl = inputWrapper.createEl("textarea", { cls: "chimera-input" });
    this.inputEl.placeholder = "How can I help you today?";
    this.inputEl.rows = 3;
    this.inputEl.setAttribute("dir", "auto");

    // Keyboard handler for slash dropdown navigation and send
    this.inputEl.addEventListener("keydown", (evt: KeyboardEvent) => {
      if (this.slashDropdownEl.hasClass("is-visible")) {
        if (evt.key === "ArrowDown") {
          evt.preventDefault();
          this.navigateSlashDropdown(1);
          return;
        }
        if (evt.key === "ArrowUp") {
          evt.preventDefault();
          this.navigateSlashDropdown(-1);
          return;
        }
        if (evt.key === "Enter") {
          evt.preventDefault();
          this.selectSlashCommand();
          return;
        }
        if (evt.key === "Escape") {
          evt.preventDefault();
          this.hideSlashDropdown();
          return;
        }
      }

      if (evt.key === "Escape" && this.isStreaming) {
        evt.preventDefault();
        this.plugin.sdkWrapper.abort();
        this.isStreaming = false;
        this.inputEl.disabled = false;
        this.updateStatus("Cancelled");
        return;
      }

      if (evt.key === "Enter" && !evt.shiftKey) {
        evt.preventDefault();
        this.handleSend();
      }
    });

    this.inputEl.addEventListener("input", () => {
      this.handleSlashAutocomplete();
    });

    // 3c. Input toolbar (inside input wrapper, at bottom)
    const toolbar = inputWrapper.createDiv({ cls: "chimera-input-toolbar" });

    // Model selector (Claudian hover dropdown pattern)
    this.buildModelSelector(toolbar);

    // Effort selector (Claudian thinking-selector pattern)
    this.buildEffortSelector(toolbar);

    // External context folder button
    this.buildExternalContextSelector(toolbar);

    // Agent selector (hover dropdown like Claudian's model dropdown)
    this.buildAgentSelector(toolbar);

    // Conversational mode toggle
    const convWrapper = toolbar.createDiv({ cls: "chimera-conv-mode" });
    this.convModeBtn = convWrapper.createDiv({ cls: "chimera-conv-mode-btn" });
    this.updateConvModeButton();
    this.convModeBtn.addEventListener("click", async () => {
      this.plugin.settings.conversationalMode = !this.plugin.settings.conversationalMode;
      await this.plugin.saveSettings();
      this.updateConvModeButton();
    });

    // Permission selector (Claude Code-style popup)
    this.buildPermissionSelector(toolbar);

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

    // Outside-click handler to dismiss history and external context dropdowns
    this.outsideClickHandler = (evt: MouseEvent) => {
      // Close history menu if clicking outside
      if (this.historyMenuEl?.hasClass("is-visible")) {
        if (!historyContainer.contains(evt.target as Node)) {
          this.historyMenuEl.removeClass("is-visible");
        }
      }
      // Close external context dropdown if clicking outside
      if (this.externalContextDropdownEl?.hasClass("is-visible")) {
        const extWrapper = this.externalContextDropdownEl.parentElement;
        if (extWrapper && !extWrapper.contains(evt.target as Node)) {
          this.externalContextDropdownEl.removeClass("is-visible");
        }
      }
    };
    document.addEventListener("click", this.outsideClickHandler);
  }

  /**
   * Called by Obsidian when the leaf is closed.
   *
   * Runs post-session processing if there is an active session with messages:
   * saves the session, extracts memory signals (if enabled), and creates a
   * summary note.
   */
  async onClose(): Promise<void> {
    this.removeThinkingIndicator();
    if (this.outsideClickHandler) {
      document.removeEventListener("click", this.outsideClickHandler);
    }
    this.renderComponent.unload();

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
          // Auto-commit succeeded, no action needed.
          void committed;
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
    const msgEl = this.messagesEl.createDiv({
      cls: `chimera-message chimera-message-${role}`,
    });
    const contentEl = msgEl.createDiv({ cls: "chimera-message-content" });

    if (role === "assistant") {
      // Render markdown for assistant messages
      MarkdownRenderer.render(
        this.app,
        content,
        contentEl,
        "",
        this.renderComponent,
      );
    } else {
      contentEl.textContent = content;
    }

    // Copy button (hover to reveal)
    const copyBtn = msgEl.createDiv({ cls: "chimera-message-copy-btn" });
    setIcon(copyBtn, "copy");
    copyBtn.title = "Copy to clipboard";
    copyBtn.addEventListener("click", async () => {
      await navigator.clipboard.writeText(content);
      setIcon(copyBtn, "check");
      copyBtn.title = "Copied!";
      setTimeout(() => {
        setIcon(copyBtn, "copy");
        copyBtn.title = "Copy to clipboard";
      }, 2000);
    });

    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    this.clearWelcome();
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
        saveSettings: () => this.plugin.saveSettings(),
      };

      try {
        const result = await this.plugin.slashCommands.execute(text, context);
        if (result) {
          this.addMessage("assistant", result);
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        this.addMessage("assistant", `Command error: ${errorMsg}`);
      }

      // Handle conversation-clearing commands by resetting the UI.
      const cmdName = text.trim().replace(/^\//, "").split(/\s+/)[0];
      if (cmdName === "clear" || cmdName === "new" || cmdName === "reset") {
        this.startNewSession();
        this.messagesEl.innerHTML = "";
        this.showWelcome();
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
    this.inputEl.disabled = true;
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

    // Conversational mode: instruct the model not to modify files.
    if (this.plugin.settings.conversationalMode) {
      systemPrompt += "\n\nYou are in conversational mode. Do NOT modify any files. Only read files when explicitly asked. Focus on answering questions and providing guidance.";
    }

    // Create a placeholder message element for streaming.
    const assistantMsgEl = this.createStreamingMessage();

    // Show thinking indicator while waiting for first chunk.
    this.showThinkingIndicator();

    // Send via SDK.
    let fullResponse = "";
    let firstChunk = true;
    this.plugin.sdkWrapper.sendMessage(finalText, systemPrompt, {
      onChunk: (chunk) => {
        if (firstChunk) {
          firstChunk = false;
          this.removeThinkingIndicator();
        }
        fullResponse += chunk;
        this.updateStreamingMessage(assistantMsgEl, fullResponse);

        // Detect permission request from CLI output
        if (
          fullResponse.includes("REQUIRED_APPROVAL") ||
          (fullResponse.includes("permission") && fullResponse.includes("approve"))
        ) {
          this.updateStatus("Permission requested - check response");
        }
      },
      onComplete: async (completeText) => {
        this.removeThinkingIndicator();
        this.isStreaming = false;
        this.inputEl.disabled = false;
        this.inputEl.focus();
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
        this.removeThinkingIndicator();
        this.isStreaming = false;
        this.inputEl.disabled = false;
        this.inputEl.focus();
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

  /**
   * Renders a tool call in the messages area and scrolls to the bottom.
   *
   * @param toolName - Name of the tool (e.g. `"Read"`, `"Bash"`).
   * @param summary  - One-line summary shown next to the tool name.
   * @param status   - Current execution status for the status icon.
   * @param content  - Optional detailed output shown when expanded.
   * @returns The root element of the rendered tool call block.
   */
  addToolCall(toolName: string, summary: string, status: "running" | "completed" | "error", content?: string): HTMLElement {
    const el = ChatRenderer.renderToolCall(this.messagesEl, toolName, summary, status, content);
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    return el;
  }

  /**
   * Renders a thinking indicator in the messages area and scrolls to the bottom.
   *
   * @param isActive - Whether the model is currently thinking (shows pulse animation).
   * @param content  - Optional thinking text shown when expanded.
   * @param duration - Optional duration string (e.g. `"3.2s"`).
   * @returns The root element of the rendered thinking block.
   */
  addThinkingBlock(isActive: boolean, content?: string, duration?: string): HTMLElement {
    const el = ChatRenderer.renderThinkingBlock(this.messagesEl, isActive, content, duration);
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    return el;
  }

  // -------------------------------------------------------------------------
  // Private helpers - UI builders
  // -------------------------------------------------------------------------

  /**
   * Updates the conversational mode toggle button icon and tooltip.
   */
  private updateConvModeButton(): void {
    this.convModeBtn.innerHTML = "";
    if (this.plugin.settings.conversationalMode) {
      setIcon(this.convModeBtn, "message-circle");
      this.convModeBtn.title = "Conversational mode (no file edits) - click to switch to edit mode";
      this.convModeBtn.addClass("is-active");
    } else {
      setIcon(this.convModeBtn, "file-edit");
      this.convModeBtn.title = "Edit mode (full file access) - click to switch to chat-only";
      this.convModeBtn.removeClass("is-active");
    }
  }

  /**
   * Builds the model hover-dropdown in the input toolbar (Claudian pattern).
   */
  private buildModelSelector(toolbar: HTMLElement): void {
    const wrapper = toolbar.createDiv({ cls: "chimera-model-selector" });

    this.modelLabelEl = wrapper.createDiv({ cls: "chimera-model-btn" });
    const labelText = this.modelLabelEl.createSpan();
    labelText.textContent = this.getModelDisplayName(this.plugin.settings.model);
    const chevron = this.modelLabelEl.createSpan({ cls: "chimera-model-chevron" });
    setIcon(chevron, "chevron-up");

    this.modelDropdownEl = wrapper.createDiv({ cls: "chimera-model-dropdown" });
    this.refreshModelDropdown();
  }

  /**
   * Refreshes the model dropdown options to match the current selection.
   */
  private refreshModelDropdown(): void {
    this.modelDropdownEl.innerHTML = "";
    const models = ["haiku", "sonnet", "opus"];
    const displayNames: Record<string, string> = {
      haiku: "Haiku",
      sonnet: "Sonnet",
      opus: "Opus",
    };

    for (const model of models) {
      const opt = this.modelDropdownEl.createDiv({ cls: "chimera-model-option" });
      opt.textContent = displayNames[model] || model;
      if (this.plugin.settings.model === model) opt.addClass("selected");
      opt.addEventListener("click", async () => {
        this.plugin.settings.model = model;
        await this.plugin.saveSettings();
        // Update label
        const label = this.modelLabelEl.querySelector("span:first-child");
        if (label) label.textContent = displayNames[model] || model;
        this.refreshModelDropdown();
      });
    }
  }

  /**
   * Returns the user-facing display name for a model key.
   */
  private getModelDisplayName(model: string): string {
    const names: Record<string, string> = { haiku: "Haiku", sonnet: "Sonnet", opus: "Opus" };
    return names[model] || model;
  }

  /**
   * Builds the effort hover-dropdown in the input toolbar (Claudian thinking-selector pattern).
   */
  private buildEffortSelector(toolbar: HTMLElement): void {
    const wrapper = toolbar.createDiv({ cls: "chimera-effort-selector" });

    wrapper.createSpan({ cls: "chimera-effort-label-text", text: "Effort:" });

    this.effortLabelEl = wrapper.createSpan({ cls: "chimera-effort-current" });
    this.effortLabelEl.textContent = this.getEffortDisplayName(this.plugin.settings.effortLevel);

    this.effortDropdownEl = wrapper.createDiv({ cls: "chimera-effort-dropdown" });
    this.refreshEffortDropdown();
  }

  /**
   * Refreshes the effort dropdown options to match the current selection.
   */
  private refreshEffortDropdown(): void {
    this.effortDropdownEl.innerHTML = "";
    const levels = ["max", "high", "med", "low"];
    const displayNames: Record<string, string> = { max: "Max", high: "High", med: "Med", low: "Low" };

    for (const level of levels) {
      const opt = this.effortDropdownEl.createDiv({ cls: "chimera-effort-option" });
      opt.textContent = displayNames[level];
      if (this.plugin.settings.effortLevel === level) opt.addClass("selected");
      opt.addEventListener("click", async () => {
        this.plugin.settings.effortLevel = level;
        await this.plugin.saveSettings();
        this.effortLabelEl.textContent = displayNames[level];
        this.refreshEffortDropdown();
      });
    }
  }

  /**
   * Returns the user-facing display name for an effort level key.
   */
  private getEffortDisplayName(level: string): string {
    const names: Record<string, string> = { max: "Max", high: "High", med: "Med", low: "Low" };
    return names[level] || level;
  }

  /**
   * Builds the external context folder button in the input toolbar.
   */
  private buildExternalContextSelector(toolbar: HTMLElement): void {
    const wrapper = toolbar.createDiv({ cls: "chimera-external-context-selector" });

    const iconBtn = wrapper.createDiv({ cls: "chimera-external-context-icon-wrapper" });
    const iconEl = iconBtn.createDiv({ cls: "chimera-external-context-icon" });
    setIcon(iconEl, "folder-open");

    this.externalContextDropdownEl = wrapper.createDiv({ cls: "chimera-external-context-dropdown" });
    const headerEl = this.externalContextDropdownEl.createDiv({ cls: "chimera-external-context-header" });
    headerEl.textContent = "External Contexts";
    const hint = this.externalContextDropdownEl.createDiv({ cls: "chimera-external-context-hint" });
    hint.textContent = "Click folder icon to add";

    // Show/hide on click (not hover for this one, since it's an action)
    iconBtn.addEventListener("click", () => {
      this.externalContextDropdownEl.toggleClass("is-visible", !this.externalContextDropdownEl.hasClass("is-visible"));
    });
  }

  /**
   * Opens the agent creation modal.
   */
  private showCreateAgentModal(): void {
    const modal = new AgentCreationModal(this.app, async (name, description, model, systemPrompt) => {
      // Write agent file to .claude/agents/
      const content = [
        "---",
        `name: ${name}`,
        `description: "${description}"`,
        `model: ${model}`,
        "type: standard",
        "allowed_tools: []",
        "denied_tools: []",
        "isolation: none",
        "memory: vault",
        "timeout_seconds: 300",
        "output_format: chat",
        "tags:",
        "  - chimera/agent",
        "---",
        "",
        `# ${name}`,
        "",
        systemPrompt,
      ].join("\n");

      const path = `.claude/agents/${name}.md`;
      try {
        await this.app.vault.adapter.write(path, content);
        new Notice(`Agent "${name}" created`);
        // Reload agents
        this.agents = await this.plugin.agentLoader.loadAgents();
        this.refreshAgentDropdown();
      } catch (err) {
        new Notice(`Failed to create agent: ${err}`);
      }
    });
    modal.open();
  }

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

    // Divider
    this.agentDropdownEl.createDiv({ cls: "chimera-agent-divider" });

    // Add agent button
    const addBtn = this.agentDropdownEl.createDiv({ cls: "chimera-agent-option chimera-agent-add" });
    const addIcon = addBtn.createSpan();
    setIcon(addIcon, "plus");
    addBtn.createSpan({ text: " Create agent..." });
    addBtn.addEventListener("click", () => {
      this.showCreateAgentModal();
    });
  }

  /**
   * Builds the permission popup selector in the input toolbar (Claude Code style).
   */
  private buildPermissionSelector(toolbar: HTMLElement): void {
    const wrapper = toolbar.createDiv({ cls: "chimera-permission-selector" });

    // Current mode button (shows in toolbar)
    this.permissionBtnEl = wrapper.createDiv({ cls: "chimera-permission-btn" });
    this.updatePermissionButton();

    // Dropdown popup (hidden, shows on hover)
    this.permissionDropdownEl = wrapper.createDiv({ cls: "chimera-permission-dropdown" });
    this.buildPermissionOptions();
  }

  /**
   * Updates the permission button label and class to match the current setting.
   */
  private updatePermissionButton(): void {
    const mode = this.plugin.settings.permissionMode;
    const labels: Record<string, string> = {
      [PermissionMode.AskBeforeEdits]: "Ask",
      [PermissionMode.EditAutomatically]: "Auto-edit",
      [PermissionMode.Plan]: "Plan",
      [PermissionMode.BypassPermissions]: "Bypass",
    };
    this.permissionBtnEl.textContent = labels[mode] || "Ask";

    // Color based on risk level
    this.permissionBtnEl.className = "chimera-permission-btn";
    if (mode === PermissionMode.BypassPermissions) {
      this.permissionBtnEl.addClass("mode-bypass");
    } else if (mode === PermissionMode.Plan) {
      this.permissionBtnEl.addClass("mode-plan");
    } else if (mode === PermissionMode.EditAutomatically) {
      this.permissionBtnEl.addClass("mode-auto");
    } else {
      this.permissionBtnEl.addClass("mode-ask");
    }
  }

  /**
   * Rebuilds the permission dropdown options to match the current selection.
   */
  private buildPermissionOptions(): void {
    this.permissionDropdownEl.innerHTML = "";

    const modes = [
      { value: PermissionMode.AskBeforeEdits, icon: "hand", title: "Ask before edits", desc: "Claude will ask for approval before making each edit" },
      { value: PermissionMode.EditAutomatically, icon: "code", title: "Edit automatically", desc: "Claude will edit your selected text or the whole file" },
      { value: PermissionMode.Plan, icon: "clipboard-list", title: "Plan mode", desc: "Claude will explore the code and present a plan before editing" },
      { value: PermissionMode.BypassPermissions, icon: "zap", title: "Bypass permissions", desc: "Claude will not ask for approval before running potentially dangerous commands" },
    ];

    for (const mode of modes) {
      const opt = this.permissionDropdownEl.createDiv({ cls: "chimera-permission-option" });
      if (this.plugin.settings.permissionMode === mode.value) opt.addClass("selected");

      const iconEl = opt.createSpan({ cls: "chimera-permission-option-icon" });
      setIcon(iconEl, mode.icon);

      const textCol = opt.createDiv({ cls: "chimera-permission-option-text" });
      textCol.createDiv({ cls: "chimera-permission-option-title", text: mode.title });
      textCol.createDiv({ cls: "chimera-permission-option-desc", text: mode.desc });

      opt.addEventListener("click", async () => {
        this.plugin.settings.permissionMode = mode.value as PermissionMode;
        await this.plugin.saveSettings();
        this.updatePermissionButton();
        this.buildPermissionOptions();
      });
    }
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

    // Header
    const header = this.historyMenuEl.createDiv({ cls: "chimera-history-header" });
    header.textContent = "CONVERSATIONS";

    if (entries.length === 0) {
      const empty = this.historyMenuEl.createDiv({ cls: "chimera-history-empty" });
      empty.textContent = "No conversations yet";
      return;
    }

    for (const entry of entries.slice(0, 20)) {
      const item = this.historyMenuEl.createDiv({ cls: "chimera-history-item" });

      const iconEl = item.createSpan({ cls: "chimera-history-icon" });
      setIcon(iconEl, "message-square");

      const textCol = item.createDiv({ cls: "chimera-history-text" });
      textCol.createDiv({ cls: "chimera-history-title", text: entry.title || "Untitled" });

      // Format date nicely
      const dateStr = entry.updated ? new Date(entry.updated).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
      textCol.createDiv({ cls: "chimera-history-meta", text: dateStr });

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
    // Reset CLI session ID so the next message starts a fresh CLI session
    this.plugin.sdkWrapper.setSessionId(null);

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
    el.innerHTML = "";
    MarkdownRenderer.render(
      this.app,
      content,
      el,
      "",
      this.renderComponent,
    );
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

    // Show thinking indicator while waiting for first chunk.
    this.showThinkingIndicator();

    let fullResponse = "";
    let mentionFirstChunk = true;
    this.plugin.sdkWrapper.sendMessage(mention.task, systemPrompt, {
      onChunk: (chunk) => {
        if (mentionFirstChunk) {
          mentionFirstChunk = false;
          this.removeThinkingIndicator();
        }
        fullResponse += chunk;
        this.updateStreamingMessage(assistantMsgEl, `[@${mention.agentName}] ${fullResponse}`);
      },
      onComplete: async (completeText) => {
        this.removeThinkingIndicator();
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
        this.removeThinkingIndicator();
        this.isStreaming = false;
        this.updateStreamingMessage(assistantMsgEl, `[@${mention.agentName}] Error: ${error.message}`);
        this.updateStatus("Error occurred");
      },
    });
  }

  // -------------------------------------------------------------------------
  // Private helpers - thinking indicator
  // -------------------------------------------------------------------------

  /**
   * Shows a "Thinking..." indicator in the messages area with an elapsed timer.
   * Removed automatically when the first streaming chunk arrives.
   */
  private showThinkingIndicator(): void {
    this.removeThinkingIndicator();
    this.thinkingStartTime = Date.now();

    this.thinkingIndicatorEl = this.messagesEl.createDiv({ cls: "chimera-thinking-indicator" });
    const textEl = this.thinkingIndicatorEl.createSpan({ cls: "chimera-thinking-indicator-text" });
    textEl.textContent = "Thinking...";
    const timerEl = this.thinkingIndicatorEl.createSpan({ cls: "chimera-thinking-indicator-timer" });
    timerEl.textContent = "(esc to interrupt)";

    // Update timer every second
    this.thinkingTimerInterval = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - this.thinkingStartTime) / 1000);
      timerEl.textContent = `(esc to interrupt - ${elapsed}s)`;
    }, 1000);

    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }

  /**
   * Removes the thinking indicator from the messages area and clears the timer.
   */
  private removeThinkingIndicator(): void {
    if (this.thinkingTimerInterval !== null) {
      clearInterval(this.thinkingTimerInterval);
      this.thinkingTimerInterval = null;
    }
    if (this.thinkingIndicatorEl) {
      this.thinkingIndicatorEl.remove();
      this.thinkingIndicatorEl = null;
    }
  }

  // -------------------------------------------------------------------------
  // Private helpers - slash command autocomplete
  // -------------------------------------------------------------------------

  /**
   * Checks the current input value and shows/hides the slash command
   * autocomplete dropdown based on whether the text starts with `/` and
   * has no spaces (i.e. the user is still typing the command name).
   */
  private handleSlashAutocomplete(): void {
    const text = this.inputEl.value;
    if (text.startsWith("/") && !text.includes(" ")) {
      const query = text.slice(1).toLowerCase();
      const commands = this.plugin.slashCommands.listCommands();
      const filtered = query
        ? commands.filter(c => c.name.toLowerCase().startsWith(query))
        : commands;

      if (filtered.length > 0) {
        this.showSlashDropdown(filtered);
      } else {
        this.hideSlashDropdown();
      }
    } else {
      this.hideSlashDropdown();
    }
  }

  /**
   * Populates and shows the slash command dropdown with the given commands.
   *
   * @param commands - Filtered list of matching slash commands.
   */
  private showSlashDropdown(commands: Array<{name: string; description: string}>): void {
    this.slashDropdownEl.innerHTML = "";
    this.slashSelectedIndex = 0;

    commands.forEach((cmd, i) => {
      const item = this.slashDropdownEl.createDiv({ cls: "chimera-slash-item" });
      if (i === 0) item.addClass("is-selected");
      item.createDiv({ cls: "chimera-slash-item-name", text: `/${cmd.name}` });
      if (cmd.description) {
        item.createDiv({ cls: "chimera-slash-item-desc", text: cmd.description });
      }
      item.addEventListener("click", () => {
        this.inputEl.value = `/${cmd.name} `;
        this.hideSlashDropdown();
        this.inputEl.focus();
      });
    });

    this.slashDropdownEl.addClass("is-visible");
  }

  /**
   * Hides the slash command dropdown and resets selection state.
   */
  private hideSlashDropdown(): void {
    this.slashDropdownEl.removeClass("is-visible");
    this.slashSelectedIndex = -1;
  }

  /**
   * Moves the selection highlight up or down in the slash dropdown.
   *
   * @param direction - `1` for down, `-1` for up.
   */
  private navigateSlashDropdown(direction: number): void {
    const items = this.slashDropdownEl.querySelectorAll(".chimera-slash-item");
    if (items.length === 0) return;

    items[this.slashSelectedIndex]?.removeClass("is-selected");
    this.slashSelectedIndex = (this.slashSelectedIndex + direction + items.length) % items.length;
    items[this.slashSelectedIndex]?.addClass("is-selected");
    items[this.slashSelectedIndex]?.scrollIntoView({ block: "nearest" });
  }

  /**
   * Selects the currently highlighted slash command and fills the input.
   */
  private selectSlashCommand(): void {
    const items = this.slashDropdownEl.querySelectorAll(".chimera-slash-item-name");
    if (this.slashSelectedIndex >= 0 && this.slashSelectedIndex < items.length) {
      const name = items[this.slashSelectedIndex].textContent || "";
      this.inputEl.value = name + " ";
      this.hideSlashDropdown();
      this.inputEl.focus();
    }
  }
}

// ---------------------------------------------------------------------------
// AgentCreationModal
// ---------------------------------------------------------------------------

/**
 * Modal dialog for creating a new agent definition file in `.claude/agents/`.
 */
class AgentCreationModal extends Modal {
  private onSubmit: (name: string, description: string, model: string, systemPrompt: string) => Promise<void>;

  constructor(app: App, onSubmit: (name: string, description: string, model: string, systemPrompt: string) => Promise<void>) {
    super(app);
    this.onSubmit = onSubmit;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: "Create Agent" });

    let name = "";
    let description = "";
    let model = "sonnet";
    let systemPrompt = "";

    new Setting(contentEl)
      .setName("Name")
      .setDesc("Agent identifier (used with @name)")
      .addText(text => {
        text.setPlaceholder("research-agent");
        text.onChange(v => { name = v; });
      });

    new Setting(contentEl)
      .setName("Description")
      .addText(text => {
        text.setPlaceholder("What does this agent do?");
        text.onChange(v => { description = v; });
      });

    new Setting(contentEl)
      .setName("Model")
      .addDropdown(dd => {
        dd.addOption("haiku", "Haiku");
        dd.addOption("sonnet", "Sonnet");
        dd.addOption("opus", "Opus");
        dd.setValue("sonnet");
        dd.onChange(v => { model = v; });
      });

    new Setting(contentEl)
      .setName("System Prompt")
      .setDesc("Instructions for this agent");

    const promptArea = contentEl.createEl("textarea", { cls: "chimera-agent-prompt-input" });
    promptArea.rows = 6;
    promptArea.placeholder = "You are a specialist that...";
    promptArea.addEventListener("input", () => { systemPrompt = promptArea.value; });

    new Setting(contentEl)
      .addButton(btn => {
        btn.setButtonText("Create Agent");
        btn.setCta();
        btn.onClick(async () => {
          const safeName = name.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/^-+|-+$/g, "");
          if (!safeName || !/^[a-z0-9][a-z0-9-]*$/.test(safeName)) {
            new Notice("Agent name must start with a letter/number and contain only letters, numbers, and hyphens");
            return;
          }
          await this.onSubmit(safeName, description.trim(), model, systemPrompt.trim());
          this.close();
        });
      });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
