/**
 * @file Manages lifecycle hook handlers from settings.json.
 *
 * Loads hook definitions from {@link HookDefinition} arrays and provides a
 * `fireHook` method that invokes the appropriate handlers for a given event.
 */

import { exec } from "child_process";
import { HookDefinition, HookEvent, HookResult } from "../types";

/**
 * Registers and fires lifecycle hook handlers defined in Claude settings.
 *
 * Hooks are indexed by {@link HookEvent} at load time so lookups during
 * `fireHook` are O(1). Handlers within a hook definition are executed in
 * declaration order. If any handler returns `proceed: false` the chain stops
 * and that block result is returned immediately.
 */
export class HookManager {
  /** Internal index: event -> list of hook definitions registered for it. */
  private readonly hooksByEvent: Map<HookEvent, HookDefinition[]> = new Map();

  /**
   * Stores hooks indexed by {@link HookEvent} for fast lookup.
   *
   * Replaces any previously loaded hooks entirely.
   *
   * @param hooks - Array of hook definitions to register.
   */
  loadHooks(hooks: HookDefinition[]): void {
    this.hooksByEvent.clear();
    for (const hook of hooks) {
      const existing = this.hooksByEvent.get(hook.event);
      if (existing) {
        existing.push(hook);
      } else {
        this.hooksByEvent.set(hook.event, [hook]);
      }
    }
  }

  /**
   * Fires all handlers registered for `event` in order and returns the
   * aggregate result.
   *
   * Execution stops at the first handler that returns `proceed: false`.
   * Each handler receives the (possibly modified) input from the previous
   * handler, allowing a chain to progressively rewrite the triggering input.
   *
   * @param event - The lifecycle event that occurred.
   * @param input - Optional input string associated with the event.
   * @returns Aggregated hook result indicating whether the operation should proceed.
   */
  async fireHook(event: HookEvent, input?: string): Promise<HookResult> {
    const definitions = this.hooksByEvent.get(event) ?? [];
    let currentInput = input ?? "";

    for (const definition of definitions) {
      for (const handler of definition.handlers) {
        let result: HookResult;

        switch (handler.type) {
          case "command":
            result = await this.executeCommand(handler.command, currentInput);
            break;

          case "http":
            console.log("HTTP hooks not yet implemented");
            result = { proceed: true };
            break;

          case "prompt":
            console.log("Prompt hooks not yet implemented");
            result = { proceed: true };
            break;

          case "agent":
            console.log("Agent hooks not yet implemented");
            result = { proceed: true };
            break;
        }

        if (!result.proceed) {
          return result;
        }

        if (result.modifiedInput !== undefined) {
          currentInput = result.modifiedInput;
        }
      }
    }

    return { proceed: true, modifiedInput: currentInput !== (input ?? "") ? currentInput : undefined };
  }

  /**
   * Returns all hook definitions registered for the given event.
   *
   * @param event - The lifecycle event to look up.
   * @returns Array of matching hook definitions, or an empty array if none are registered.
   */
  getHooksForEvent(event: HookEvent): HookDefinition[] {
    return this.hooksByEvent.get(event) ?? [];
  }

  /**
   * Executes a shell command as a hook handler.
   *
   * The hook payload `{ "event": "hook", "input": "..." }` is written to the
   * command's stdin as JSON. Exit code 0 means proceed; exit code 2 means
   * block; any other non-zero exit code logs a warning and proceeds.
   *
   * @param command - Shell command string to execute.
   * @param input - Current input value to pass as JSON on stdin.
   * @returns The hook result parsed from the command's stdout and exit code.
   */
  private executeCommand(command: string, input: string): Promise<HookResult> {
    return new Promise((resolve) => {
      const child = exec(command, { timeout: 10000 }, (error, stdout, stderr) => {
        if (error) {
          if (error.code === 2) {
            resolve({ proceed: false, error: stderr || "Hook blocked the operation" });
            return;
          }
          console.warn(`Hook command failed: ${stderr}`);
          resolve({ proceed: true });
          return;
        }

        let modifiedInput: string | undefined;
        if (stdout.trim()) {
          try {
            const parsed: unknown = JSON.parse(stdout.trim());
            if (
              typeof parsed === "object" &&
              parsed !== null &&
              "modifiedInput" in parsed
            ) {
              modifiedInput = String((parsed as Record<string, unknown>).modifiedInput);
            }
          } catch {
            // stdout was not JSON -- that is fine, ignore it
          }
        }

        resolve({ proceed: true, modifiedInput });
      });

      if (child.stdin) {
        child.stdin.write(JSON.stringify({ event: "hook", input }));
        child.stdin.end();
      }
    });
  }
}
