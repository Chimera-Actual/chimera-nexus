/**
 * @file Core type definitions for Chimera Nexus.
 *
 * This is the single source of truth for all shared types used across the
 * plugin. Every other module should import from here rather than defining
 * its own local copies of these shapes.
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/**
 * Determines how eagerly a memory file is loaded into the context window.
 *
 * - `Pinned`   - Always included regardless of budget.
 * - `Indexed`  - Included when the memory budget allows.
 * - `OnDemand` - Loaded only when explicitly requested by the agent.
 */
export enum MemoryTier {
  Pinned = "pinned",
  Indexed = "indexed",
  OnDemand = "on-demand",
}

/**
 * Lifecycle and interaction events that can trigger registered hook handlers.
 *
 * These mirror the Claude Code hook event model so that CLAUDE.md hooks can
 * be expressed as first-class plugin config.
 */
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
 * Controls how permissively the agent is allowed to execute tool calls.
 *
 * These mirror the Claude Code CLI `--permission-mode` flag values exactly.
 *
 * - `AskBeforeEdits`    - Claude will ask for approval before making each edit.
 * - `EditAutomatically` - Claude will edit your selected text or the whole file.
 * - `Plan`              - Claude will explore the code and present a plan before editing.
 * - `BypassPermissions` - Claude will not ask for approval before running potentially dangerous commands.
 */
export enum PermissionMode {
  AskBeforeEdits = "default",
  EditAutomatically = "acceptEdits",
  Plan = "plan",
  BypassPermissions = "bypassPermissions",
}

/**
 * How Chimera authenticates with the Claude backend.
 *
 * - `CLI`    - Piggy-backs on the `claude` CLI's stored credentials.
 * - `APIKey` - Uses an explicit Anthropic API key stored in plugin settings.
 */
export enum AuthMethod {
  CLI = "cli",
  APIKey = "api-key",
}

// ---------------------------------------------------------------------------
// Memory types
// ---------------------------------------------------------------------------

/**
 * Represents a single file inside the vault's memory folder.
 *
 * Metadata is parsed from the YAML frontmatter; `content` is only populated
 * when the file is actually loaded into the context window.
 */
export interface MemoryFile {
  /** Vault-relative path to the file (e.g. `memory/system.md`). */
  path: string;
  /** Display name derived from the file stem. */
  name: string;
  /** Human-readable description from the `description` frontmatter field. */
  description: string;
  /**
   * Semantic category of this memory file.
   * Common values: `"system"`, `"knowledge"`, `"user"`.
   */
  memtype: string;
  /** Determines how eagerly this file is included in the context window. */
  tier: MemoryTier;
  /** Whether this file should always be included regardless of budget. */
  pinned: boolean;
  /** Arbitrary tags for filtering and organisation. */
  tags: string[];
  /** ISO-8601 creation timestamp. */
  created: string;
  /** ISO-8601 last-modified timestamp. */
  updated: string;
  /**
   * Raw markdown content.
   * Only populated after an explicit load; `undefined` otherwise.
   */
  content?: string;
}

// ---------------------------------------------------------------------------
// Session types
// ---------------------------------------------------------------------------

/**
 * A condensed record of a past session used for display in the session list
 * and for building cross-session memory.
 */
export interface SessionSummary {
  /** Unique identifier for the session (UUID). */
  sessionId: string;
  /** Name of the agent that ran this session. */
  agent: string;
  /** Short human-readable title for the session. */
  title: string;
  /** Key topics discussed during the session. */
  keyTopics: string[];
  /** Notable decisions or conclusions reached. */
  decisions: string[];
  /** ISO-8601 timestamp when the session was created. */
  created: string;
  /** Approximate number of tokens consumed by the session. */
  tokenCount: number;
}

/**
 * A single message in a conversation transcript.
 */
export interface ConversationMessage {
  /** Who sent the message. */
  role: "user" | "assistant";
  /** Markdown content of the message. */
  content: string;
  /** ISO-8601 timestamp when the message was recorded. */
  timestamp: string;
}

/**
 * Full session record including all messages and metadata.
 *
 * Stored as a vault note with YAML frontmatter.
 */
