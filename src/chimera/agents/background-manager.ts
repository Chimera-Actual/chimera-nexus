/**
 * @file Non-blocking background agent execution pool.
 *
 * Submits agent tasks to a background worker pool, tracks their execution
 * status, and allows queued tasks to be cancelled.
 *
 * Ported from chimera-nexus v1. Concrete SdkWrapper, MemoryInjector, and
 * SessionManager dependencies are replaced with injected interfaces so this
 * module is self-contained within src/chimera/. Wire up real implementations
 * via the bridge layer.
 */

import { Vault, normalizePath } from "obsidian";
import { AgentDefinition } from "../types";

// ---------------------------------------------------------------------------
// Bridge interfaces (injected -- no concrete imports from outside chimera/)
// ---------------------------------------------------------------------------

/**
 * Minimal interface for sending a prompt to the language model.
 * Fulfilled by SdkWrapper from the bridge layer.
 */
export interface AgentExecutor {
  sendMessage(
    prompt: string,
    systemPrompt: string,
    callbacks: {
      onChunk: (text: string) => void;
      onComplete: (fullText: string) => void;
      onError: (error: Error) => void;
    }
  ): void;
  abort(): void;
}

/**
 * Minimal interface for building a memory-enriched system prompt.
 * Fulfilled by MemoryInjector from the bridge layer.
 */
export interface MemoryContextBuilder {
  buildSystemPromptContext(): Promise<string>;
}

/**
 * Minimal interface for acquiring and releasing concurrency slots.
 * Fulfilled by SessionManager from the bridge layer.
 */
export interface SessionSlotManager {
  requestSession(name: string, priority: number): Promise<string>;
  releaseSession(sessionId: string): void;
}

/**
 * Minimal interface for resolving {{variable}} templates in strings.
 * Fulfilled by resolveTemplate from the bridge layer.
 */
export interface TemplateResolver {
  resolve(template: string): string;
}

/**
 * Minimal interface for loading agent definitions from the vault.
 * Fulfilled by AgentLoader from the bridge layer.
 */
