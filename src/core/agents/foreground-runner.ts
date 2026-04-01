/**
 * @file Runs agent tasks inline with blocking foreground execution.
 *
 * Executes an agent task synchronously from the caller's perspective, blocking
 * until the agent responds, and delivers streaming output through callbacks.
 */

import { AgentDefinition, HookEvent } from "../types";
import { SdkWrapper, StreamCallbacks } from "../runtime/sdk-wrapper";
import { MemoryInjector } from "../memory/memory-injector";
import { HookManager } from "../claude-compat/hook-manager";

/**
 * Executes agent tasks in the foreground, blocking until completion.
 *
 * Wraps an {@link SdkWrapper} call with memory injection and hook lifecycle
 * events so that every foreground agent run gets a properly assembled system
 * prompt and fires the standard `PreToolUse` / `PostToolUse` hooks for agent
 * delegation tracking.
 */
export class ForegroundRunner {
  /**
   * @param sdkWrapper - SDK wrapper used to send the prompt to Claude.
   * @param memoryInjector - Builds the base system-prompt context block.
   * @param hookManager - Fires pre/post lifecycle hooks around the call.
   */
  constructor(
    private readonly sdkWrapper: SdkWrapper,
    private readonly memoryInjector: MemoryInjector,
    private readonly hookManager: HookManager
  ) {}

  /**
   * Runs `agent` against `task`, delivering streaming output through `callbacks`.
   *
   * Steps:
   * 1. Builds the system prompt by prepending the agent's own `systemPrompt`
   *    (if set) to the base context from {@link MemoryInjector.buildSystemPromptContext}.
   * 2. Fires the `PreToolUse` hook for agent delegation tracking.
   * 3. Sends the task via the SDK wrapper with the assembled system prompt and
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
    const basePrompt = await this.memoryInjector.buildSystemPromptContext();
    const systemPrompt = agent.systemPrompt
      ? `${agent.systemPrompt}\n\n${basePrompt}`
      : basePrompt;

    // Step 2: Fire PreToolUse hook
    await this.hookManager.fireHook(HookEvent.PreToolUse, agent.name);

    // Step 3 & 4: Send via SDK, wrapping callbacks to fire PostToolUse
    const wrappedCallbacks: StreamCallbacks = {
      onChunk: callbacks.onChunk,
      onComplete: async (fullText: string): Promise<void> => {
        await this.hookManager.fireHook(HookEvent.PostToolUse, agent.name);
        callbacks.onComplete(fullText);
      },
      onError: async (error: Error): Promise<void> => {
        await this.hookManager.fireHook(
          HookEvent.PostToolUseFailure,
          agent.name
        );
        callbacks.onError(error);
      },
    };

    this.sdkWrapper.sendMessage(task, systemPrompt, wrappedCallbacks);
  }

  /**
   * Aborts the current in-flight SDK call, if any.
   */
  abort(): void {
    this.sdkWrapper.abort();
  }
}
