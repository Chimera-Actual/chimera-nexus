/**
 * @file Displays background agent status in the sidebar footer.
 *
 * Manages a footer strip in the chat panel that surfaces real-time status
 * updates for running background agents.
 */

// TODO: Not yet implemented -- build status bar DOM and update logic.

/**
 * Footer component that shows live agent execution status.
 */
export class StatusBar {
  /**
   * @param containerEl - Parent element that hosts the status bar.
   */
  constructor(private readonly containerEl: HTMLElement) {}

  /**
   * Updates the status bar with a plain text message.
   *
   * @param text - Message to display.
   */
  update(text: string): void {
    void this.containerEl;
    void text;
    throw new Error("Not implemented");
  }

  /**
   * Shows a named agent's current execution status.
   *
   * @param agentName - Display name of the agent.
   * @param status - Human-readable status string (e.g. `"running"`, `"done"`).
   */
  showAgentStatus(agentName: string, status: string): void {
    void agentName;
    void status;
    throw new Error("Not implemented");
  }
}
