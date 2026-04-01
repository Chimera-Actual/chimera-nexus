/**
 * @file Tests for ToolEnforcer
 */

import { ToolEnforcer } from "../../../src/core/runtime/tool-enforcer";
import { AgentDefinition, ResolvedClaudeSettings } from "../../../src/core/types";
import {
  AuthMethod,
  MemoryTier,
  PermissionMode,
} from "../../../src/core/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAgent(
  overrides: Partial<AgentDefinition> = {},
): AgentDefinition {
  return {
    name: "test-agent",
    description: "A test agent",
    model: "claude-opus-4-5",
    type: "standard",
    allowedTools: [],
    deniedTools: [],
    isolation: "none",
    memory: "none",
    timeoutSeconds: 60,
    outputFormat: "chat",
    systemPrompt: "You are a test agent.",
    tags: [],
    ...overrides,
  };
}

function makeSettings(
  overrides: Partial<ResolvedClaudeSettings> = {},
): ResolvedClaudeSettings {
  return {
    permissions: {
      allow: [],
      deny: [],
      ask: [],
    },
    hooks: [],
    env: {},
    mcpServers: {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// isAllowed tests
// ---------------------------------------------------------------------------

describe("ToolEnforcer.isAllowed", () => {
  const enforcer = new ToolEnforcer();

  it("returns true when the agent has no tool restrictions", () => {
    const agent = makeAgent();
    expect(enforcer.isAllowed("Bash", agent)).toBe(true);
    expect(enforcer.isAllowed("Read", agent)).toBe(true);
  });

  it("returns false when tool is in deniedTools", () => {
    const agent = makeAgent({ deniedTools: ["Bash", "Write"] });
    expect(enforcer.isAllowed("Bash", agent)).toBe(false);
    expect(enforcer.isAllowed("Write", agent)).toBe(false);
  });

  it("returns true when tool is in allowedTools (non-empty list)", () => {
    const agent = makeAgent({ allowedTools: ["Read", "Grep"] });
    expect(enforcer.isAllowed("Read", agent)).toBe(true);
    expect(enforcer.isAllowed("Grep", agent)).toBe(true);
  });

  it("returns false when tool is NOT in allowedTools and allowedTools is non-empty", () => {
    const agent = makeAgent({ allowedTools: ["Read"] });
    expect(enforcer.isAllowed("Bash", agent)).toBe(false);
    expect(enforcer.isAllowed("Write", agent)).toBe(false);
  });

  it("deniedTools takes precedence over allowedTools for the same tool", () => {
    const agent = makeAgent({
      allowedTools: ["Bash"],
      deniedTools: ["Bash"],
    });
    expect(enforcer.isAllowed("Bash", agent)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// enforcePermissions tests
// ---------------------------------------------------------------------------

describe("ToolEnforcer.enforcePermissions", () => {
  const enforcer = new ToolEnforcer();

  it("returns true when agent and settings both permit the tool", () => {
    const agent = makeAgent();
    const settings = makeSettings();
    expect(enforcer.enforcePermissions("Bash", agent, settings)).toBe(true);
  });

  it("returns false when agent denies the tool", () => {
    const agent = makeAgent({ deniedTools: ["Bash"] });
    const settings = makeSettings();
    expect(enforcer.enforcePermissions("Bash", agent, settings)).toBe(false);
  });

  it("settings deny overrides agent allow", () => {
    // Agent explicitly allows Bash, but settings deny it.
    const agent = makeAgent({ allowedTools: ["Bash"] });
    const settings = makeSettings({
      permissions: { allow: ["Bash"], deny: ["Bash"], ask: [] },
    });
    expect(enforcer.enforcePermissions("Bash", agent, settings)).toBe(false);
  });

  it("returns false when tool is in settings deny list even with no agent restrictions", () => {
    const agent = makeAgent();
    const settings = makeSettings({
      permissions: { allow: [], deny: ["DangerousTool"], ask: [] },
    });
    expect(enforcer.enforcePermissions("DangerousTool", agent, settings)).toBe(
      false,
    );
  });
});

// ---------------------------------------------------------------------------
// getEffectiveTools tests
// ---------------------------------------------------------------------------

describe("ToolEnforcer.getEffectiveTools", () => {
  const enforcer = new ToolEnforcer();

  it("returns empty allowed and empty denied when there are no restrictions", () => {
    const agent = makeAgent();
    const settings = makeSettings();
    const result = enforcer.getEffectiveTools(agent, settings);
    expect(result.allowed).toEqual([]);
    expect(result.denied).toEqual([]);
  });

  it("merges agent and settings denied lists without duplicates", () => {
    const agent = makeAgent({ deniedTools: ["Bash", "Write"] });
    const settings = makeSettings({
      permissions: { allow: [], deny: ["Write", "Eval"], ask: [] },
    });
    const result = enforcer.getEffectiveTools(agent, settings);
    expect(result.denied).toEqual(
      expect.arrayContaining(["Bash", "Write", "Eval"]),
    );
    expect(result.denied).toHaveLength(3);
  });

  it("merges agent and settings allowed lists when agent has an allowedTools list", () => {
    const agent = makeAgent({ allowedTools: ["Read", "Grep"] });
    const settings = makeSettings({
      permissions: { allow: ["Glob"], deny: [], ask: [] },
    });
    const result = enforcer.getEffectiveTools(agent, settings);
    expect(result.allowed).toEqual(
      expect.arrayContaining(["Read", "Grep", "Glob"]),
    );
    expect(result.denied).toEqual([]);
  });

  it("excludes tools from allowed when they appear in the merged denied list", () => {
    const agent = makeAgent({ allowedTools: ["Read", "Bash"] });
    const settings = makeSettings({
      permissions: { allow: [], deny: ["Bash"], ask: [] },
    });
    const result = enforcer.getEffectiveTools(agent, settings);
    expect(result.allowed).toContain("Read");
    expect(result.allowed).not.toContain("Bash");
    expect(result.denied).toContain("Bash");
  });

  it("returns settings allow list as allowed when agent has no allowedTools restriction", () => {
    const agent = makeAgent(); // allowedTools: []
    const settings = makeSettings({
      permissions: { allow: ["Read", "Glob"], deny: ["Bash"], ask: [] },
    });
    const result = enforcer.getEffectiveTools(agent, settings);
    // Agent unrestricted — allowed list is just the settings advisory list.
    expect(result.allowed).toEqual(expect.arrayContaining(["Read", "Glob"]));
    expect(result.allowed).not.toContain("Bash");
    expect(result.denied).toContain("Bash");
  });
});