export interface Session {
  /** Unique identifier (UUID). */
  sessionId: string;
  /** Name of the agent that owns this session. */
  agent: string;
  /** Short human-readable title. */
  title: string;
  /** ISO-8601 creation timestamp. */
  created: string;
  /** ISO-8601 last-updated timestamp. */
  updated: string;
  /** Model identifier used for this session (e.g. `"claude-opus-4-5"`). */
  model: string;
  /** Cumulative token usage across all turns. */
  tokensUsed: number;
  /** Total number of messages in the transcript. */
  messageCount: number;
  /** Current lifecycle state of the session. */
  status: "active" | "completed" | "paused";
  /** Vault-relative paths to files produced by the session. */
  outputFiles: string[];
  /** Arbitrary tags. */
  tags: string[];
  /** Full ordered transcript. */
  messages: ConversationMessage[];
}

/**
 * Lightweight index entry for a single session.
 *
 * Kept in the session index file so the UI can list sessions without loading
 * every full session note.
 */
export interface SessionIndexEntry {
  /** Unique identifier (UUID). */
  sessionId: string;
  /** Name of the agent that owns this session. */
  agent: string;
  /** Short human-readable title. */
  title: string;
  /** ISO-8601 creation timestamp. */
  created: string;
  /** ISO-8601 last-updated timestamp. */
  updated: string;
  /** Total number of messages in the transcript. */
  messageCount: number;
  /** Current lifecycle state. */
  status: string;
  /** Vault-relative path to the full session note. */
  path: string;
}

/**
 * The session index file - a flat list of all known sessions plus rebuild
 * metadata.
 */
export interface SessionIndex {
  /** All indexed sessions, newest first by convention. */
  entries: SessionIndexEntry[];
  /** ISO-8601 timestamp of the last full index rebuild. */
  lastRebuilt: string;
}

// ---------------------------------------------------------------------------
// Scheduled / Loop task types (stubs)
// ---------------------------------------------------------------------------

/**
 * A task that fires on a cron schedule.
 *
 * @todo Implement scheduler integration (Task 3.x).
 */
export interface ScheduledTask {
  /** Unique identifier. */
  id: string;
  /** Display name. */
  name: string;
  /** Whether the task is currently active. */
  enabled: boolean;
  /** Cron expression (e.g. `"0 9 * * 1-5"`). */
  schedule: string;
  /** Human-readable description of the schedule (e.g. `"Weekdays at 9 am"`). */
  scheduleHuman: string;
  /** Model identifier to use when running the task. */
  model: string;
  /** Agent to invoke. */
  agent: string;
  /** Permission mode for this task. */
  permissionMode: PermissionMode;
  /** Maximum wall-clock seconds before the task is killed. */
  maxDurationSeconds: number;
  /** ISO-8601 creation timestamp. */
  created: string;
  /** ISO-8601 timestamp of the last run, or empty string if never run. */
  lastRun: string;
  /** ISO-8601 timestamp of the next scheduled run. */
  nextRun: string;
  /** Prompt text sent to the agent. */
  prompt: string;
  /** Tool names the agent is allowed to use. */
  toolAccess: string[];
  /** Arbitrary tags. */
  tags: string[];
}

/**
 * A task that fires repeatedly on a fixed millisecond interval.
 *
 * @todo Implement loop engine (Task 3.x).
 */
export interface LoopTask {
  /** Unique identifier. */
  id: string;
  /** Repeat interval in milliseconds. */
  interval: number;
  /** Prompt sent to the agent on each iteration. */
  prompt: string;
  /** Agent to invoke. */
  agent: string;
  /** ISO-8601 creation timestamp. */
  createdAt: string;
  /** ISO-8601 expiry timestamp; the loop stops after this time. */
  expiresAt: string;
  /** ISO-8601 timestamp of the last run, or empty string if never run. */
  lastRun: string;
  /** Number of times the task has been executed so far. */
  runCount: number;
}

// ---------------------------------------------------------------------------
// Agent / Skill / Command definition types
// ---------------------------------------------------------------------------

/**
 * Full definition of a Chimera agent loaded from a vault agent note or the
 * built-in agent registry.
 */
