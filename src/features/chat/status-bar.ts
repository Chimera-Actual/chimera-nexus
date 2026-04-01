/**
 * @file Displays background agent status in the sidebar footer.
 *
 * Manages a footer strip in the chat panel that surfaces real-time status
 * updates for running background agents.
 */

/**
 * Footer component that shows live agent execution status.
 */
export class StatusBar {
  /** The inner span used to display agent status information. */
  private agentSpan: HTMLSpanElement | null = null;

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
    this.removeAgentSpan();
    this.containerEl.textContent = text;
  }

  /**
   * Shows a named agent's current execution status with optional elapsed time.
   *
   * @param agentName - Display name of the agent.
   * @param status - Execution status: "running", "completed", "failed", or "queued".
   * @param elapsed - Optional elapsed time string to append to the status label.
   */
  showAgentStatus(agentName: string, status: string, elapsed?: string): void {
    this.containerEl.textContent = "";

    const span = this.containerEl.createSpan({
      cls: `chimera-status-agent is-${status}`,
    });

    const label = elapsed
      ? `@${agentName} (${status}, ${elapsed})`
      : `@${agentName} (${status})`;

    span.textContent = label;

    this.agentSpan = span;
  }

  /**
   * Shows the combined status of multiple background agents.
   *
   * Agents still running or queued are listed individually; completed agents
   * are summarised as a count to keep the bar compact.
   *
   * @param agents - Array of agent name/status pairs to render.
   */
  showMultipleAgents(agents: Array<{ name: string; status: string }>): void {
    this.containerEl.textContent = "";
    this.agentSpan = null;

    const active = agents.filter((a) => a.status !== "completed");
    const completedCount = agents.filter(
      (a) => a.status === "completed"
    ).length;

    const parts: Array<HTMLSpanElement | Text> = [];

    for (const agent of active) {
      const span = document.createElement("span");
      span.className = `chimera-status-agent is-${agent.status}`;
      span.textContent = `@${agent.name} (${agent.status})`;
      parts.push(span);
    }

    if (completedCount > 0) {
      const span = document.createElement("span");
      span.className = "chimera-status-agent is-completed";
      span.textContent = `${completedCount} completed`;
      parts.push(span);
    }

    for (let i = 0; i < parts.length; i++) {
      this.containerEl.appendChild(parts[i]);
      if (i < parts.length - 1) {
        this.containerEl.appendChild(document.createTextNode(" | "));
      }
    }
  }

  /**
   * Resets the status bar to its default "Ready" message.
   */
  clear(): void {
    this.removeAgentSpan();
    this.containerEl.textContent = "Ready";
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /** Removes the cached agent span reference without clearing container text. */
  private removeAgentSpan(): void {
    this.agentSpan = null;
  }
}
