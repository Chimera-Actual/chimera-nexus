/**
 * @file Wraps the Claude CLI and Anthropic SDK for two auth paths.
 *
 * Provides a unified `sendMessage` interface regardless of whether the user
 * is authenticating via the CLI or a direct API key. Streaming responses are
 * delivered through a {@link StreamCallbacks} object rather than an async
 * iterable so that UI consumers can wire up callbacks without managing an
 * async loop.
 */

import { spawn, ChildProcess } from "child_process";
import { ChimeraSettings, AuthMethod } from "../types";

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

/**
 * Callbacks used to receive streaming output from {@link SdkWrapper.sendMessage}.
 *
 * All three callbacks must be provided; the wrapper guarantees that exactly one
 * of `onComplete` or `onError` is called after zero or more `onChunk` calls.
 */
export interface StreamCallbacks {
  /** Called for each incremental text chunk as it arrives from the model. */
  onChunk: (text: string) => void;
  /** Called once with the fully assembled response when the stream ends. */
  onComplete: (fullText: string) => void;
  /** Called if an error occurs at any point during the stream. */
  onError: (error: Error) => void;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Shape of a newline-delimited JSON object emitted by the CLI stream. */
interface CliStreamLine {
  type: string;
  subtype?: string;
  text?: string;
}

// ---------------------------------------------------------------------------
// SdkWrapper
// ---------------------------------------------------------------------------

/**
 * Thin wrapper around the `claude` CLI and the Anthropic SDK that normalises
 * the two auth paths behind a single {@link sendMessage} method.
 *
 * Instantiate once per plugin lifecycle and reuse across sessions. Call
 * {@link abort} to cancel an in-flight request.
 */
export class SdkWrapper {
  /** Active CLI child process, kept for {@link abort}. */
  private activeProcess: ChildProcess | null = null;

  /**
   * Active Anthropic SDK stream, kept for {@link abort}.
   * Typed as `unknown` to avoid a hard dependency on the SDK types at compile
   * time -- the SDK is loaded via dynamic import at runtime.
   */
  private activeStream: unknown = null;

  /**
   * @param settings - Plugin settings containing auth configuration.
   */
  constructor(private readonly settings: ChimeraSettings) {}

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Sends a prompt to Claude and streams the response through `callbacks`.
   *
   * Dispatches to the CLI path when `settings.authMethod` is
   * {@link AuthMethod.CLI}, otherwise uses the Anthropic SDK directly.
   *
   * The method returns `void` immediately; all results are delivered through
   * the provided callbacks.
   *
   * @param prompt - The user prompt to send.
   * @param systemPrompt - System prompt to prepend for this turn.
   * @param callbacks - Handlers for chunks, completion, and errors.
   */
  sendMessage(
    prompt: string,
    systemPrompt: string,
    callbacks: StreamCallbacks
  ): void {
    if (this.settings.authMethod === AuthMethod.CLI) {
      this.sendViaCli(prompt, systemPrompt, callbacks);
    } else {
      this.sendViaApi(prompt, systemPrompt, callbacks);
    }
  }

  /**
   * Cancels any in-flight request.
   *
   * For the CLI path this kills the spawned process. For the API path this
   * calls `abort()` on the active stream controller if available.
   */
  abort(): void {
    if (this.activeProcess !== null) {
      this.activeProcess.kill();
      this.activeProcess = null;
    }

    if (this.activeStream !== null) {
      const stream = this.activeStream as { abort?: () => void };
      if (typeof stream.abort === "function") {
        stream.abort();
      }
      this.activeStream = null;
    }
  }

  // -------------------------------------------------------------------------
  // Private implementation - CLI path
  // -------------------------------------------------------------------------

