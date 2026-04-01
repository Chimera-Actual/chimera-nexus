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

  /** Full list of sessions, unfiltered. */
  private sessions: SessionIndexEntry[] = [];

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
    this.containerEl.innerHTML = "";
    this.selectEl = null;
    this.sessionListEl = null;

    // --- Agent selector area ---
    const selectorArea = document.createElement("div");
    selectorArea.className = "chimera-agent-selector";
    this.containerEl.appendChild(selectorArea);

    const select = document.createElement("select");
    this.selectEl = select;
    selectorArea.appendChild(select);

    // Default option
    const defaultOption = document.createElement("option");
    defaultOption.value = "";
    defaultOption.textContent = "Default Chimera";
    select.appendChild(defaultOption);

    // One option per agent
    for (const agent of this.agents) {
      select.appendChild(this.buildAgentOption(agent));
    }

    select.addEventListener("change", () => {
      const value = select.value;
      this.onAgentChange(value);
      this.filterSessions(value);
    });

    // New Session button
    const newSessionBtn = document.createElement("button");
    newSessionBtn.className = "chimera-new-session-btn";
    newSessionBtn.textContent = "New Session";
    selectorArea.appendChild(newSessionBtn);

    // --- Session list area ---
    const sessionList = document.createElement("div");
    sessionList.className = "chimera-session-list";
    this.containerEl.appendChild(sessionList);
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
      this.selectEl.appendChild(this.buildAgentOption(agent));
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
    this.sessions = sessions;
    this.filterSessions(this.selectEl?.value ?? "");
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

  /**
   * Builds an `<option>` element for a given agent definition.
   *
   * If the agent has a color, a Unicode dot is prepended to the label so there
   * is a visual cue even in a plain `<select>` element (which does not support
   * arbitrary child DOM).
   */
  private buildAgentOption(agent: AgentDefinition): HTMLOptionElement {
    const option = document.createElement("option");
    option.value = agent.name;
    option.title = agent.description;

    if (agent.color) {
      // Prepend a colored dot character. The `<select>` element cannot host
      // arbitrary child elements, so we use the Unicode CIRCLE symbol and
      // encode the color in the data attribute for external CSS to pick up.
      option.textContent = `\u25CF ${agent.name}`;
      option.dataset["color"] = agent.color;
      option.style.color = agent.color;
    } else {
      option.textContent = agent.name;
    }

    return option;
  }

  /**
   * Filters and re-renders the session list to only show sessions belonging to
   * the selected agent. An empty `agentName` means the default (no named agent)
   * and shows only sessions whose `agent` field is also empty.
   *
   * @param agentName - The currently selected agent name, or `""` for default.
   */
  private filterSessions(agentName: string): void {
    const filtered = this.sessions.filter((s) => s.agent === agentName);
    this.renderSessions(filtered);
  }

  /**
   * Renders a (possibly filtered) list of sessions into the session list panel.
   * Shows a placeholder when the list is empty.
   */
  private renderSessions(sessions: SessionIndexEntry[]): void {
    if (!this.sessionListEl) {
      return;
    }

    this.sessionListEl.innerHTML = "";

    if (sessions.length === 0) {
      this.renderSessionPlaceholder();
      return;
    }

    const sorted = [...sessions].sort((a, b) => {
      const timeA = new Date(a.updated || a.created).getTime();
      const timeB = new Date(b.updated || b.created).getTime();
      return timeB - timeA;
    });

    for (const session of sorted) {
      const item = document.createElement("div");
      item.className = "chimera-session-item";

      const title = document.createElement("span");
      title.className = "chimera-session-title";
      title.textContent = session.title || "Untitled Session";
      item.appendChild(title);

      const dateStr = new Date(session.created).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });

      const date = document.createElement("span");
      date.className = "chimera-session-date";
      date.textContent = dateStr;
      item.appendChild(date);

      const count = document.createElement("span");
      count.className = "chimera-session-count";
      count.textContent = `${session.messageCount} msg${session.messageCount === 1 ? "" : "s"}`;
      item.appendChild(count);

      item.addEventListener("click", () => {
        this.onSessionSelect(session.sessionId);
      });

      this.sessionListEl.appendChild(item);
    }
  }

  /** Appends the "No sessions yet" placeholder to the session list element. */
  private renderSessionPlaceholder(): void {
    if (!this.sessionListEl) {
      return;
    }
    const placeholder = document.createElement("div");
    placeholder.className = "chimera-session-placeholder";
    placeholder.textContent = "No sessions yet";
    this.sessionListEl.appendChild(placeholder);
  }
}