export interface AgentDefinition {
  /** Unique agent name used in @mentions and API calls. */
  name: string;
  /** Short human-readable description shown in the UI. */
  description: string;
  /** Model identifier (e.g. `"claude-opus-4-5"`). */
  model: string;
  /**
   * Behavioural archetype.
   * - `"standard"`     - Standalone conversational agent.
   * - `"orchestrator"` - Can spawn and coordinate sub-agents.
   */
  type: "standard" | "orchestrator";
  /** Explicit allow-list of tool names the agent may use. */
  allowedTools: string[];
  /** Explicit deny-list of tool names the agent may never use. */
  deniedTools: string[];
  /**
   * Filesystem isolation strategy.
   * - `"none"`     - No isolation; full vault access.
   * - `"worktree"` - Runs inside a Git worktree sandbox.
   */
  isolation: "none" | "worktree";
  /**
   * Memory loading strategy.
   * - `"none"`  - No memory files injected.
   * - `"vault"` - Loads the vault memory folder.
   * - `"user"`  - Loads the user-scoped memory folder.
   */
  memory: "none" | "vault" | "user";
  /** Maximum context window size in tokens (model default if omitted). */
  maxTokens?: number;
  /** Maximum wall-clock seconds before the session is killed. */
  timeoutSeconds: number;
  /**
   * Controls where output goes.
   * - `"chat"`       - Replies appear inline in the chat panel.
   * - `"vault_note"` - Output is written to a vault note.
   */
  outputFormat: "chat" | "vault_note";
  /** Vault-relative path for output notes when `outputFormat` is `"vault_note"`. */
  outputPath?: string;
  /** Hex colour used in the UI to visually distinguish the agent. */
  color?: string;
  /** System prompt injected at the start of every session. */
  systemPrompt: string;
  /** Arbitrary tags for filtering. */
  tags: string[];
}

/**
 * Metadata for a skill loaded from `~/.claude/skills/`.
 */
export interface SkillDefinition {
  /** Unique skill name (matches the folder name). */
  name: string;
  /** Short human-readable description. */
  description: string;
  /** Absolute filesystem path to the skill folder. */
  path: string;
  /** Whether the skill folder contains a `scripts/` sub-directory. */
  hasScripts: boolean;
  /** Whether the skill folder contains a `references/` sub-directory. */
  hasReferences: boolean;
}

/**
 * Metadata for a slash command loaded from the vault commands folder.
 */
export interface CommandDefinition {
  /** Command name without the leading slash (e.g. `"summarise"`). */
  name: string;
  /** Short human-readable description shown in the command palette. */
  description: string;
  /** Optional argument hint displayed in the autocomplete UI. */
  argumentHint?: string;
  /** Vault-relative path to the command markdown file. */
  path: string;
}

// ---------------------------------------------------------------------------
// Plugin types (CC-compatible)
// ---------------------------------------------------------------------------

/**
 * Installation scope for plugins.
 * - `user`    - Personal, stored in ~/.claude/settings.json
 * - `project` - Team, stored in .claude/settings.json (vault)
 * - `local`   - Project-specific, gitignored (.claude/settings.local.json)
 */
export type PluginScope = "user" | "project" | "local";

/**
 * Author metadata in a plugin manifest.
 */
export interface PluginAuthor {
  name: string;
  email?: string;
  url?: string;
}

/**
 * A user-configurable value defined by a plugin.
 * Non-sensitive values go in settings.json, sensitive values in credentials.
 */
export interface PluginUserConfigField {
  description: string;
  sensitive: boolean;
}

/**
 * CC-compatible plugin manifest parsed from `.claude-plugin/plugin.json`.
 *
 * Only `name` is required. All other fields are optional.
 * Paths must be relative and start with `./`.
 */
export interface PluginManifest {
  /** Unique plugin name (kebab-case). Used for namespacing. */
  name: string;
  /** Semantic version string. */
  version?: string;
  /** Human-readable description. */
  description?: string;
  /** Author metadata. */
  author?: PluginAuthor;
  /** Documentation URL. */
  homepage?: string;
  /** Source code URL. */
  repository?: string;
  /** SPDX license identifier. */
  license?: string;
  /** Discovery keywords. */
  keywords?: string[];

