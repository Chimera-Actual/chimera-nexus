/**
 * @file Tests for SessionManager
 */

import { SessionManager } from "../../../src/core/runtime/session-manager";
import { ChimeraSettings, AuthMethod, PermissionMode } from "../../../src/core/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSettings(
  overrides: Partial<ChimeraSettings> = {},
): ChimeraSettings {
  return {
    authMethod: AuthMethod.CLI,
    apiKey: "",
    cliPath: "claude",
    permissionMode: PermissionMode.AskBeforeEdits,
    memoryPinnedBudget: 2000,
    memoryTreeBudget: 500,
    maxConcurrentSessions: 2,
    dreamEnabled: false,
    autoMemory: false,
    userName: "test",
    excludedTags: [],
    model: "sonnet",
    effortLevel: "high",
    conversationalMode: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SessionManager", () => {
  describe("requestSession / createSession", () => {
    it("creates a session immediately when slots are available", async () => {
      const manager = new SessionManager(makeSettings({ maxConcurrentSessions: 2 }));

      const id = await manager.requestSession("atlas", 1);

      expect(typeof id).toBe("string");
      expect(id.length).toBeGreaterThan(0);
      expect(manager.getActiveSessions()).toHaveLength(1);
      expect(manager.getActiveSessions()[0].agent).toBe("atlas");
    });

    it("queues a session when at capacity", async () => {
      const manager = new SessionManager(makeSettings({ maxConcurrentSessions: 1 }));

      // Fill the single slot.
      const id1 = await manager.requestSession("agent-a", 2);
      expect(manager.getActiveSessions()).toHaveLength(1);

      // This should queue, not resolve immediately.
      let resolved = false;
      const pending = manager.requestSession("agent-b", 3).then((id) => {
        resolved = true;
        return id;
      });

      // Yield to micro-task queue — promise should still be pending.
      await Promise.resolve();
      expect(resolved).toBe(false);
      expect(manager.getQueueLength()).toBe(1);

      // Release the first slot so the queued session can start.
      manager.releaseSession(id1);
      const id2 = await pending;

      expect(resolved).toBe(true);
      expect(typeof id2).toBe("string");
    });

    it("createSession is an alias that behaves identically to requestSession", async () => {
      const manager = new SessionManager(makeSettings({ maxConcurrentSessions: 2 }));
      const id = await manager.createSession("atlas", 1);
      expect(typeof id).toBe("string");
      expect(manager.getActiveSessions()).toHaveLength(1);
    });
  });

  describe("releaseSession / endSession", () => {
    it("releases a session and activates the next queued session", async () => {
      const manager = new SessionManager(makeSettings({ maxConcurrentSessions: 1 }));

      const id1 = await manager.requestSession("agent-a", 2);
      const pendingB = manager.requestSession("agent-b", 3);

      expect(manager.getQueueLength()).toBe(1);

      manager.releaseSession(id1);
      const id2 = await pendingB;

      expect(manager.getActiveSessions()).toHaveLength(1);
      expect(manager.getActiveSessions()[0].agent).toBe("agent-b");
      expect(id2).not.toBe(id1);
      expect(manager.getQueueLength()).toBe(0);
    });

    it("endSession is an alias that releases and promotes from queue", async () => {
      const manager = new SessionManager(makeSettings({ maxConcurrentSessions: 1 }));

      const id1 = await manager.requestSession("agent-a", 1);
      const pendingB = manager.requestSession("agent-b", 2);

      await manager.endSession(id1);
      await pendingB;

      expect(manager.getActiveSessions()).toHaveLength(1);
      expect(manager.getActiveSessions()[0].agent).toBe("agent-b");
    });
  });

  describe("priority ordering", () => {
    it("activates higher-priority queued sessions first", async () => {
      const manager = new SessionManager(makeSettings({ maxConcurrentSessions: 1 }));

      // Fill the slot.
      const id1 = await manager.requestSession("agent-a", 3);

      // Queue two sessions with different priorities (lower number = higher priority).
      const activationOrder: string[] = [];
      const pendingHigh = manager.requestSession("high-priority", 1).then((id) => {
        activationOrder.push("high-priority");
        return id;
      });
      const pendingLow = manager.requestSession("low-priority", 5).then((id) => {
        activationOrder.push("low-priority");
        return id;
      });

      expect(manager.getQueueLength()).toBe(2);

      // Release once — should activate the highest-priority queued session.
      manager.releaseSession(id1);
      const highId = await pendingHigh;

      expect(activationOrder).toEqual(["high-priority"]);
      expect(manager.getActiveSessions()[0].agent).toBe("high-priority");

      // Release again — should activate the lower-priority session.
      manager.releaseSession(highId);
      await pendingLow;

      expect(activationOrder).toEqual(["high-priority", "low-priority"]);
    });
  });

  describe("getActiveSessions", () => {
    it("returns correct count and metadata for active sessions", async () => {
      const manager = new SessionManager(makeSettings({ maxConcurrentSessions: 3 }));

      await manager.requestSession("agent-x", 1);
      await manager.requestSession("agent-y", 2);

      const sessions = manager.getActiveSessions();
      expect(sessions).toHaveLength(2);

      const agents = sessions.map((s) => s.agent);
      expect(agents).toContain("agent-x");
      expect(agents).toContain("agent-y");

      // Each session should have required fields.
      for (const s of sessions) {
        expect(typeof s.id).toBe("string");
        expect(typeof s.agent).toBe("string");
        expect(typeof s.priority).toBe("number");
        expect(typeof s.startedAt).toBe("string");
      }
    });
  });

  describe("isSlotAvailable", () => {
    it("returns true when below capacity", async () => {
      const manager = new SessionManager(makeSettings({ maxConcurrentSessions: 2 }));
      expect(manager.isSlotAvailable(1)).toBe(true);

      await manager.requestSession("agent-a", 1);
      expect(manager.isSlotAvailable(1)).toBe(true);
    });

    it("returns false when at capacity", async () => {
      const manager = new SessionManager(makeSettings({ maxConcurrentSessions: 1 }));
      await manager.requestSession("agent-a", 1);
      expect(manager.isSlotAvailable(1)).toBe(false);
    });

    it("returns true again after a session is released", async () => {
      const manager = new SessionManager(makeSettings({ maxConcurrentSessions: 1 }));
      const id = await manager.requestSession("agent-a", 1);

      expect(manager.isSlotAvailable(1)).toBe(false);

      manager.releaseSession(id);
      expect(manager.isSlotAvailable(1)).toBe(true);
    });
  });

  describe("getQueueLength", () => {
    it("returns 0 when nothing is queued", async () => {
      const manager = new SessionManager(makeSettings({ maxConcurrentSessions: 2 }));
      await manager.requestSession("agent-a", 1);
      expect(manager.getQueueLength()).toBe(0);
    });

    it("increments as sessions are queued", async () => {
      const manager = new SessionManager(makeSettings({ maxConcurrentSessions: 1 }));
      const id1 = await manager.requestSession("agent-a", 1);

      // These queue up — don't await them.
      manager.requestSession("agent-b", 2);
      manager.requestSession("agent-c", 3);

      expect(manager.getQueueLength()).toBe(2);

      // Release once — one queued session activates.
      manager.releaseSession(id1);
      // Yield to let promises settle.
      await Promise.resolve();

      expect(manager.getQueueLength()).toBe(1);
    });
  });
});
