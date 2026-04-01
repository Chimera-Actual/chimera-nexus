/**
 * @file Memory-related type definitions for Chimera memory modules.
 *
 * Extracted from chimera-nexus v1 core types. Self-contained within
 * src/chimera/ -- no upstream dependencies.
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
 * Controls how permissively the agent is allowed to execute tool calls.
 */
export enum PermissionMode {
  AskBeforeEdits = "default",
  EditAutomatically = "acceptEdits",
  Plan = "plan",
  BypassPermissions = "bypassPermissions",
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

// ---------------------------------------------------------------------------
// Scheduled / Loop task types
// ---------------------------------------------------------------------------

/**
 * A task that fires on a cron schedule.
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
// Tool permission types
// ---------------------------------------------------------------------------

/**
 * Merged Claude settings that Chimera passes to the CLI / SDK at runtime.
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
  /** Environment variables injected into the Claude process. */
  env: Record<string, string>;
  /** MCP server configurations (shape is SDK-defined). */
  mcpServers: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Chimera memory settings
// ---------------------------------------------------------------------------

/**
 * Settings relevant to the Chimera memory subsystem.
 */
export interface ChimeraMemorySettings {
  /** Whether vault-native memory injection is enabled. */
  memoryEnabled: boolean;
  /** Maximum tokens allocated to pinned memory files per session. */
  memoryPinnedBudget: number;
  /** Maximum tokens allocated to the memory tree index per session. */
  memoryTreeBudget: number;
  /** Whether to automatically extract memory signals after each session. */
  autoMemory: boolean;
  /** Whether the Dream background consolidation process is enabled. */
  dreamEnabled: boolean;
  /** How often (in hours) to check whether a dream cycle should run. 0 = disabled. */
  dreamIntervalHours: number;
}

/**
 * Fully-populated defaults for {@link ChimeraMemorySettings}.
 */
export const DEFAULT_CHIMERA_SETTINGS: ChimeraMemorySettings = {
  memoryEnabled: true,
  memoryPinnedBudget: 2000,
  memoryTreeBudget: 500,
  autoMemory: true,
  dreamEnabled: true,
  dreamIntervalHours: 1,
};

// ---------------------------------------------------------------------------
// Agent definition types
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