export interface AgentRegistry {
  loadAgents(): Promise<AgentDefinition[]>;
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

/** Lifecycle status of a background job. */
type JobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

/** Represents a single background agent execution. */
interface BackgroundJob {
  /** Unique job identifier (UUID). */
  id: string;
  /** The agent definition to execute. */
  agent: AgentDefinition;
  /** The task prompt submitted by the caller. */
  task: string;
  /** Current lifecycle state. */
  status: JobStatus;
  /** ISO-8601 timestamp when the job was created. */
  startedAt: string;
  /** ISO-8601 timestamp when the job finished (success or failure). */
  completedAt?: string;
  /** Full text response from the agent on success. */
  result?: string;
  /** Error message if the job failed. */
  error?: string;
  /** Vault-relative path where the output was written, if applicable. */
  outputPath?: string;
}

/** Generates a RFC-4122 v4 UUID without external dependencies. */
function generateId(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ---------------------------------------------------------------------------
// BackgroundManager
// ---------------------------------------------------------------------------

/**
 * Manages a pool of non-blocking background agent executions.
 *
 * Jobs are submitted immediately and execute asynchronously. Each job is
 * tracked in an internal map so callers can poll for status, retrieve results,
 * or cancel queued jobs.
 */
export class BackgroundManager {
  /** Internal job registry keyed by job ID. */
  private jobs: Map<string, BackgroundJob> = new Map();

  /**
   * @param executor - Sends prompts to the language model.
   * @param memoryBuilder - Builds the base system-prompt context block.
   * @param slotManager - Provides concurrency-controlled session slots.
   * @param vault - Obsidian Vault instance used to write output notes.
   * @param templateResolver - Resolves {{variable}} templates in output paths.
   * @param agentRegistry - Loads agent definitions from the vault.
   */
  constructor(
    private readonly executor: AgentExecutor,
    private readonly memoryBuilder: MemoryContextBuilder,
    private readonly slotManager: SessionSlotManager,
    private readonly vault: Vault,
    private readonly templateResolver: TemplateResolver,
    private readonly agentRegistry: AgentRegistry
  ) {}

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Submits an agent task for background execution.
   *
   * The job is registered immediately with status `"queued"`, then a session
   * slot is requested asynchronously. Execution begins as soon as the slot is
   * granted. This method returns the job ID right away without blocking.
   *
   * @param agent - The agent definition to use.
   * @param task - The task prompt to send to the agent.
   * @returns A unique job ID that can be used to poll status or cancel the job.
   */
  submit(agent: AgentDefinition, task: string): string {
    const id = generateId();

    const job: BackgroundJob = {
      id,
      agent,
      task,
      status: "queued",
      startedAt: new Date().toISOString(),
    };

    this.jobs.set(id, job);

    // Request a session slot (priority 4 = background agents) and kick off
    // execution without awaiting -- the caller gets the ID immediately.
    this.slotManager
      .requestSession(agent.name, 4)
      .then((sessionId) => {
        // Only execute if the job has not been cancelled while waiting.
        if (job.status === "cancelled") {
          this.slotManager.releaseSession(sessionId);
          return;
        }
        void this.executeJob(job, sessionId);
      })
      .catch((err: unknown) => {
        job.status = "failed";
        job.error = err instanceof Error ? err.message : String(err);
        job.completedAt = new Date().toISOString();
      });

    return id;
  }

  /**
   * Returns the {@link BackgroundJob} record for the given job ID, or
   * `undefined` if the ID is not recognised.
   *
   * @param id - The job ID returned by {@link submit}.
   */
  getStatus(id: string): BackgroundJob | undefined {
    return this.jobs.get(id);
  }

  /**
   * Returns all jobs that have not yet completed (status is `"queued"`,
   * `"running"`, or similar non-terminal states).
   *
   * Terminal statuses are `"completed"`, `"failed"`, and `"cancelled"`.
   */
  getActiveJobs(): BackgroundJob[] {
    const terminal: JobStatus[] = ["completed", "failed", "cancelled"];
    return Array.from(this.jobs.values()).filter(
      (j) => !terminal.includes(j.status)
    );
  }

  /**
   * Returns all jobs whose status is `"completed"`.
   */
  getCompletedJobs(): BackgroundJob[] {
    return Array.from(this.jobs.values()).filter(
      (j) => j.status === "completed"
    );
  }

  /**
   * Cancels a queued job. Jobs that are already running, completed, or
   * otherwise in a terminal state cannot be cancelled.
   *
   * @param id - The job ID returned by {@link submit}.
   * @returns `true` if the job was successfully cancelled, `false` otherwise.
   */
  cancel(id: string): boolean {
    const job = this.jobs.get(id);
    if (!job || job.status !== "queued") {
      return false;
    }
    job.status = "cancelled";
    job.completedAt = new Date().toISOString();
    return true;
  }

  /**
   * Returns the full text result of a completed job, or `undefined` if the
   * job does not exist or has not completed successfully.
   *
   * @param id - The job ID returned by {@link submit}.
   */
  getResult(id: string): string | undefined {
    return this.jobs.get(id)?.result;
  }

  /**
   * Resolves an agent by name from the vault's `.claude/agents/` directory,
   * then submits it for background execution.
   *
   * This is a convenience wrapper around {@link submit} that removes the need
   * for callers to manage agent loading themselves.
   *
   * @param agentName - The name of the agent to resolve and submit.
   * @param task - The task prompt to send to the agent.
   * @returns A unique job ID that can be used to poll status or cancel the job.
   * @throws {Error} If no agent with the given name exists in the vault.
   */
  async submitByName(agentName: string, task: string): Promise<string> {
    const agents = await this.agentRegistry.loadAgents();
    const agent = agents.find((a) => a.name === agentName);
    if (!agent) {
      throw new Error(
        `[BackgroundManager] No agent found with name "${agentName}"`
      );
    }
    return this.submit(agent, task);
  }

  // ---------------------------------------------------------------------------
  // Private implementation
  // ---------------------------------------------------------------------------

  /**
   * Runs a background job to completion.
   *
   * Acquires the previously-granted session slot, builds the system prompt,
   * sends the task to the executor (non-streaming -- collects full response),
   * and records the result or error. The session is always released via
   * `try/finally` to prevent slot leaks.
   *
   * If `agent.outputFormat` is `"vault_note"` and `agent.outputPath` is set,
   * the result is written to the vault at the resolved path.
   *
   * @param job - The job to execute.
   * @param sessionId - The session ID granted by the slot manager.
   */
  private async executeJob(
    job: BackgroundJob,
    sessionId: string
  ): Promise<void> {
    job.status = "running";

    try {
      // Build system prompt
      const basePrompt = await this.memoryBuilder.buildSystemPromptContext();
      const systemPrompt = job.agent.systemPrompt
        ? `${job.agent.systemPrompt}\n\n${basePrompt}`
        : basePrompt;

      // Send via executor and collect the full response (non-streaming)
      const result = await new Promise<string>((resolve, reject) => {
        this.executor.sendMessage(job.task, systemPrompt, {
          onChunk: () => {
            /* intentionally ignored for background jobs */
          },
          onComplete: resolve,
          onError: reject,
        });
      });

      job.status = "completed";
      job.result = result;
      job.completedAt = new Date().toISOString();

      // Write to vault note if configured
      if (
        job.agent.outputFormat === "vault_note" &&
        job.agent.outputPath !== undefined &&
        job.agent.outputPath.trim() !== ""
      ) {
        const resolvedPath = this.templateResolver.resolve(job.agent.outputPath);
        const normalised = normalizePath(resolvedPath);
        job.outputPath = normalised;

        try {
          await this.vault.adapter.write(normalised, result);
        } catch (writeErr) {
          console.warn(
            `[BackgroundManager] Failed to write output note for job "${job.id}" at "${normalised}":`,
            writeErr
          );
        }
      }
    } catch (err) {
      job.status = "failed";
      job.error = err instanceof Error ? err.message : String(err);
      job.completedAt = new Date().toISOString();
    } finally {
      this.slotManager.releaseSession(sessionId);
    }
  }
}