  /** Custom path(s) to command files/directories (overrides default `commands/`). */
  commands?: string | string[];
  /** Custom path(s) to agent files (overrides default `agents/`). */
  agents?: string | string[];
  /** Custom path(s) to skill directories (overrides default `skills/`). */
  skills?: string | string[];
  /** Hook configuration -- path(s) or inline object. */
  hooks?: string | string[] | Record<string, unknown>;
  /** MCP server configurations -- path(s) or inline object. */
  mcpServers?: string | string[] | Record<string, unknown>;
  /** Custom path(s) to output style directories. */
  outputStyles?: string | string[];

  /** User-configurable values this plugin requires. */
  userConfig?: Record<string, PluginUserConfigField>;
  /** Default settings applied when plugin is enabled. */
  settings?: Record<string, unknown>;

  // --- Chimera runtime fields (not in plugin.json, populated by loader) ---
  /** Absolute path to the plugin installation directory. */
  installPath?: string;
  /** Marketplace this plugin was installed from (e.g. "chimera-official"). */
  marketplace?: string;
  /** Whether the plugin is currently enabled. */
  enabled?: boolean;
  /** Relative paths to discovered skill directories (auto-populated by loader). */
  discoveredSkills?: string[];
  /** Relative paths to discovered agent files (auto-populated by loader). */
  discoveredAgents?: string[];
}

/**
 * Source definition for a plugin in a marketplace index.
 */
export type PluginSource =
  | string
  | { source: "github"; repo: string; ref?: string; sha?: string }
  | { source: "url"; url: string; ref?: string; sha?: string }
  | { source: "git-subdir"; url: string; path: string; ref?: string; sha?: string };

/**
 * Entry for a single plugin inside a `marketplace.json` index.
 */
export interface MarketplacePluginEntry {
  name: string;
  source: PluginSource;
  description?: string;
  version?: string;
  author?: PluginAuthor;
  keywords?: string[];
  category?: string;
}

/**
 * Parsed marketplace index from `.claude-plugin/marketplace.json`.
 */
export interface MarketplaceIndex {
  name: string;
  owner: { name: string; email?: string };
  metadata?: {
    description?: string;
    version?: string;
    pluginRoot?: string;
  };
  plugins: MarketplacePluginEntry[];
}

// ---------------------------------------------------------------------------
// Hook types
// ---------------------------------------------------------------------------

/**
 * A single handler invoked when a hook fires.
 *
 * The `type` field is a discriminant - use it to narrow which optional fields
 * are actually present.
 */
export type HookHandler =
  | {
      /** Run a shell command. */
      type: "command";
      /** Shell command string to execute. */
      command: string;
      /** Whether to run the handler without blocking the hook lifecycle. */
      async?: boolean;
    }
  | {
      /** Send an HTTP request. */
      type: "http";
      /** URL to POST the hook payload to. */
      url: string;
      /** Whether to fire-and-forget (non-blocking). */
      async?: boolean;
    }
  | {
      /** Inject a prompt into the current conversation. */
      type: "prompt";
      /** Prompt text to inject. */
      prompt: string;
      /** Whether to inject asynchronously. */
      async?: boolean;
    }
  | {
      /** Delegate to a Chimera agent. */
      type: "agent";
      /** Name of the agent to invoke. */
      agentName: string;
      /** Whether to invoke the agent in the background. */
      async?: boolean;
    };

/**
 * Associates a lifecycle event with one or more handlers.
 *
 * An optional `matcher` glob restricts which files or tool names cause the
 * hook to fire (e.g. `"**\/*.md"` for file-change hooks, `"Bash"` for tool
 * hooks).
 */
export interface HookDefinition {
  /** The lifecycle event that triggers this hook. */
  event: HookEvent;
  /**
   * Optional glob pattern.
   * For `FileChanged` hooks this matches vault-relative file paths.
   * For `PreToolUse` / `PostToolUse` hooks this matches tool names.
   */
  matcher?: string;
  /** Ordered list of handlers to invoke when the hook fires. */
  handlers: HookHandler[];
}

// ---------------------------------------------------------------------------
// Chat types
// ---------------------------------------------------------------------------

/**
 * Parsed result of an `@agent` mention extracted from a chat message.
 */
