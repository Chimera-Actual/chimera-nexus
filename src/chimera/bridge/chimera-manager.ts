import { Vault } from "obsidian";
import { MemoryInjector } from "../memory/memory-injector";
import { MemoryExtractor } from "../memory/memory-extractor";
import { SessionSummarizer } from "../memory/session-summarizer";
import { ChimeraMemorySettings, DEFAULT_CHIMERA_SETTINGS, Session } from "../types";

/**
 * Context passed to the memory extractor after a conversation ends.
 */
export interface ConversationContext {
  conversationId: string;
  messages: Array<{ role: string; content: string }>;
  sessionId: string | null;
  timestamp: number;
}

/**
 * Central coordinator for all Chimera Nexus features.
 * Acts as the bridge between Claudian's plugin lifecycle and Chimera's modules.
 */
export class ChimeraManager {
  private memoryInjector: MemoryInjector;
  private memoryExtractor: MemoryExtractor;
  private sessionSummarizer: SessionSummarizer;
  private settings: ChimeraMemorySettings;
  private vault: Vault;

  constructor(vault: Vault, settings?: Partial<ChimeraMemorySettings>) {
    this.vault = vault;
    this.settings = { ...DEFAULT_CHIMERA_SETTINGS, ...settings };
    // MemoryInjector expects settings with memoryPinnedBudget and memoryTreeBudget
    this.memoryInjector = new MemoryInjector(vault, this.settings as any);
    this.memoryExtractor = new MemoryExtractor(vault);
    this.sessionSummarizer = new SessionSummarizer();
  }

  /** Pre-loads memory tree for fast first-query context. */
  async initialize(): Promise<void> {
    try {
      await this.memoryInjector.readMemoryTree();
      await this.ensureMemoryStructure();
    } catch (err) {
      console.warn("[Chimera] Failed to initialize memory:", err);
    }
  }

  /** Returns the memory context string to inject into the system prompt. */
  async getActiveMemoryContext(): Promise<string> {
    if (!this.settings.memoryEnabled) return "";
    try {
      return await this.memoryInjector.buildMemoryContext();
    } catch (err) {
      console.warn("[Chimera] Failed to build memory context:", err);
      return "";
    }
  }

  /** Extracts memory signals from a completed conversation. */
  async extractAndStoreMemory(ctx: ConversationContext): Promise<void> {
    if (!this.settings.autoMemory) return;
    try {
      const session: Session = {
        sessionId: ctx.conversationId,
        agent: "",
        title: "",
        created: new Date(ctx.timestamp).toISOString(),
        updated: new Date().toISOString(),
        model: "",
        tokensUsed: 0,
        messageCount: ctx.messages.length,
        status: "completed",
        outputFiles: [],
        tags: [],
        messages: ctx.messages.map(m => ({
          role: m.role as "user" | "assistant",
          content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
          timestamp: new Date().toISOString(),
        })),
      };
      await this.memoryExtractor.extractFromSession(session);
      const summary = await this.sessionSummarizer.summarize(session);
      await this.sessionSummarizer.saveSummary(this.vault, summary);
    } catch (err) {
      console.warn("[Chimera] Memory extraction failed:", err);
    }
  }

  /** Updates settings at runtime (from settings UI). */
  updateSettings(settings: Partial<ChimeraMemorySettings>): void {
    Object.assign(this.settings, settings);
  }

  /** Cleanup on plugin unload. */
  async cleanup(): Promise<void> {
    // Future: stop background scheduler, release resources
  }

  /** Ensures the .claude/memory/ directory structure exists. */
  private async ensureMemoryStructure(): Promise<void> {
    const dirs = [
      ".claude",
      ".claude/memory",
      ".claude/memory/system",
      ".claude/memory/knowledge",
      ".claude/memory/reflections",
      ".claude/memory/sessions",
    ];
    for (const dir of dirs) {
      try {
        const exists = await this.vault.adapter.exists(dir);
        if (!exists) {
          await this.vault.createFolder(dir);
        }
      } catch {
        // Directory may already exist
      }
    }

    // Create starter memory files if they don't exist
    const starterFiles = [
      {
        path: ".claude/memory/system/identity.md",
        content: "---\ndescription: Agent identity and persona\nmemtype: system\npinned: true\ntags:\n  - chimera/memory\n---\n\n# Identity\n\nDescribe your agent's persona and working style here.\n",
      },
      {
        path: ".claude/memory/system/human.md",
        content: "---\ndescription: Facts about the user\nmemtype: system\npinned: true\n---\n\n# Human\n\nRecord facts about the user: name, role, preferences.\n",
      },
      {
        path: ".claude/memory/system/vault-conventions.md",
        content: "---\ndescription: Vault structure rules and naming conventions\nmemtype: system\npinned: true\n---\n\n# Vault Conventions\n\nDocument folder structure, naming rules, and tag taxonomy.\n",
      },
    ];

    for (const file of starterFiles) {
      try {
        const exists = await this.vault.adapter.exists(file.path);
        if (!exists) {
          await this.vault.adapter.write(file.path, file.content);
        }
      } catch {
        // File creation may fail if parent dir doesn't exist
      }
    }
  }
}
