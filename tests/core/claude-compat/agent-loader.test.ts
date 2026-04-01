/**
 * @file Unit tests for AgentLoader.
 */

import { Vault } from "obsidian";
import { AgentLoader } from "../../../src/core/claude-compat/agent-loader";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeVault(options: {
  exists?: boolean;
  listFiles?: string[];
  readContent?: string | Record<string, string>;
} = {}): Vault {
  const contentMap =
    typeof options.readContent === "object" && options.readContent !== null
      ? options.readContent
      : null;

  const readMock = contentMap
    ? jest.fn().mockImplementation((path: string) => {
        const content = contentMap[path] ?? contentMap[Object.keys(contentMap)[0]] ?? "";
        return Promise.resolve(content);
      })
    : jest.fn().mockResolvedValue(options.readContent ?? "");

  return {
    adapter: {
      exists: jest.fn().mockResolvedValue(options.exists ?? false),
      read: readMock,
      write: jest.fn().mockResolvedValue(undefined),
      mkdir: jest.fn().mockResolvedValue(undefined),
      list: jest
        .fn()
        .mockResolvedValue({ files: options.listFiles ?? [], folders: [] }),
    },
    getFiles: jest.fn().mockReturnValue([]),
    getMarkdownFiles: jest.fn().mockReturnValue([]),
    createFolder: jest.fn(),
    create: jest.fn(),
    modify: jest.fn(),
    read: jest.fn(),
    on: jest.fn(),
  } as unknown as Vault;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AgentLoader", () => {
  // ── 1. Returns empty array when .claude/agents/ doesn't exist ────────────

  describe("when .claude/agents/ does not exist", () => {
    it("returns an empty array", async () => {
      const vault = makeVault({ exists: false });
      const loader = new AgentLoader(vault);

      const agents = await loader.loadAgents();

      expect(agents).toEqual([]);
    });

    it("does not attempt to list or read files", async () => {
      const vault = makeVault({ exists: false });
      const loader = new AgentLoader(vault);

      await loader.loadAgents();

      expect(vault.adapter.list).not.toHaveBeenCalled();
      expect(vault.adapter.read).not.toHaveBeenCalled();
    });
  });

  // ── 2. Loads agent with all frontmatter fields mapped correctly ──────────

  describe("when a fully-specified agent note exists", () => {
    const fullContent = `---
name: my-agent
description: A capable agent
model: claude-opus-4-5
type: orchestrator
allowed_tools:
  - Read
  - Write
denied_tools:
  - Bash
isolation: worktree
memory: user
max_tokens: 8000
timeout_seconds: 600
output_format: vault_note
output_path: output/{{date}}.md
color: "#ff0000"
tags:
  - coding
  - review
---
You are a capable agent. Help with everything.
`;

    it("loads all frontmatter fields", async () => {
      const vault = makeVault({
        exists: true,
        listFiles: [".claude/agents/my-agent.md"],
        readContent: fullContent,
      });
      const loader = new AgentLoader(vault);

      const agents = await loader.loadAgents();

      expect(agents).toHaveLength(1);
      const agent = agents[0];
      expect(agent.name).toBe("my-agent");
      expect(agent.description).toBe("A capable agent");
      expect(agent.model).toBe("claude-opus-4-5");
      expect(agent.type).toBe("orchestrator");
      expect(agent.allowedTools).toEqual(["Read", "Write"]);
      expect(agent.deniedTools).toEqual(["Bash"]);
      expect(agent.isolation).toBe("worktree");
      expect(agent.memory).toBe("user");
      expect(agent.maxTokens).toBe(8000);
      expect(agent.timeoutSeconds).toBe(600);
      expect(agent.outputFormat).toBe("vault_note");
      expect(agent.outputPath).toBe("output/{{date}}.md");
      expect(agent.color).toBe("#ff0000");
      expect(agent.tags).toEqual(["coding", "review"]);
    });
  });

  // ── 3. Snake_case fields map to camelCase ────────────────────────────────

  describe("snake_case to camelCase mapping", () => {
    it("maps allowed_tools to allowedTools", async () => {
      const content = `---
allowed_tools:
  - Read
  - Write
---
Prompt.
`;
      const vault = makeVault({
        exists: true,
        listFiles: [".claude/agents/agent.md"],
        readContent: content,
      });
      const loader = new AgentLoader(vault);

      const agents = await loader.loadAgents();

      expect(agents[0].allowedTools).toEqual(["Read", "Write"]);
    });

    it("maps denied_tools to deniedTools", async () => {
      const content = `---
denied_tools:
  - Bash
---
Prompt.
`;
      const vault = makeVault({
        exists: true,
        listFiles: [".claude/agents/agent.md"],
        readContent: content,
      });
      const loader = new AgentLoader(vault);

      const agents = await loader.loadAgents();

      expect(agents[0].deniedTools).toEqual(["Bash"]);
    });

    it("maps max_tokens to maxTokens", async () => {
      const content = `---
max_tokens: 4096
---
Prompt.
`;
      const vault = makeVault({
        exists: true,
        listFiles: [".claude/agents/agent.md"],
        readContent: content,
      });
      const loader = new AgentLoader(vault);

      const agents = await loader.loadAgents();

      expect(agents[0].maxTokens).toBe(4096);
    });

    it("maps timeout_seconds to timeoutSeconds", async () => {
      const content = `---
timeout_seconds: 120
---
Prompt.
`;
      const vault = makeVault({
        exists: true,
        listFiles: [".claude/agents/agent.md"],
        readContent: content,
      });
      const loader = new AgentLoader(vault);

      const agents = await loader.loadAgents();

      expect(agents[0].timeoutSeconds).toBe(120);
    });

    it("maps output_format to outputFormat", async () => {
      const content = `---
output_format: vault_note
---
Prompt.
`;
      const vault = makeVault({
        exists: true,
        listFiles: [".claude/agents/agent.md"],
        readContent: content,
      });
      const loader = new AgentLoader(vault);

      const agents = await loader.loadAgents();

      expect(agents[0].outputFormat).toBe("vault_note");
    });

    it("maps output_path to outputPath", async () => {
      const content = `---
output_path: notes/output.md
---
Prompt.
`;
      const vault = makeVault({
        exists: true,
        listFiles: [".claude/agents/agent.md"],
        readContent: content,
      });
      const loader = new AgentLoader(vault);

      const agents = await loader.loadAgents();

      expect(agents[0].outputPath).toBe("notes/output.md");
    });
  });

  // ── 4. Body becomes systemPrompt ─────────────────────────────────────────

  describe("body to systemPrompt", () => {
    it("uses the markdown body as systemPrompt", async () => {
      const content = `---
name: agent
---
You are a helpful assistant.
Answer questions concisely.
`;
      const vault = makeVault({
        exists: true,
        listFiles: [".claude/agents/agent.md"],
        readContent: content,
      });
      const loader = new AgentLoader(vault);

      const agents = await loader.loadAgents();

      expect(agents[0].systemPrompt).toBe(
        "You are a helpful assistant.\nAnswer questions concisely."
      );
    });

    it("trims leading/trailing whitespace from systemPrompt", async () => {
      const content = `---
name: agent
---

  You are a helpful assistant.

`;
      const vault = makeVault({
        exists: true,
        listFiles: [".claude/agents/agent.md"],
        readContent: content,
      });
      const loader = new AgentLoader(vault);

      const agents = await loader.loadAgents();

      expect(agents[0].systemPrompt).toBe("You are a helpful assistant.");
    });
  });

  // ── 5. Defaults applied for missing fields ───────────────────────────────

  describe("defaults for missing fields", () => {
    it("defaults model to sonnet", async () => {
      const vault = makeVault({
        exists: true,
        listFiles: [".claude/agents/minimal.md"],
        readContent: "---\nname: minimal\n---\nPrompt.",
      });
      const loader = new AgentLoader(vault);

      const agents = await loader.loadAgents();

      expect(agents[0].model).toBe("sonnet");
    });

    it("defaults type to standard", async () => {
      const vault = makeVault({
        exists: true,
        listFiles: [".claude/agents/minimal.md"],
        readContent: "---\nname: minimal\n---\nPrompt.",
      });
      const loader = new AgentLoader(vault);

      const agents = await loader.loadAgents();

      expect(agents[0].type).toBe("standard");
    });

    it("defaults allowedTools to empty array", async () => {
      const vault = makeVault({
        exists: true,
        listFiles: [".claude/agents/minimal.md"],
        readContent: "---\nname: minimal\n---\nPrompt.",
      });
      const loader = new AgentLoader(vault);

      const agents = await loader.loadAgents();

      expect(agents[0].allowedTools).toEqual([]);
    });

    it("defaults deniedTools to empty array", async () => {
      const vault = makeVault({
        exists: true,
        listFiles: [".claude/agents/minimal.md"],
        readContent: "---\nname: minimal\n---\nPrompt.",
      });
      const loader = new AgentLoader(vault);

      const agents = await loader.loadAgents();

      expect(agents[0].deniedTools).toEqual([]);
    });

    it("defaults isolation to none", async () => {
      const vault = makeVault({
        exists: true,
        listFiles: [".claude/agents/minimal.md"],
        readContent: "---\nname: minimal\n---\nPrompt.",
      });
      const loader = new AgentLoader(vault);

      const agents = await loader.loadAgents();

      expect(agents[0].isolation).toBe("none");
    });

    it("defaults memory to vault", async () => {
      const vault = makeVault({
        exists: true,
        listFiles: [".claude/agents/minimal.md"],
        readContent: "---\nname: minimal\n---\nPrompt.",
      });
      const loader = new AgentLoader(vault);

      const agents = await loader.loadAgents();

      expect(agents[0].memory).toBe("vault");
    });

    it("defaults timeoutSeconds to 300", async () => {
      const vault = makeVault({
        exists: true,
        listFiles: [".claude/agents/minimal.md"],
        readContent: "---\nname: minimal\n---\nPrompt.",
      });
      const loader = new AgentLoader(vault);

      const agents = await loader.loadAgents();

      expect(agents[0].timeoutSeconds).toBe(300);
    });

    it("defaults outputFormat to chat", async () => {
      const vault = makeVault({
        exists: true,
        listFiles: [".claude/agents/minimal.md"],
        readContent: "---\nname: minimal\n---\nPrompt.",
      });
      const loader = new AgentLoader(vault);

      const agents = await loader.loadAgents();

      expect(agents[0].outputFormat).toBe("chat");
    });

    it("derives name from filename when name frontmatter is absent", async () => {
      const vault = makeVault({
        exists: true,
        listFiles: [".claude/agents/my-agent-name.md"],
        readContent: "---\ndescription: no name field\n---\nPrompt.",
      });
      const loader = new AgentLoader(vault);

      const agents = await loader.loadAgents();

      expect(agents[0].name).toBe("my-agent-name");
    });

    it("skips non-.md files", async () => {
      const vault = makeVault({
        exists: true,
        listFiles: [
          ".claude/agents/agent.md",
          ".claude/agents/config.json",
        ],
        readContent: "---\nname: agent\n---\nPrompt.",
      });
      const loader = new AgentLoader(vault);

      const agents = await loader.loadAgents();

      expect(agents).toHaveLength(1);
      expect(agents[0].name).toBe("agent");
    });
  });
});
