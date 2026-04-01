/**
 * @file Enforces tool restrictions based on agent definitions and permissions.
 *
 * Checks each tool call against the agent's `allowedTools` and `deniedTools`
 * lists before the call is forwarded to the SDK.
 */

// TODO: Not yet implemented -- implement allow/deny list evaluation.

import { AgentDefinition } from "../types";

/**
 * Evaluates whether a given tool is permitted for a specific agent.
 */
export class ToolEnforcer {
  /**
   * Returns `true` if `toolName` is permitted for `agent`.
   *
   * A tool is allowed when:
   * - The `allowedTools` list is empty (allow-all) or contains `toolName`, AND
   * - The `deniedTools` list does not contain `toolName`.
   *
   * @param toolName - The name of the tool being requested.
   * @param agent - The agent definition providing the permission lists.
   * @returns `true` if the tool may be used; `false` otherwise.
   */
  isAllowed(toolName: string, agent: AgentDefinition): boolean {
    void toolName;
    void agent;
    throw new Error("Not implemented");
  }
}
