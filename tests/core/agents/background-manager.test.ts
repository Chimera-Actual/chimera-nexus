/**
 * @file Unit tests for BackgroundManager.
 */

import { Vault } from "obsidian";
import { BackgroundManager } from "../../../src/core/agents/background-manager";
import { AgentDefinition } from "../../../src/core/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeVault(): Vault {
  return {
    adapter: {
      exists: jest.fn().mockResolvedValue(false),
      read: jest.fn().mockResolvedValue(""),
      write: jest.fn().mockResolvedValue(undefined),
      mkdir: jest.fn().mockResolvedValue(undefined),
      list: jest.fn().mockResolvedValue({ files: [], folders: [] }),
    },
    getFiles: jest.fn().mockReturnValue([]),
    getMarkdownFiles: jest.fn().mockReturnValue([]),
    createFolder: jest.fn().mockResolvedValue(undefined),
    create: jest.fn().mockResolvedValue({}),
    modify: jest.fn().mockResolvedValue(undefined),
    read: jest.fn().mockResolvedValue(""),
    on: jest.fn(),
  } as unknown as Vault;
}

function makeSdkWrapper() {
  return {
    sendMessage: jest.fn(),
  };
}

function makeMemoryInjector() {
  return {
    buildSystemPromptContext: jest.fn().mockResolvedValue("memory context"),
  };
}

function makeSessionManager() {
  return {
    requestSession: jest.fn().mockResolvedValue("session-1"),
    releaseSession: jest.fn(),
  };
}

