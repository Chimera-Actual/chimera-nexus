/**
 * @file Unit tests for SessionStore.
 */

import { Vault } from "obsidian";
import { SessionStore } from "../../../src/features/sessions/session-store";
import { Session } from "../../../src/core/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const createMockVault = () =>
  ({
    adapter: {
      exists: jest.fn(),
      read: jest.fn(),
      write: jest.fn(),
      list: jest.fn(),
      mkdir: jest.fn(),
    },
    getFiles: jest.fn().mockReturnValue([]),
    getMarkdownFiles: jest.fn().mockReturnValue([]),
    createFolder: jest.fn(),
    create: jest.fn(),
    modify: jest.fn(),
    read: jest.fn(),
    on: jest.fn(),
  } as unknown as Vault);

function makeSession(overrides?: Partial<Session>): Session {
  return {
    sessionId: "sess-001",
    agent: "my-agent",
    title: "Test Session",
    created: "2024-01-01T10:00:00.000Z",
    updated: "2024-01-01T10:05:00.000Z",
    model: "claude-opus-4-5",
    tokensUsed: 500,
    messageCount: 2,
    status: "active",
    outputFiles: [],
    tags: [],
    messages: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SessionStore", () => {
  let vault: ReturnType<typeof createMockVault>;
  let store: SessionStore;

  beforeEach(() => {
    vault = createMockVault();
    store = new SessionStore(vault as unknown as Vault);
  });

  // ── 1. renderTranscript produces correct markdown with frontmatter ───────

  describe("renderTranscript", () => {
    it("produces a string starting with --- (frontmatter fence)", () => {
      const session = makeSession();
      const result = store.renderTranscript(session);
      expect(result).toMatch(/^---\n/);
    });

    it("includes the session_id in frontmatter", () => {
      const session = makeSession({ sessionId: "abc-123" });
      const result = store.renderTranscript(session);
      expect(result).toContain("session_id: abc-123");
    });

    it("includes the agent name in frontmatter", () => {
      const session = makeSession({ agent: "my-agent" });
      const result = store.renderTranscript(session);
      expect(result).toContain("agent: my-agent");
    });

    it("includes the title in frontmatter", () => {
      const session = makeSession({ title: "My Great Session" });
      const result = store.renderTranscript(session);
      expect(result).toContain("title:");
      expect(result).toContain("My Great Session");
    });

    it("includes the model in frontmatter", () => {
      const session = makeSession({ model: "claude-sonnet-4" });
      const result = store.renderTranscript(session);
      expect(result).toContain("model: claude-sonnet-4");
    });

    it("includes tokens_used in frontmatter", () => {
      const session = makeSession({ tokensUsed: 1234 });
      const result = store.renderTranscript(session);
      expect(result).toContain("tokens_used: 1234");
    });

    it("includes the # title heading in the body", () => {
      const session = makeSession({ title: "Test Session" });
      const result = store.renderTranscript(session);
      expect(result).toContain("# Test Session");
    });

    it("renders user messages with ## User heading", () => {
      const session = makeSession({
        messages: [
          {
            role: "user",
            content: "Hello there",
            timestamp: "2024-01-01T10:01:00.000Z",
          },
        ],
      });
      const result = store.renderTranscript(session);
      expect(result).toMatch(/## User \(.+\)/);
      expect(result).toContain("Hello there");
    });

    it("renders assistant messages with ## Assistant heading", () => {
      const session = makeSession({
        messages: [
          {
            role: "assistant",
            content: "Hello back",
            timestamp: "2024-01-01T10:02:00.000Z",
          },
        ],
      });
      const result = store.renderTranscript(session);
      expect(result).toMatch(/## Assistant \(.+\)/);
      expect(result).toContain("Hello back");
    });

    it("renders multiple messages in order", () => {
      const session = makeSession({
        messages: [
          { role: "user", content: "First", timestamp: "2024-01-01T10:00:00.000Z" },
          { role: "assistant", content: "Second", timestamp: "2024-01-01T10:01:00.000Z" },
        ],
      });
      const result = store.renderTranscript(session);
      const firstPos = result.indexOf("First");
      const secondPos = result.indexOf("Second");
      expect(firstPos).toBeLessThan(secondPos);
    });

    it("uses default agent when agent is empty", () => {
      const session = makeSession({ agent: "" });
      const result = store.renderTranscript(session);
      expect(result).toContain("agent: default");
    });
  });

  // ── 2. parseTranscript extracts messages from markdown sections ──────────

  describe("parseTranscript", () => {
    it("returns empty array for body with no headings", () => {
      const messages = store.parseTranscript("# Session Title\n\nSome intro text.");
      expect(messages).toEqual([]);
    });

    it("parses a single user message", () => {
      const body = `# My Session

## User (10:00 AM)
Hello!
`;
      const messages = store.parseTranscript(body);
      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe("user");
      expect(messages[0].content).toBe("Hello!");
    });

    it("parses a single assistant message", () => {
      const body = `# My Session

## Assistant (10:01 AM)
Hi there!
`;
      const messages = store.parseTranscript(body);
      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe("assistant");
      expect(messages[0].content).toBe("Hi there!");
    });

    it("parses multiple messages preserving order", () => {
      const body = `# My Session

## User (10:00 AM)
First message.

## Assistant (10:01 AM)
Second message.

## User (10:02 AM)
Third message.
`;
      const messages = store.parseTranscript(body);
      expect(messages).toHaveLength(3);
      expect(messages[0].role).toBe("user");
      expect(messages[1].role).toBe("assistant");
      expect(messages[2].role).toBe("user");
    });

    it("stores the time label as timestamp", () => {
      const body = `## User (4:32 PM)\nHello\n`;
      const messages = store.parseTranscript(body);
      expect(messages[0].timestamp).toBe("4:32 PM");
    });

    it("preserves multi-line message content", () => {
      const body = `## User (1:00 PM)\nLine one\nLine two\nLine three\n`;
      const messages = store.parseTranscript(body);
      expect(messages[0].content).toContain("Line one");
      expect(messages[0].content).toContain("Line two");
      expect(messages[0].content).toContain("Line three");
    });
  });

  // ── 3. saveSession writes to correct path ───────────────────────────────

  describe("saveSession", () => {
    beforeEach(() => {
      (vault.adapter.exists as jest.Mock).mockResolvedValue(true);
      (vault.adapter.write as jest.Mock).mockResolvedValue(undefined);
    });

    it("writes to .claude/sessions/{agent}/{sessionId}.md", async () => {
      const session = makeSession({ agent: "my-agent", sessionId: "sess-001" });
      await store.saveSession(session);

      expect(vault.adapter.write).toHaveBeenCalledWith(
        expect.stringContaining("sess-001.md"),
        expect.any(String)
      );
    });

    it("includes the agent folder in the path", async () => {
      const session = makeSession({ agent: "my-agent", sessionId: "sess-001" });
      await store.saveSession(session);

      const [writePath] = (vault.adapter.write as jest.Mock).mock.calls[0];
      expect(writePath).toContain("my-agent");
    });

    it("creates the agent folder when it does not exist", async () => {
      (vault.adapter.exists as jest.Mock).mockResolvedValue(false);
      const session = makeSession({ agent: "new-agent", sessionId: "s1" });
      await store.saveSession(session);

      expect(vault.createFolder).toHaveBeenCalled();
    });

    it("does not create folder when it already exists", async () => {
      (vault.adapter.exists as jest.Mock).mockResolvedValue(true);
      const session = makeSession({ agent: "existing-agent", sessionId: "s1" });
      await store.saveSession(session);

      expect(vault.createFolder).not.toHaveBeenCalled();
    });

    it("writes content that includes the session ID in frontmatter", async () => {
      const session = makeSession({ sessionId: "my-session-id" });
      await store.saveSession(session);

      const [, content] = (vault.adapter.write as jest.Mock).mock.calls[0];
      expect(content).toContain("my-session-id");
    });

    it("uses default agent folder when agent is empty", async () => {
      const session = makeSession({ agent: "" });
      await store.saveSession(session);

      const [writePath] = (vault.adapter.write as jest.Mock).mock.calls[0];
      expect(writePath).toContain("default");
    });
  });

  // ── 4. loadSession reads and parses correctly ────────────────────────────

  describe("loadSession", () => {
    it("reads from the provided path", async () => {
      const raw = `---
session_id: sess-abc
agent: test-agent
title: My Session
created: 2024-01-01T00:00:00.000Z
updated: 2024-01-01T01:00:00.000Z
model: claude-opus-4-5
tokens_used: 100
message_count: 1
status: active
output_files: []
tags: []
---
# My Session
`;
      (vault.adapter.read as jest.Mock).mockResolvedValue(raw);

      const session = await store.loadSession(".claude/sessions/test-agent/sess-abc.md");

      expect(vault.adapter.read).toHaveBeenCalledWith(
        expect.stringContaining("sess-abc.md")
      );
      expect(session.sessionId).toBe("sess-abc");
    });

    it("correctly parses frontmatter fields", async () => {
      const raw = `---
session_id: s1
agent: coder
title: Code Review
created: 2024-06-01T09:00:00.000Z
updated: 2024-06-01T10:00:00.000Z
model: sonnet
tokens_used: 750
message_count: 4
status: completed
output_files: []
tags: []
---
# Code Review
`;
      (vault.adapter.read as jest.Mock).mockResolvedValue(raw);

      const session = await store.loadSession(".claude/sessions/coder/s1.md");

      expect(session.agent).toBe("coder");
      expect(session.title).toBe("Code Review");
      expect(session.model).toBe("sonnet");
      expect(session.tokensUsed).toBe(750);
      expect(session.messageCount).toBe(4);
      expect(session.status).toBe("completed");
    });

    it("parses messages from the body", async () => {
      const raw = `---
session_id: s2
agent: assistant
title: Chat
created: 2024-01-01T00:00:00.000Z
updated: 2024-01-01T01:00:00.000Z
model: sonnet
tokens_used: 100
message_count: 2
status: active
output_files: []
tags: []
---
# Chat

## User (10:00 AM)
Hello!

## Assistant (10:01 AM)
Hi there!
`;
      (vault.adapter.read as jest.Mock).mockResolvedValue(raw);

      const session = await store.loadSession(".claude/sessions/assistant/s2.md");

      expect(session.messages).toHaveLength(2);
      expect(session.messages[0].role).toBe("user");
      expect(session.messages[0].content).toBe("Hello!");
      expect(session.messages[1].role).toBe("assistant");
      expect(session.messages[1].content).toBe("Hi there!");
    });

    it("defaults status to active for unrecognised status values", async () => {
      const raw = `---
session_id: s3
agent: a
title: t
created: 2024-01-01T00:00:00.000Z
updated: 2024-01-01T00:00:00.000Z
model: sonnet
tokens_used: 0
message_count: 0
status: unknown-status
output_files: []
tags: []
---
# t
`;
      (vault.adapter.read as jest.Mock).mockResolvedValue(raw);

      const session = await store.loadSession("path.md");

      expect(session.status).toBe("active");
    });
  });
});
