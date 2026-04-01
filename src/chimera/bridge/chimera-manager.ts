import type { Vault } from "obsidian";

import { MemoryExtractor } from "../memory/memory-extractor";
import { MemoryInjector } from "../memory/memory-injector";
import { SessionSummarizer } from "../memory/session-summarizer";
import { DreamRunner } from "../memory/dream-runner";
import { LoopScheduler } from "../scheduler/loop-scheduler";
import { TaskScheduler } from "../scheduler/task-scheduler";
import { MissedRunHandler } from "../scheduler/missed-run-handler";
import type { ChimeraMemorySettings, Session } from "../types";
import { DEFAULT_CHIMERA_SETTINGS } from "../types";

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
  private loopScheduler: LoopScheduler;
  private taskScheduler: TaskScheduler;
  private missedRunHandler: MissedRunHandler;
  private dreamRunner: DreamRunner;
  private dreamCheckInterval: number | null = null;
  private settings: ChimeraMemorySettings;
  private vault: Vault;

  // Memory context TTL cache (Fix 1)
  private cachedMemoryContext: string = "";
  private memoryContextCacheTime = 0;
  private static MEMORY_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  // Extraction debounce timers (Fix 2)
  private extractionDebounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(vault: Vault, settings?: Partial<ChimeraMemorySettings>) {
    this.vault = vault;
    this.settings = { ...DEFAULT_CHIMERA_SETTINGS, ...settings };
    // MemoryInjector expects settings with memoryPinnedBudget and memoryTreeBudget
    this.memoryInjector = new MemoryInjector(vault, this.settings as any);
    this.memoryExtractor = new MemoryExtractor(vault);
    this.sessionSummarizer = new SessionSummarizer();
    this.loopScheduler = new LoopScheduler();
    this.taskScheduler = new TaskScheduler(vault);
    this.missedRunHandler = new MissedRunHandler();
    this.dreamRunner = new DreamRunner(vault, this.settings as any);
  }

  /** Pre-loads memory tree, checks missed task runs, and starts dream timer. */
  async initialize(): Promise<void> {
    try {
      await this.memoryInjector.readMemoryTree();
      await this.ensureMemoryStructure();
    } catch (err) {
      console.warn("[Chimera] Failed to initialize memory:", err);
    }

    // Check for missed task runs since last shutdown
    try {
      const tasks = await this.taskScheduler.loadTasks();
      const missed = await this.missedRunHandler.checkMissedRuns(tasks);
      if (missed.length > 0) {
        console.log(`[Chimera] ${missed.length} missed task runs detected`);
      }
    } catch (err) {
      console.warn("[Chimera] Failed to check missed runs:", err);
    }

    // Start periodic dream cycle check (Fix 3: minimum 15 min, skip during active extractions)
    const intervalHours = this.settings.dreamIntervalHours ?? 1;
    if (this.settings.dreamEnabled && intervalHours > 0) {
      const intervalMs = Math.max(intervalHours * 60 * 60 * 1000, 15 * 60 * 1000);
      this.dreamCheckInterval = window.setInterval(async () => {
        // Don't run dream during active extraction operations
        if (this.extractionDebounceTimers.size > 0) return;
        try {
          if (await this.dreamRunner.canRun()) {
            console.log("[Chimera] Starting dream cycle...");
            await this.dreamRunner.run();
            this.invalidateMemoryCache();
            console.log("[Chimera] Dream cycle complete");
          }
        } catch (err) {
          console.warn("[Chimera] Dream cycle failed:", err);
        }
      }, intervalMs);
    }
  }

  /** Returns the memory context string to inject into the system prompt (TTL-cached). */
  async getActiveMemoryContext(): Promise<string> {
    if (!this.settings.memoryEnabled) return "";

    const now = Date.now();
    if (this.cachedMemoryContext && (now - this.memoryContextCacheTime) < ChimeraManager.MEMORY_CACHE_TTL) {
      return this.cachedMemoryContext;
    }

    try {
      this.cachedMemoryContext = await this.memoryInjector.buildMemoryContext();
      this.memoryContextCacheTime = now;
      return this.cachedMemoryContext;
    } catch (err) {
      console.warn("[Chimera] Failed to build memory context:", err);
      return this.cachedMemoryContext; // Return stale cache on error
    }
  }

  /** Force refresh the memory context cache (call after memory writes). */
  invalidateMemoryCache(): void {
    this.memoryContextCacheTime = 0;
  }

  /** Extracts memory signals from a completed conversation (debounced, only last 20 messages). */
  async extractAndStoreMemory(ctx: ConversationContext): Promise<void> {
    if (!this.settings.autoMemory) return;

    // Debounce: only extract 10 seconds after the last save for this conversation
    const existing = this.extractionDebounceTimers.get(ctx.conversationId);
    if (existing) clearTimeout(existing);

    this.extractionDebounceTimers.set(ctx.conversationId, setTimeout(async () => {
      this.extractionDebounceTimers.delete(ctx.conversationId);
      try {
        // Only process the last 20 messages to avoid scanning huge conversations
        const recentMessages = ctx.messages.slice(-20);
        const session: Session = {
          sessionId: ctx.conversationId,
          agent: "",
          title: "",
          created: new Date(ctx.timestamp).toISOString(),
          updated: new Date().toISOString(),
          model: "",
          tokensUsed: 0,
          messageCount: recentMessages.length,
          status: "completed",
          outputFiles: [],
          tags: [],
          messages: recentMessages.map(m => ({
            role: m.role as "user" | "assistant",
            content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
            timestamp: new Date().toISOString(),
          })),
        };
        await this.memoryExtractor.extractFromSession(session);

        // Summarize less frequently -- only if 10+ messages in the full conversation
        if (ctx.messages.length >= 10) {
          const summary = await this.sessionSummarizer.summarize(session);
          await this.sessionSummarizer.saveSummary(this.vault, summary);
        }

        // Invalidate memory cache since we just wrote new memories
        this.invalidateMemoryCache();
      } catch (err) {
        console.warn("[Chimera] Memory extraction failed:", err);
      }
    }, 10000)); // 10 second debounce
  }

  /** Updates settings at runtime (from settings UI). */
  updateSettings(settings: Partial<ChimeraMemorySettings>): void {
    Object.assign(this.settings, settings);
  }

  /** Get the loop scheduler for /loop commands. */
  getLoopScheduler(): LoopScheduler {
    return this.loopScheduler;
  }

  /** Get the task scheduler for /schedule commands. */
  getTaskScheduler(): TaskScheduler {
    return this.taskScheduler;
  }

  /** Manually trigger a dream cycle. */
  async runDream(): Promise<void> {
    if (await this.dreamRunner.canRun()) {
      await this.dreamRunner.run();
    }
  }

  /** Get missed task runs since last startup. */
  async getMissedRuns(): Promise<number> {
    const tasks = await this.taskScheduler.loadTasks();
    const missed = await this.missedRunHandler.checkMissedRuns(tasks);
    return missed.length;
  }

  /** Cleanup on plugin unload. */
  async cleanup(): Promise<void> {
    this.loopScheduler.cancelAll();
    if (this.dreamCheckInterval !== null) {
      clearInterval(this.dreamCheckInterval);
      this.dreamCheckInterval = null;
    }
    // Clear any pending extraction debounce timers (Fix 5)
    for (const timer of this.extractionDebounceTimers.values()) {
      clearTimeout(timer);
    }
    this.extractionDebounceTimers.clear();
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
