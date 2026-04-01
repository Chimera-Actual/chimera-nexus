/**
 * @file Runs agent tasks inline with blocking foreground execution.
 *
 * Executes an agent task synchronously from the caller's perspective, blocking
 * until the agent responds, and returns the final output as a string.
 */

// TODO: Not yet implemented -- wire up SdkWrapper with system-prompt injection.

import { AgentDefinition } from "../types";

/**
 * Executes agent tasks in the foreground, blocking until completion.
 */
export class ForegroundRunner {
  /**
   * Runs `agent` against `task` and returns the final text response.
   *
   * @param agent - The agent definition to use.
   * @param task - The task prompt to send to the agent.
   * @returns The agent's complete text response.
   */
  async run(agent: AgentDefinition, task: string): Promise<string> {
    void agent;
    void task;
    throw new Error("Not implemented");
  }
}
