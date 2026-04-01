/**
 * @file Unit tests for SessionIndex.
 */

import { Vault } from "obsidian";
import { SessionIndex } from "../../../src/features/sessions/session-index";
import { SessionIndexEntry } from "../../../src/core/types";

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

function makeEntry(overrides?: Partial<SessionIndexEntry>): SessionIndexEntry {
  return {
    sessionId: "sess-001",
    agent: "my-agent",
    title: "Test Session",
    created: "2024-01-01T10:00:00.000Z",
    updated: "2024-01-01T10:05:00.000Z",
    messageCount: 3,
    status: "active",
    path: ".claude/sessions/my-agent/sess-001.md",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SessionIndex", () => {
  let vault: ReturnType<typeof createMockVault>;
  let index: SessionIndex;

  beforeEach(() => {
    vault = createMockVault();
    // Default: list resolves with sessions dir, write succeeds
    (vault.adapter.list as jest.Mock).mockResolvedValue({ files: [], folders: [] });
    (vault.adapter.write as jest.Mock).mockResolvedValue(undefined);

    index = new SessionIndex(vault as unknown as Vault);
  });

  // ── 1. addSession adds entry and saves ───────────────────────────────────

  describe("addSession", () => {
    it("adds the entry to in-memory list", async () => {
      const entry = makeEntry({ sessionId: "new-sess" });
      await index.addSession(entry);

      const entries = index.getEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0].sessionId).toBe("new-sess");
    });

    it("persists (writes) after adding", async () => {
      await index.addSession(makeEntry());
      expect(vault.adapter.write).toHaveBeenCalled();
    });

    it("can add multiple entries", async () => {
      await index.addSession(makeEntry({ sessionId: "s1" }));
      await index.addSession(makeEntry({ sessionId: "s2" }));

      expect(index.getEntries()).toHaveLength(2);
    });

    it("writes to the index.json path", async () => {
      await index.addSession(makeEntry());

      const [writePath] = (vault.adapter.write as jest.Mock).mock.calls[0];
      expect(writePath).toContain("index.json");
    });
  });

  // ── 2. updateSession replaces existing entry ─────────────────────────────

  describe("updateSession", () => {
    it("replaces an existing entry by sessionId", async () => {
      await index.addSession(makeEntry({ sessionId: "s1", title: "Old Title" }));
      await index.updateSession(makeEntry({ sessionId: "s1", title: "New Title" }));

      const entries = index.getEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0].title).toBe("New Title");
    });

    it("appends when no matching sessionId exists", async () => {
      await index.addSession(makeEntry({ sessionId: "s1" }));
      await index.updateSession(makeEntry({ sessionId: "s2" }));

      expect(index.getEntries()).toHaveLength(2);
    });

    it("persists after updating", async () => {
      (vault.adapter.write as jest.Mock).mockClear();
      await index.addSession(makeEntry({ sessionId: "s1" }));
      (vault.adapter.write as jest.Mock).mockClear();

      await index.updateSession(makeEntry({ sessionId: "s1", title: "Updated" }));

      expect(vault.adapter.write).toHaveBeenCalled();
    });
  });

  // ── 3. removeSession removes and saves ───────────────────────────────────

  describe("removeSession", () => {
    it("removes the entry with the matching sessionId", async () => {
      await index.addSession(makeEntry({ sessionId: "s1" }));
      await index.addSession(makeEntry({ sessionId: "s2" }));
      await index.removeSession("s1");

      const entries = index.getEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0].sessionId).toBe("s2");
    });

    it("is a no-op when the sessionId does not exist", async () => {
      await index.addSession(makeEntry({ sessionId: "s1" }));
      await index.removeSession("ghost");

      expect(index.getEntries()).toHaveLength(1);
    });

    it("persists after removing", async () => {
      await index.addSession(makeEntry({ sessionId: "s1" }));
      (vault.adapter.write as jest.Mock).mockClear();

      await index.removeSession("s1");

      expect(vault.adapter.write).toHaveBeenCalled();
    });
  });

  // ── 4. getEntries returns sorted by updated descending ───────────────────

  describe("getEntries - sorting", () => {
    it("returns entries sorted by updated descending (newest first)", async () => {
      await index.addSession(makeEntry({ sessionId: "s1", updated: "2024-01-01T10:00:00.000Z" }));
      await index.addSession(makeEntry({ sessionId: "s2", updated: "2024-01-03T10:00:00.000Z" }));
      await index.addSession(makeEntry({ sessionId: "s3", updated: "2024-01-02T10:00:00.000Z" }));

      const entries = index.getEntries();
      expect(entries[0].sessionId).toBe("s2");
      expect(entries[1].sessionId).toBe("s3");
      expect(entries[2].sessionId).toBe("s1");
    });

    it("returns a copy so mutations do not affect internal state", async () => {
      await index.addSession(makeEntry({ sessionId: "s1" }));
      const entries = index.getEntries();
      entries.pop();

      expect(index.getEntries()).toHaveLength(1);
    });
  });

  // ── 5. getEntries filters by agent when specified ────────────────────────

  describe("getEntries - filtering", () => {
    beforeEach(async () => {
      await index.addSession(makeEntry({ sessionId: "s1", agent: "agent-a", updated: "2024-01-02T00:00:00.000Z" }));
      await index.addSession(makeEntry({ sessionId: "s2", agent: "agent-b", updated: "2024-01-03T00:00:00.000Z" }));
      await index.addSession(makeEntry({ sessionId: "s3", agent: "agent-a", updated: "2024-01-01T00:00:00.000Z" }));
    });

    it("returns all entries when no agent filter is provided", () => {
      expect(index.getEntries()).toHaveLength(3);
    });

    it("returns only entries for the specified agent", () => {
      const entries = index.getEntries("agent-a");
      expect(entries).toHaveLength(2);
      expect(entries.every((e) => e.agent === "agent-a")).toBe(true);
    });

    it("returns empty array when no entries match the agent filter", () => {
      const entries = index.getEntries("agent-c");
      expect(entries).toEqual([]);
    });

    it("filtered results are also sorted by updated descending", () => {
      const entries = index.getEntries("agent-a");
      expect(entries[0].sessionId).toBe("s1");
      expect(entries[1].sessionId).toBe("s3");
    });
  });

  // ── 6. load reads from index.json ────────────────────────────────────────

  describe("load", () => {
    it("populates entries from the JSON file", async () => {
      const entry = makeEntry({ sessionId: "loaded-sess" });
      const json = JSON.stringify({ entries: [entry], lastRebuilt: "2024-01-01T00:00:00.000Z" });
      (vault.adapter.read as jest.Mock).mockResolvedValue(json);

      await index.load();

      const entries = index.getEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0].sessionId).toBe("loaded-sess");
    });

    it("starts with empty entries when file does not exist", async () => {
      (vault.adapter.read as jest.Mock).mockRejectedValue(new Error("not found"));

      await index.load();

      expect(index.getEntries()).toEqual([]);
    });

    it("starts with empty entries when file contains malformed JSON", async () => {
      (vault.adapter.read as jest.Mock).mockResolvedValue("{ not valid");

      await index.load();

      expect(index.getEntries()).toEqual([]);
    });

    it("ignores entries that are missing required fields", async () => {
      const invalidEntry = { sessionId: "bad", agent: "a" }; // missing required fields
      const validEntry = makeEntry({ sessionId: "good" });
      const json = JSON.stringify({ entries: [invalidEntry, validEntry] });
      (vault.adapter.read as jest.Mock).mockResolvedValue(json);

      await index.load();

      const entries = index.getEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0].sessionId).toBe("good");
    });
  });

  // ── 7. rebuildIndex scans session files ──────────────────────────────────

  describe("rebuildIndex", () => {
    it("builds entries from markdown files in sessions dir", async () => {
      const frontmatter = `---
session_id: rebuilt-sess
agent: rebuild-agent
title: Rebuilt
created: 2024-02-01T00:00:00.000Z
updated: 2024-02-01T01:00:00.000Z
message_count: 2
status: completed
---
`;
      (vault.adapter.list as jest.Mock).mockResolvedValue({
        files: [".claude/sessions/rebuilt-sess.md"],
        folders: [],
      });
      (vault.adapter.read as jest.Mock).mockResolvedValue(frontmatter);

      await index.rebuildIndex();

      const entries = index.getEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0].sessionId).toBe("rebuilt-sess");
      expect(entries[0].agent).toBe("rebuild-agent");
    });

    it("skips non-.md files during rebuild", async () => {
      (vault.adapter.list as jest.Mock).mockResolvedValue({
        files: [".claude/sessions/index.json", ".claude/sessions/data.txt"],
        folders: [],
      });

      await index.rebuildIndex();

      expect(index.getEntries()).toHaveLength(0);
    });

    it("handles missing sessions directory gracefully", async () => {
      (vault.adapter.list as jest.Mock).mockRejectedValue(new Error("not found"));

      await expect(index.rebuildIndex()).resolves.not.toThrow();
      expect(index.getEntries()).toEqual([]);
    });

    it("persists after rebuild", async () => {
      (vault.adapter.list as jest.Mock).mockResolvedValue({ files: [], folders: [] });
      (vault.adapter.write as jest.Mock).mockClear();

      await index.rebuildIndex();

      expect(vault.adapter.write).toHaveBeenCalledWith(
        expect.stringContaining("index.json"),
        expect.any(String)
      );
    });

    it("replaces existing in-memory entries on rebuild", async () => {
      // Pre-populate with an entry
      await index.addSession(makeEntry({ sessionId: "old-entry" }));

      // Rebuild returns nothing (empty dir)
      (vault.adapter.list as jest.Mock).mockResolvedValue({ files: [], folders: [] });

      await index.rebuildIndex();

      expect(index.getEntries()).toHaveLength(0);
    });
  });
});