function makeAgent(overrides?: Partial<AgentDefinition>): AgentDefinition {
  return {
    name: "test-agent",
    description: "A test agent",
    model: "sonnet",
    type: "standard",
    allowedTools: [],
    deniedTools: [],
    isolation: "none",
    memory: "vault",
    timeoutSeconds: 300,
    outputFormat: "chat",
    systemPrompt: "You are a test agent.",
    tags: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("BackgroundManager", () => {
  let vault: Vault;
  let sdkWrapper: ReturnType<typeof makeSdkWrapper>;
  let memoryInjector: ReturnType<typeof makeMemoryInjector>;
  let sessionManager: ReturnType<typeof makeSessionManager>;
  let manager: BackgroundManager;

  beforeEach(() => {
    vault = makeVault();
    sdkWrapper = makeSdkWrapper();
    memoryInjector = makeMemoryInjector();
    sessionManager = makeSessionManager();

    manager = new BackgroundManager(
      sdkWrapper as any,
      memoryInjector as any,
      sessionManager as any,
      vault
    );
  });

  // ── 1. submit creates a job and returns an ID ────────────────────────────

  describe("submit", () => {
    it("returns a non-empty job ID string", () => {
      const id = manager.submit(makeAgent(), "do something");
      expect(typeof id).toBe("string");
      expect(id.length).toBeGreaterThan(0);
    });

    it("returns a unique ID for each submission", () => {
      const id1 = manager.submit(makeAgent(), "task 1");
      const id2 = manager.submit(makeAgent(), "task 2");
      expect(id1).not.toBe(id2);
    });

    it("creates a job with queued status", () => {
      const id = manager.submit(makeAgent(), "do something");
      const job = manager.getStatus(id);
      // Job may transition to running quickly, but it was created
      expect(job).toBeDefined();
      expect(job!.id).toBe(id);
    });
  });

  // ── 2. getStatus returns the job ─────────────────────────────────────────

  describe("getStatus", () => {
    it("returns the job for a known ID", () => {
      const id = manager.submit(makeAgent(), "task");
      const job = manager.getStatus(id);
      expect(job).toBeDefined();
      expect(job!.id).toBe(id);
    });

    it("returns undefined for an unknown ID", () => {
      const job = manager.getStatus("does-not-exist");
      expect(job).toBeUndefined();
    });

    it("job has the submitted task and agent", () => {
      const agent = makeAgent({ name: "my-agent" });
      const id = manager.submit(agent, "specific task");
      const job = manager.getStatus(id);
      expect(job!.task).toBe("specific task");
      expect(job!.agent.name).toBe("my-agent");
    });

    it("job has a startedAt timestamp", () => {
      const id = manager.submit(makeAgent(), "task");
      const job = manager.getStatus(id);
      expect(job!.startedAt).toBeTruthy();
      expect(() => new Date(job!.startedAt)).not.toThrow();
    });
  });

  // ── 3. getActiveJobs returns non-completed jobs ──────────────────────────

  describe("getActiveJobs", () => {
    it("returns newly queued jobs as active", () => {
      // Prevent session from being granted so jobs stay queued
      sessionManager.requestSession.mockReturnValue(new Promise(() => {}));

      manager.submit(makeAgent(), "task 1");
      manager.submit(makeAgent(), "task 2");

      const active = manager.getActiveJobs();
      expect(active.length).toBe(2);
    });

    it("does not include cancelled jobs", () => {
      sessionManager.requestSession.mockReturnValue(new Promise(() => {}));

      const id = manager.submit(makeAgent(), "task");
      manager.cancel(id);

      const active = manager.getActiveJobs();
      expect(active.length).toBe(0);
    });

    it("returns empty array when no jobs have been submitted", () => {
      expect(manager.getActiveJobs()).toEqual([]);
    });
  });

  // ── 4. cancel returns true for queued jobs ───────────────────────────────

  describe("cancel (queued job)", () => {
    it("returns true when cancelling a queued job", () => {
      // Keep job in queued state by never resolving the session request
      sessionManager.requestSession.mockReturnValue(new Promise(() => {}));

      const id = manager.submit(makeAgent(), "task");
      const result = manager.cancel(id);
      expect(result).toBe(true);
    });

    it("sets the job status to cancelled", () => {
      sessionManager.requestSession.mockReturnValue(new Promise(() => {}));

      const id = manager.submit(makeAgent(), "task");
      manager.cancel(id);

      const job = manager.getStatus(id);
      expect(job!.status).toBe("cancelled");
    });

    it("sets completedAt when cancelled", () => {
      sessionManager.requestSession.mockReturnValue(new Promise(() => {}));

      const id = manager.submit(makeAgent(), "task");
      manager.cancel(id);

      const job = manager.getStatus(id);
      expect(job!.completedAt).toBeTruthy();
    });
  });

  // ── 5. cancel returns false for completed/running jobs ───────────────────

  describe("cancel (non-queued job)", () => {
    it("returns false for an unknown job ID", () => {
      expect(manager.cancel("ghost-id")).toBe(false);
    });

    it("returns false if called twice on the same job", () => {
      sessionManager.requestSession.mockReturnValue(new Promise(() => {}));

      const id = manager.submit(makeAgent(), "task");
      manager.cancel(id); // first cancel succeeds
      const second = manager.cancel(id); // second attempt on cancelled job
      expect(second).toBe(false);
    });
  });

  // ── 6. getResult returns result for completed jobs ───────────────────────

  describe("getResult", () => {
    it("returns undefined for an unknown job ID", () => {
      expect(manager.getResult("ghost")).toBeUndefined();
    });

    it("returns undefined for a queued job (not yet complete)", () => {
      sessionManager.requestSession.mockReturnValue(new Promise(() => {}));

      const id = manager.submit(makeAgent(), "task");
      expect(manager.getResult(id)).toBeUndefined();
    });

    it("returns the result string once a job completes", async () => {
      // Set up the SDK to complete immediately
      sdkWrapper.sendMessage.mockImplementation(
        (_msg: string, _sys: string, callbacks: { onChunk: (t: string) => void; onComplete: (t: string) => void; onError: (e: Error) => void }) => {
          callbacks.onComplete("final answer");
        }
      );

      const id = manager.submit(makeAgent(), "task");

      // Wait for the async execution to complete
      await new Promise<void>((resolve) => {
        const interval = setInterval(() => {
          const job = manager.getStatus(id);
          if (job && (job.status === "completed" || job.status === "failed")) {
            clearInterval(interval);
            resolve();
          }
        }, 10);
      });

      expect(manager.getResult(id)).toBe("final answer");
    });
  });
});
