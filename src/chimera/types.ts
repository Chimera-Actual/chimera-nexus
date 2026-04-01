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
};
