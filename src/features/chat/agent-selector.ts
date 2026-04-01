/**
 * @file Agent dropdown and session list component for the chat sidebar.
 *
 * Renders an interactive control that lets the user switch between agents and
 * select previous sessions to resume.
 */

import { AgentDefinition, SessionIndexEntry } from "../../core/types";

/**
 * Composite UI component combining an agent dropdown with a session list.
 *
 * Renders into a host element and manages its own DOM subtree. Call
 * {@link render} once to build the initial structure, then use
 * {@link setAgents} and {@link setSessions} to update the content reactively.
 */
export class AgentSelector {
  /** The `<select>` element for agent choice. */
  private selectEl: HTMLSelectElement | null = null;

  /** Container element for the session list. */
  private sessionListEl: HTMLElement | null = null;

  /**
   * @param containerEl - Root element to render the selector into.
   * @param agents - Initial list of available agents.
   * @param onAgentChange - Callback fired when the user picks a different agent.
   * @param onSessionSelect - Callback fired when the user selects a session.
   */
  constructor(
    private readonly containerEl: HTMLElement,
    private agents: AgentDefinition[],
    private readonly onAgentChange: (agent: string) => void,
    private readonly onSessionSelect: (sessionId: string) => void
  ) {}

  /**
   * Renders (or re-renders) the full component into {@link containerEl}.
   *
   * Creates the agent dropdown and an empty session list panel. Safe to call
   * multiple times - the container is cleared on each invocation.
   */
  render(): void {
    this.containerEl.empty();
    this.selectEl = null;
    this.sessionListEl = null;

    // --- Agent selector area ---
    const selectorArea = this.containerEl.createEl("div", {
      cls: "chimera-agent-selector",
    });

    const select = selectorArea.createEl("select");
    this.selectEl = select;

    // Default option
    const defaultOption = select.createEl("option");
    defaultOption.value = "";
    defaultOption.textContent = "Default Chimera";

    // One option per agent
    for (const agent of this.agents) {
      const option = select.createEl("option");
      option.value = agent.name;
      option.textContent = agent.name;
      option.title = agent.description;
    }

    select.addEventListener("change", () => {
      this.onAgentChange(select.value);
    });

    // --- Session list area ---
    const sessionList = this.containerEl.createEl("div", {
      cls: "chimera-session-list",
    });
    this.sessionListEl = sessionList;

    this.renderSessionPlaceholder();
  }

  /**
   * Replaces the current agent list and refreshes the dropdown options.
   *
   * Preserves the current selection if the selected agent name still exists
   * in the updated list; otherwise falls back to the default.
   *
   * @param agents - Updated list of agent definitions.
   */
  setAgents(agents: AgentDefinition[]): void {
    this.agents = agents;

    if (!this.selectEl) {
      return;
    }

    const previousValue = this.selectEl.value;

    // Remove all options except the first (default)
    while (this.selectEl.options.length > 1) {
      this.selectEl.remove(1);
    }

    for (const agent of this.agents) {
      const option = this.selectEl.createEl("option");
      option.value = agent.name;
      option.textContent = agent.name;
      option.title = agent.description;
    }

    // Restore previous selection if still valid
    const stillValid = this.agents.some((a) => a.name === previousValue);
    this.selectEl.value = stillValid ? previousValue : "";
  }

  /**
   * Replaces the session list panel with an updated set of sessions.
   *
   * Sessions are displayed sorted by `updated` descending (most recent first).
   * If the list is empty, a placeholder message is shown instead.
   *
   * @param sessions - Updated list of session index entries.
   */
  setSessions(sessions: SessionIndexEntry[]): void {
    if (!this.sessionListEl) {
      return;
    }

    this.sessionListEl.empty();

    if (sessions.length === 0) {
      this.renderSessionPlaceholder();
      return;
    }

    const sorted = [...sessions].sort(
      (a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime()
    );

    for (const session of sorted) {
      const item = this.sessionListEl.createEl("div", {
        cls: "chimera-session-item",
      });

      const dateStr = new Date(session.updated).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });

      item.createEl("span", { cls: "chimera-session-title", text: session.title });
      item.createEl("span", { cls: "chimera-session-date", text: dateStr });

      item.addEventListener("click", () => {
        this.onSessionSelect(session.sessionId);
      });
    }
  }

  /**
   * Returns the currently selected agent name.
   *
   * An empty string means the default Chimera agent is selected.
   *
   * @returns The selected agent name, or `""` for the default.
   */
  getSelectedAgent(): string {
    return this.selectEl?.value ?? "";
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /** Appends the "No sessions yet" placeholder to the session list element. */
  private renderSessionPlaceholder(): void {
    if (!this.sessionListEl) {
      return;
    }
    this.sessionListEl.createEl("div", {
      cls: "chimera-session-placeholder",
      text: "No sessions yet",
    });
  }
}
