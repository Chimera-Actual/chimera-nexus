/**
 * @file Runs agent tasks inline with blocking foreground execution.
 *
 * Executes an agent task synchronously from the caller's perspective, blocking
 * until the agent responds, and delivers streaming output through callbacks.
 *
 * Ported from chimera-nexus v1. Concrete SdkWrapper, MemoryInjector, and
 * HookManager dependencies are replaced with injected interfaces so this
 * module is self-contained within src/chimera/. Wire up real implementations
 * via the bridge layer.
 */

import { AgentDefinition } from "../types";

// ---------------------------------------------------------------------------
// Bridge interfaces (injected -- no concrete imports from outside chimera/)
// ---------------------------------------------------------------------------

/**
 * Streaming callbacks for foreground agent execution.
 */
export interface StreamCallbacks {
  /** Called for each incremental text chunk as it arrives from the model. */
  onChunk: (text: string) => void;
  /** Called once with the fully assembled response when the stream ends. */
  onComplete: (fullText: string) => void | Promise<void>;
  /** Called if an error occurs at any point during the stream. */
  onError: (error: Error) => void | Promise<void>;
}

/**
 * Minimal interface for sending a prompt to the language model.
 * Fulfilled by SdkWrapper from the bridge layer.
 */
export interface AgentExecutor {
  sendMessage(prompt: string, systemPrompt: string, callbacks: StreamCallbacks): void;
  abort(): void;
}

/**
 * Minimal interface for building a memory-enriched system prompt.
 * Fulfilled by MemoryInjector from the bridge layer.
 */
export interface MemoryContextBuilder {
  buildSystemPromptContext(): Promise<string>;
}

/** Hook event names mirroring Claude Code's lifecycle model. */
export enum HookEvent {
  Setup = "Setup",
  SessionStart = "SessionStart",
  SessionEnd = "SessionEnd",
  UserPromptSubmit = "UserPromptSubmit",
  PreToolUse = "PreToolUse",
  PostToolUse = "PostToolUse",
  PostToolUseFailure = "PostToolUseFailure",
  PermissionRequest = "PermissionRequest",
  Stop = "Stop",
  StopFailure = "StopFailure",
  SubagentStart = "SubagentStart",
  SubagentStop = "SubagentStop",
  PreCompact = "PreCompact",
  Notification = "Notification",
  FileChanged = "FileChanged",
}

/**
 * Minimal interface for firing lifecycle hooks.
 * Fulfilled by HookManager from the bridge layer.
 */
export interface HookFireable {
  fireHook(event: HookEvent, context?: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// ForegroundRunner
// ---------------------------------------------------------------------------

/**
 * Executes agent tasks in the foreground, blocking until completion.
 *
 * Wraps an {@link AgentExecutor} call with memory injection and hook lifecycle
 * events so that every foreground agent run gets a properly assembled system
 * prompt and fires the standard `PreToolUse` / `PostToolUse` hooks for agent
 * delegation tracking.
 */
export class ForegroundRunner {
  /**
   * @param executor - Sends the prompt to the language model.
   * @param memoryBuilder - Builds the base system-prompt context block.
   * @param hookManager - Fires pre/post lifecycle hooks around the call.
   */
  constructor(
    private readonly executor: AgentExecutor,
    private readonly memoryBuilder: MemoryContextBuilder,
    private readonly hookManager: HookFireable
  ) {}

  /**
   * Runs `agent` against `task`, delivering streaming output through `callbacks`.
   *
   * Steps:
   * 1. Builds the system prompt by prepending the agent's own `systemPrompt`
   *    (if set) to the base context from {@link MemoryContextBuilder.buildSystemPromptContext}.
   * 2. Fires the `PreToolUse` hook for agent delegation tracking.
   * 3. Sends the task via the executor with the assembled system prompt and
   *    the provided callbacks.
   * 4. Fires the `PostToolUse` hook on completion (or `PostToolUseFailure` on
   *    error).
   *
   * The method itself returns `void` immediately; all results are delivered
   * asynchronously through `callbacks`.
   *
   * @param agent - The agent definition to use.
   * @param task - The task prompt to send to the agent.
   * @param callbacks - Handlers for streaming chunks, completion, and errors.
   */
  async run(
    agent: AgentDefinition,
    task: string,
    callbacks: StreamCallbacks
  ): Promise<void> {
    // Step 1: Build system prompt
    const basePrompt = await this.memoryBuilder.buildSystemPromptContext();
    const systemPrompt = agent.systemPrompt
      ? `${agent.systemPrompt}\n\n${basePrompt}`
      : basePrompt;

    // Step 2: Fire PreToolUse hook
    await this.hookManager.fireHook(HookEvent.PreToolUse, agent.name);

    // Step 3 & 4: Send via executor, wrapping callbacks to fire PostToolUse
    const wrappedCallbacks: StreamCallbacks = {
      onChunk: callbacks.onChunk,
      onComplete: async (fullText: string): Promise<void> => {
        await this.hookManager.fireHook(HookEvent.PostToolUse, agent.name);
        await callbacks.onComplete(fullText);
      },
      onError: async (error: Error): Promise<void> => {
        await this.hookManager.fireHook(
          HookEvent.PostToolUseFailure,
          agent.name
        );
        await callbacks.onError(error);
      },
    };

    this.executor.sendMessage(task, systemPrompt, wrappedCallbacks);
  }

  /**
   * Aborts the current in-flight executor call, if any.
   */
  abort(): void {
    this.executor.abort();
  }
}
