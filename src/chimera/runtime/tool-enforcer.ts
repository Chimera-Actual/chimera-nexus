/**
 * @file Enforces tool restrictions based on agent definitions and permissions.
 *
 * Checks each tool call against the agent's `allowedTools` and `deniedTools`
 * lists before the call is forwarded to the SDK.
 */

import { AgentDefinition, ResolvedClaudeSettings } from "../types";

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
    // If the tool is explicitly denied, reject immediately.
    if (agent.deniedTools && agent.deniedTools.includes(toolName)) {
      return false;
    }

    // If an allow-list exists and is non-empty, the tool must be present.
    if (agent.allowedTools && agent.allowedTools.length > 0) {
      return agent.allowedTools.includes(toolName);
    }

    // No restrictions -- allow everything.
    return true;
  }

  /**
   * Checks both agent-level and settings-level permissions.
   *
   * @param toolName - The name of the tool being requested.
   * @param agent - The agent definition.
   * @param resolvedSettings - Merged session-level settings.
   * @returns `true` if the tool may be used; `false` otherwise.
   */
  enforcePermissions(
    toolName: string,
    agent: AgentDefinition,
    resolvedSettings: ResolvedClaudeSettings,
  ): boolean {
    // Agent-level check first.
    if (!this.isAllowed(toolName, agent)) {
      return false;
    }

    // Settings-level deny list overrides any agent-level allow.
    if (resolvedSettings.permissions.deny.includes(toolName)) {
      return false;
    }

    return true;
  }

  /**
   * Computes the effective allowed/denied tool lists by merging agent
   * restrictions with settings-level restrictions.
   *
   * @param agent - The agent definition.
   * @param resolvedSettings - Merged session-level settings.
   * @returns An object with `allowed` and `denied` string arrays.
   */
  getEffectiveTools(
    agent: AgentDefinition,
    resolvedSettings: ResolvedClaudeSettings,
  ): { allowed: string[]; denied: string[] } {
    // Merge denied lists (agent + settings), deduplicated.
    const denied = Array.from(
      new Set([...agent.deniedTools, ...resolvedSettings.permissions.deny]),
    );

    // Merge allowed lists. An empty agent allowedTools means "all tools allowed".
    // Settings allow list supplements agent allow list.
    let allowed: string[];
    if (agent.allowedTools.length > 0) {
      // Union of both allow lists, minus denied.
      const combined = Array.from(
        new Set([...agent.allowedTools, ...resolvedSettings.permissions.allow]),
      );
      allowed = combined.filter((t) => !denied.includes(t));
    } else {
      // Agent has no restrictions; settings allow list is advisory only.
      // Represent as the settings allow list (may be empty = unrestricted).
      allowed = resolvedSettings.permissions.allow.filter(
        (t) => !denied.includes(t),
      );
    }

    return { allowed, denied };
  }
}