export interface MentionResult {
  /** Name of the mentioned agent. */
  agentName: string;
  /** Task description that follows the @mention. */
  task: string;
  /** Whether the mention requests background (non-blocking) execution. */
  background: boolean;
  /** The original unmodified message string. */
  originalMessage: string;
}

// ---------------------------------------------------------------------------
// Settings types
// ---------------------------------------------------------------------------

/**
 * Merged Claude settings that Chimera passes to the CLI / SDK at runtime.
 *
 * This is built by combining vault-level, agent-level, and global settings.
 */
export interface ResolvedClaudeSettings {
  /** Tool permission lists. */
  permissions: {
    /** Tools the agent may always use without asking. */
    allow: string[];
    /** Tools the agent may never use. */
    deny: string[];
    /** Tools the agent must ask about before use. */
    ask: string[];
  };
  /** Hooks to register for this session. */
  hooks: HookDefinition[];
  /** Environment variables injected into the Claude process. */
  env: Record<string, string>;
  /** MCP server configurations (shape is SDK-defined). */
  mcpServers: Record<string, unknown>;
}

/**
 * Plugin-level settings persisted in Obsidian's `data.json`.
 *
 * Use {@link DEFAULT_SETTINGS} to obtain a fully-populated default instance.
 */
export interface ChimeraSettings {
  /** How Chimera authenticates with Claude. */
  authMethod: AuthMethod;
  /**
   * Anthropic API key.
   * Only used when `authMethod` is `AuthMethod.APIKey`.
   */
  apiKey: string;
  /** Path to (or name of) the `claude` CLI executable. */
  cliPath: string;
  /** Default permission mode for new sessions. */
  permissionMode: PermissionMode;
  /**
   * Maximum number of tokens to allocate for pinned memory files
   * in each session context window.
   */
  memoryPinnedBudget: number;
  /**
   * Maximum number of tokens to allocate for the memory tree summary
   * (file list) in each session context window.
   */
  memoryTreeBudget: number;
  /** Maximum number of Claude sessions that may run simultaneously. */
  maxConcurrentSessions: number;
  /**
   * Whether the Dream background consolidation process is enabled.
   * When active, Chimera periodically compresses old session summaries.
   */
  dreamEnabled: boolean;
  /**
   * Whether Chimera should automatically update memory files at the end
   * of each session.
   */
  autoMemory: boolean;
  /**
   * The user's preferred display name, injected into agent system prompts
   * where the `{{userName}}` template variable is used.
   */
  userName: string;
  /**
   * Tags that cause vault notes to be excluded from memory and session
   * indexing.
   */
  excludedTags: string[];
  /** Selected Claude model for conversations. */
  model: string;
  /** Effort level for adaptive thinking models. */
  effortLevel: string;
  /** When true, disables file editing tools for Q&A-only conversations. */
  conversationalMode: boolean;
}

/**
 * Fully-populated default settings used when the plugin is first installed
 * or when a settings key is missing from the stored data.
 */
export const DEFAULT_SETTINGS: ChimeraSettings = {
  authMethod: AuthMethod.CLI,
  apiKey: "",
  cliPath: "claude",
  permissionMode: PermissionMode.AskBeforeEdits,
  memoryPinnedBudget: 2000,
  memoryTreeBudget: 500,
  maxConcurrentSessions: 2,
  dreamEnabled: true,
  autoMemory: true,
  userName: "",
  excludedTags: [],
  model: "sonnet",
  effortLevel: "high",
  conversationalMode: false,
};

// ---------------------------------------------------------------------------
// Hook result type
// ---------------------------------------------------------------------------

/**
 * Value returned by a hook handler back to the Chimera hook dispatcher.
 *
 * When `proceed` is `false` the operation that triggered the hook is
 * cancelled. `modifiedInput` allows a handler to rewrite the triggering
 * input (e.g. modify a user prompt before it reaches the model).
 */
export interface HookResult {
  /** Whether the operation should continue after the hook runs. */
  proceed: boolean;
  /**
   * Optionally rewritten input to use instead of the original.
   * Only meaningful for hooks that have an associated input (e.g.
   * `UserPromptSubmit`, `PreToolUse`).
   */
  modifiedInput?: string;
  /** Human-readable error message if `proceed` is `false`. */
  error?: string;
}