  /**
   * Sends a prompt via the `claude` CLI using `--output-format stream-json`.
   *
   * The CLI emits newline-delimited JSON objects. Lines with `type` equal to
   * `"assistant"` and `subtype` equal to `"text"` carry incremental response
   * text. A line with `type` equal to `"result"` signals the end of the
   * stream.
   *
   * @param prompt - The user prompt.
   * @param systemPrompt - The system prompt.
   * @param callbacks - Result handlers.
   */
  private sendViaCli(
    prompt: string,
    systemPrompt: string,
    callbacks: StreamCallbacks
  ): void {
    let child: ChildProcess;

    try {
      child = spawn(this.settings.cliPath, [
        "--output-format",
        "stream-json",
        "-p",
        prompt,
        "--system-prompt",
        systemPrompt,
      ]);
    } catch (err) {
      callbacks.onError(
        new Error(
          `Failed to spawn CLI process at "${this.settings.cliPath}": ${String(err)}`
        )
      );
      return;
    }

    this.activeProcess = child;

    let fullText = "";
    let lineBuffer = "";
    let finished = false;

    const finish = (err?: Error): void => {
      if (finished) return;
      finished = true;
      this.activeProcess = null;

      if (err !== undefined) {
        callbacks.onError(err);
      } else {
        callbacks.onComplete(fullText);
      }
    };

    if (child.stdout === null) {
      finish(new Error("CLI process has no stdout"));
      return;
    }

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      lineBuffer += chunk;
      const lines = lineBuffer.split("\n");
      // The last element may be a partial line - keep it in the buffer.
      lineBuffer = lines.pop() ?? "";

      for (const raw of lines) {
        const line = raw.trim();
        if (line === "") continue;

        let parsed: CliStreamLine;
        try {
          parsed = JSON.parse(line) as CliStreamLine;
        } catch {
          // Non-JSON diagnostic line from the CLI - ignore.
          continue;
        }

        if (
          parsed.type === "assistant" &&
          parsed.subtype === "text" &&
          typeof parsed.text === "string"
        ) {
          fullText += parsed.text;
          callbacks.onChunk(parsed.text);
        }
        // `result` signals the end of output; the exit event will call finish.
      }
    });

    let stderrBuffer = "";
    if (child.stderr !== null) {
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk: string) => {
        stderrBuffer += chunk;
      });
    }

    child.on("error", (err: Error) => {
      const message =
        err.message.includes("ENOENT")
          ? `CLI executable not found at "${this.settings.cliPath}". ` +
            `Install the Claude CLI or update the path in plugin settings.`
          : err.message;
      finish(new Error(message));
    });

    child.on("close", (code: number | null) => {
      if (code !== 0 && code !== null) {
        const detail = stderrBuffer.trim() !== "" ? `: ${stderrBuffer.trim()}` : "";
        finish(new Error(`CLI process exited with code ${code}${detail}`));
      } else {
        finish();
      }
    });
  }

  // -------------------------------------------------------------------------
  // Private implementation - API key path
  // -------------------------------------------------------------------------

  /**
   * Sends a prompt via the Anthropic SDK using a direct API key.
   *
   * The SDK is loaded via a dynamic `import()` so that this module can be
   * bundled for Obsidian's Electron environment even when the package is not
   * present at compile time.
   *
   * @param prompt - The user prompt.
   * @param systemPrompt - The system prompt.
   * @param callbacks - Result handlers.
   */
  private async sendViaApi(
    prompt: string,
    systemPrompt: string,
    callbacks: StreamCallbacks
  ): Promise<void> {
    try {
      // Dynamic import to avoid bundling issues in the Obsidian Electron env.
      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      const client = new Anthropic({ apiKey: this.settings.apiKey });

      const stream = client.messages.stream({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: "user", content: prompt }],
      });

      this.activeStream = stream;

      let fullText = "";
      stream.on("text", (text: string) => {
        fullText += text;
        callbacks.onChunk(text);
      });

      await stream.finalMessage();
      this.activeStream = null;
      callbacks.onComplete(fullText);
    } catch (err) {
      this.activeStream = null;
      callbacks.onError(err instanceof Error ? err : new Error(String(err)));
    }
  }
}
