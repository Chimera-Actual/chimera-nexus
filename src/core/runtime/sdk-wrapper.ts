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
interface CliStreamEvent {
  type: string;
  subtype?: string;
  session_id?: string;
  message?: {
    content?: Array<{
      type: string;
      text?: string;
      id?: string;
      name?: string;
      input?: Record<string, unknown>;
    }>;
  };
  result?: string;
  tool?: string;
  name?: string;
  input?: Record<string, unknown>;
  text?: string; // For legacy/simple text events
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

  /** Active CLI session ID for resumption. */
  private currentSessionId: string | null = null;

  /** Cached shell environment extracted from the user's profile. */
  private shellEnv: Record<string, string>;

  /**
   * @param settings - Plugin settings containing auth configuration.
   */
  constructor(private readonly settings: ChimeraSettings) {
    this.shellEnv = SdkWrapper.getShellEnvironment();
  }

  // -------------------------------------------------------------------------
  // Shell environment extraction
  // -------------------------------------------------------------------------

  /**
   * Extracts the user's full shell environment by sourcing their profile files.
   * On Windows, returns process.env directly.
   * On Unix, sources .zshrc/.bash_profile/.bashrc to capture PATH and API keys.
   */
  private static getShellEnvironment(): Record<string, string> {
    if (process.platform === "win32") {
      return { ...process.env } as Record<string, string>;
    }

    try {
      const { execSync } = require("child_process") as typeof import("child_process");
      const os = require("os") as typeof import("os");
      const path = require("path") as typeof import("path");

      const shell = process.env.SHELL || "/bin/sh";
      const shellName = path.basename(shell);
      const homeDir = os.homedir();

      let sourceCommand: string;
      if (shellName === "zsh") {
        sourceCommand = `${shell} -c 'source ~/.zshenv 2>/dev/null; source ~/.zprofile 2>/dev/null; source ~/.zshrc 2>/dev/null; env'`;
      } else if (shellName === "bash") {
        sourceCommand = `${shell} -c 'source ~/.profile 2>/dev/null; source ~/.bash_profile 2>/dev/null; source ~/.bashrc 2>/dev/null; env'`;
      } else {
        sourceCommand = `${shell} -l -c 'env'`;
      }

      const envOutput = execSync(sourceCommand, {
        encoding: "utf8",
        maxBuffer: 10 * 1024 * 1024,
        timeout: 5000,
        env: { ...process.env, HOME: homeDir },
      });

      const env: Record<string, string> = {};
      for (const line of envOutput.split("\n")) {
        const idx = line.indexOf("=");
        if (idx > 0) {
          env[line.substring(0, idx)] = line.substring(idx + 1);
        }
      }
      return env;
    } catch {
      // Fallback to process.env if shell sourcing fails
      return { ...process.env } as Record<string, string>;
    }
  }

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

  /** Get the current CLI session ID (for persistence across sessions). */
  getSessionId(): string | null {
    return this.currentSessionId;
  }

  /** Set session ID (for restoring from saved sessions). */
  setSessionId(id: string | null): void {
    this.currentSessionId = id;
  }

  // -------------------------------------------------------------------------
  // Private implementation - CLI path
  // -------------------------------------------------------------------------

  /**
   * Sends a prompt via the `claude` CLI using `--output-format stream-json`.
   *
   * Uses the stdin JSON protocol (`--input-format stream-json`) to avoid shell
   * escaping issues with the prompt. Supports session resumption via `--resume`
   * and extracts the session ID from system/init events for future resumption.
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
      const args = [
        "--print",
        "--verbose",
        "--output-format", "stream-json",
        "--input-format", "stream-json",
      ];

      // Resume existing session
      if (this.currentSessionId) {
        args.push("--resume", this.currentSessionId);
      }

      // System prompt only on first message (no resume ID)
      if (!this.currentSessionId && systemPrompt) {
        args.push("--system-prompt", systemPrompt);
      }

      // Permission mode is already the CLI flag value
      args.push("--permission-mode", this.settings.permissionMode);

      // Model
      if (this.settings.model) {
        args.push("--model", this.settings.model);
      }

      child = spawn(this.settings.cliPath, args, {
        shell: true, // Required for PATH resolution on Windows
        env: this.shellEnv,
      });
    } catch (err) {
      callbacks.onError(
        new Error(
          `Failed to spawn CLI process at "${this.settings.cliPath}": ${String(err)}`
        )
      );
      return;
    }

    this.activeProcess = child;

    // Send prompt via stdin JSON protocol (avoids shell escaping issues)
    if (child.stdin) {
      const inputMessage = JSON.stringify({
        type: "user",
        message: { role: "user", content: prompt },
      }) + "\n";
      child.stdin.write(inputMessage, "utf8");
      child.stdin.end();
    }

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

        let parsed: CliStreamEvent;
        try {
          parsed = JSON.parse(line) as CliStreamEvent;
        } catch {
          // Non-JSON diagnostic line from the CLI - ignore.
          continue;
        }

        // Extract session ID from any event that has it
        if (parsed.session_id) {
          this.currentSessionId = String(parsed.session_id);
        }

        // Handle assistant message events (main content delivery)
        if (parsed.type === "assistant" && parsed.message?.content) {
          for (const block of parsed.message.content) {
            if (block.type === "text" && typeof block.text === "string") {
              fullText += block.text;
              callbacks.onChunk(block.text);
            }
            // Tool use blocks could be rendered too
            if (block.type === "tool_use" && block.name) {
              callbacks.onChunk(`\n[Using ${block.name}...]\n`);
            }
          }
        }

        // Handle result event (final summary - stream is done)
        if (parsed.type === "result") {
          // The result event signals completion. fullText should already
          // have all the content from assistant events. If somehow empty,
          // fall back to result text.
          if (!fullText && parsed.result) {
            fullText = String(parsed.result);
          }
        }
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

      const modelMap: Record<string, string> = {
        haiku: "claude-haiku-4-5-20251001",
        sonnet: "claude-sonnet-4-20250514",
        opus: "claude-opus-4-20250514",
      };
      const modelId = modelMap[this.settings.model] || "claude-sonnet-4-20250514";

      const stream = client.messages.stream({
        model: modelId,
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
