/**
 * @file Agent dropdown and session list component for the chat sidebar.
 *
 * Renders an interactive control that lets the user switch between agents and
 * select previous sessions to resume.
 */

// TODO: Not yet implemented -- build dropdown and session list UI.

import { AgentDefinition, SessionIndexEntry } from "../../core/types";

/**
 * Composite UI component combining an agent dropdown with a session list.
 */
export class AgentSelector {
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
   */
  render(): void {
    void this.containerEl;
    void this.onAgentChange;
    void this.onSessionSelect;
    throw new Error("Not implemented");
  }

  /**
   * Replaces the current agent list and refreshes the dropdown.
   *
   * @param agents - Updated list of agent definitions.
   */
  setAgents(agents: AgentDefinition[]): void {
    this.agents = agents;
    throw new Error("Not implemented");
  }

  /**
   * Replaces the current session list and refreshes the session panel.
   *
   * @param sessions - Updated list of session index entries.
   */
  setSessions(sessions: SessionIndexEntry[]): void {
    void sessions;
    throw new Error("Not implemented");
  }
}
