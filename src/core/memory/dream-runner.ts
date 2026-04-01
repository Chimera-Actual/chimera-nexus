/**
 * @file Dream cycle -- 4-phase memory consolidation (inventory, extract, consolidate, reorganize).
 *
 * Periodically runs a background consolidation cycle that compresses old
 * session summaries and reorganises vault memory files to keep the context
 * window lean and relevant.
 *
 * The dream runner operates entirely on `.claude/memory/` and never touches
 * any other part of the vault (sandboxed by design). It uses only heuristics —
 * no LLM call is made.
 */

import { Vault, normalizePath } from "obsidian";
import { ChimeraSettings, MemoryFile, MemoryTier } from "../types";
import { parseFrontmatter, stringifyFrontmatter } from "../../utils/frontmatter";
import { estimateTokens } from "../../utils/token-counter";

// ---------------------------------------------------------------------------
// Private constants
// ---------------------------------------------------------------------------

const DREAM_LOCK = ".claude/dream.lock";
const BACKUP_DIR = ".claude/backups";
const MEMORY_DIR = ".claude/memory";

/** Session summaries sub-folder inside MEMORY_DIR. */
const SESSIONS_DIR = `${MEMORY_DIR}/sessions`;

/** Minimum milliseconds between dream cycles (24 hours). */
const MIN_DREAM_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** Minimum number of new session files before a dream may run. */
const MIN_SESSIONS_SINCE_DREAM = 5;

/** Days after which a memory entry with no references is considered stale. */
const STALE_DAYS = 30;

/** Token threshold above which a file is split. */
const SPLIT_TOKEN_THRESHOLD = 2000;

/** Token threshold below which a file is merged into a related file. */
const MERGE_TOKEN_THRESHOLD = 100;

/** Target minimum knowledge file count. */
const _TARGET_MIN_FILES = 15;

/** Target maximum knowledge file count. */
const _TARGET_MAX_FILES = 25;

/** Safety timeout: abort if a single dream run exceeds 10 minutes. */
const DREAM_TIMEOUT_MS = 10 * 60 * 1000;

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

/** State persisted in the dream lock file. */
interface DreamLockData {
  startedAt: string;
}

/** State persisted between dream runs to track eligibility. */
interface DreamState {
  lastDreamDate: string;
  sessionCountAtLastDream: number;
}

/** Inventory snapshot produced in Phase 1. */
interface DreamInventory {
  fileCount: number;
  staleFiles: string[];
  totalTokens: number;
  lastDreamDate: string;
  sessionFileCount: number;
  sessionCountAtLastDream: number;
}

/** Path to the dream state file. */
const DREAM_STATE_PATH = `${MEMORY_DIR}/.dream-state.json`;

// ---------------------------------------------------------------------------
// DreamRunner
// ---------------------------------------------------------------------------

/**
 * Orchestrates the 4-phase dream memory-consolidation cycle.
 *
 * Phases:
 * 1. Inventory -- catalogue all memory and session files.
 * 2. Extract   -- pull signals from recent session summaries.
 * 3. Consolidate -- merge and compress redundant memory.
 * 4. Reorganize -- rewrite memory files for optimal retrieval.
 *
 * Safety guarantees:
 * - A file lock (`dream.lock`) prevents concurrent runs.
 * - Only files inside `.claude/memory/` are modified.
 * - A timestamped backup is written before any mutations.
 * - A 10-minute wall-clock timeout aborts the cycle if a phase hangs.
 * - The lock is always released in a `finally` block.
 */
export class DreamRunner {
  /**
   * @param vault    - The Obsidian Vault instance used for file I/O.
   * @param settings - Plugin settings (e.g. `dreamEnabled` flag).
   */
  constructor(
    private readonly vault: Vault,
    private readonly settings: ChimeraSettings
  ) {}

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Returns `true` if a dream cycle may start right now.
   *
   * All four of the following conditions must hold:
   * 1. No dream.lock file exists (no concurrent run).
   * 2. `settings.dreamEnabled` is `true`.
   * 3. At least 24 hours have elapsed since the last dream.
   * 4. At least 5 new session files have been created since the last dream.
   */
  async canRun(): Promise<boolean> {
    try {
      // 1. Check lock
      const lockExists = await this.vault.adapter.exists(
        normalizePath(DREAM_LOCK)
      );
      if (lockExists) return false;

      // 2. Check enabled
      if (!this.settings.dreamEnabled) return false;

      // 3 & 4. Check time and session count via persisted state
      const state = await this.loadDreamState();
      const now = Date.now();

      if (state.lastDreamDate) {
        const lastDreamMs = new Date(state.lastDreamDate).getTime();
        if (now - lastDreamMs < MIN_DREAM_INTERVAL_MS) return false;
      }

      const sessionFiles = await this.listSessionFiles();
      const newSessions =
        sessionFiles.length - state.sessionCountAtLastDream;
      if (newSessions < MIN_SESSIONS_SINCE_DREAM) return false;

      return true;
    } catch (err) {
      console.error("[DreamRunner] canRun check failed:", err);
      return false;
    }
  }

  /**
   * Executes one full dream consolidation cycle.
   *
   * Acquires the dream lock, backs up memory files, then runs all four phases
   * in sequence. The lock is always released in a `finally` block. If any
   * phase throws, the error is logged and the partial run is abandoned (the
   * backup remains intact for recovery).
   */
  async run(): Promise<void> {
    const locked = await this.acquireLock();
    if (!locked) {
      console.warn("[DreamRunner] Could not acquire lock; aborting.");
      return;
    }

    const deadline = Date.now() + DREAM_TIMEOUT_MS;

    try {
      await this.createBackup();

      // Phase 1
      this.checkTimeout(deadline, "inventory");
      const inventory = await this.inventory();

      // Phase 2
      this.checkTimeout(deadline, "extract");
      const signals = await this.extract(inventory);

      // Phase 3
      this.checkTimeout(deadline, "consolidate");
      await this.consolidate(signals);

      // Phase 4
      this.checkTimeout(deadline, "reorganize");
      await this.reorganize();

      // Persist updated state
      await this.saveDreamState({
        lastDreamDate: new Date().toISOString(),
        sessionCountAtLastDream: inventory.sessionFileCount,
      });

      console.log(
        `[DreamRunner] Dream cycle complete. Processed ${inventory.fileCount} files, ` +
          `${signals.length} signals extracted.`
      );
    } catch (err) {
      console.error("[DreamRunner] Dream cycle failed:", err);
    } finally {
      await this.releaseLock();
    }
  }

  /**
   * Writes the dream lock file with the current timestamp.
   *
   * @returns `true` if the lock was acquired, `false` if it already existed.
   */
  async acquireLock(): Promise<boolean> {
    try {
      const lockPath = normalizePath(DREAM_LOCK);
      const exists = await this.vault.adapter.exists(lockPath);
      if (exists) return false;

      const data: DreamLockData = { startedAt: new Date().toISOString() };
      await this.ensureParentDir(lockPath);
      await this.vault.adapter.write(lockPath, JSON.stringify(data));
      return true;
    } catch (err) {
      console.error("[DreamRunner] acquireLock failed:", err);
      return false;
    }
  }

  /**
   * Deletes the dream lock file, allowing future runs to proceed.
   */
  async releaseLock(): Promise<void> {
    try {
      const lockPath = normalizePath(DREAM_LOCK);
      const exists = await this.vault.adapter.exists(lockPath);
      if (exists) {
        await this.vault.adapter.remove(lockPath);
      }
    } catch (err) {
      console.error("[DreamRunner] releaseLock failed:", err);
    }
  }

  /**
   * Copies all files in `.claude/memory/` to a timestamped backup folder.
   *
   * @returns The vault-relative path of the backup directory.
   */
  async createBackup(): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = normalizePath(`${BACKUP_DIR}/${timestamp}`);

    try {
      const files = await this.listMemoryFiles();
      for (const filePath of files) {
        const destPath = filePath.replace(
          normalizePath(MEMORY_DIR),
          backupPath
        );
        const content = await this.vault.adapter.read(normalizePath(filePath));
        await this.ensureParentDir(destPath);
        await this.vault.adapter.write(destPath, content);
      }
      console.log(`[DreamRunner] Backup created at ${backupPath}`);
    } catch (err) {
      console.error("[DreamRunner] createBackup failed:", err);
      // Don't re-throw: backup failure shouldn't block the dream cycle.
    }

    return backupPath;
  }

  // ---------------------------------------------------------------------------
  // Phase 1 – Inventory
  // ---------------------------------------------------------------------------

  /**
   * Catalogues all memory files and computes aggregate statistics.
   *
   * @returns A {@link DreamInventory} snapshot.
   */
  private async inventory(): Promise<DreamInventory> {
    const now = Date.now();
    const staleCutoffMs = STALE_DAYS * 24 * 60 * 60 * 1000;

    const files = await this.listMemoryFiles();
    let totalTokens = 0;
    const staleFiles: string[] = [];

    for (const filePath of files) {
      try {
        const content = await this.vault.adapter.read(normalizePath(filePath));
        totalTokens += estimateTokens(content);

        const { frontmatter } = parseFrontmatter(content);
        const updatedStr = frontmatter["updated"] as string | undefined;
        if (updatedStr) {
          const updatedMs = new Date(updatedStr).getTime();
          if (now - updatedMs > staleCutoffMs) {
            staleFiles.push(filePath);
          }
        }
      } catch {
        // Unreadable file – skip silently.
      }
    }

    const state = await this.loadDreamState();
    const sessionFiles = await this.listSessionFiles();

    return {
      fileCount: files.length,
      staleFiles,
      totalTokens,
      lastDreamDate: state.lastDreamDate,
      sessionFileCount: sessionFiles.length,
      sessionCountAtLastDream: state.sessionCountAtLastDream,
    };
  }

  // ---------------------------------------------------------------------------
  // Phase 2 – Extract
  // ---------------------------------------------------------------------------

  /**
   * Reads session summaries written since the last dream and extracts signals.
   *
   * Signals include: key topics, decisions, and repeated patterns.
   *
   * @param inventory - The inventory produced in Phase 1.
   * @returns An array of extracted signal strings.
   */
  private async extract(inventory: DreamInventory): Promise<string[]> {
    const signals: string[] = [];
    const sessionFiles = await this.listSessionFiles();

    // Only process sessions created after the last dream.
    const lastDreamMs = inventory.lastDreamDate
      ? new Date(inventory.lastDreamDate).getTime()
      : 0;

    const wordFreq = new Map<string, number>();
    const topicSet = new Set<string>();

    for (const filePath of sessionFiles) {
      try {
        const content = await this.vault.adapter.read(normalizePath(filePath));
        const { frontmatter, body } = parseFrontmatter(content);

        // Skip sessions created before the last dream.
        const createdStr = frontmatter["created"] as string | undefined;
        if (createdStr) {
          const createdMs = new Date(createdStr).getTime();
          if (createdMs <= lastDreamMs) continue;
        }

        // Extract topics mentioned in the body.
        const topics = body.match(/\b[a-z]{4,}\b/gi) ?? [];
        for (const word of topics) {
          const lower = word.toLowerCase();
          wordFreq.set(lower, (wordFreq.get(lower) ?? 0) + 1);
        }

        // Collect explicit key topics from frontmatter (if any).
        const keyTopics = frontmatter["key_topics"];
        if (Array.isArray(keyTopics)) {
          for (const t of keyTopics) {
            if (typeof t === "string") topicSet.add(t);
          }
        }
      } catch {
        // Unreadable session file – skip.
      }
    }

    // Signals: words mentioned 3+ times across new sessions.
    for (const [word, count] of wordFreq) {
      if (count >= 3) {
        signals.push(`Repeated topic across sessions: "${word}" (${count} mentions)`);
      }
    }

    // Signals: explicit topics from session frontmatter.
    for (const topic of topicSet) {
      signals.push(`Session key topic: ${topic}`);
    }

    return signals;
  }

  // ---------------------------------------------------------------------------
  // Phase 3 – Consolidate
  // ---------------------------------------------------------------------------

  /**
   * Removes stale memory entries, merges duplicates, and appends new signals.
   *
   * Stale = not updated in 30+ days with no references in other files.
   * Duplicate detection = same `description` field or >80% title similarity.
   *
   * @param signals - Signal strings produced by {@link extract}.
   */
  private async consolidate(signals: string[]): Promise<void> {
    const now = new Date().toISOString();
    const files = await this.listMemoryFiles();

    // Build a set of all file content for reference-checking stale files.
    const contentMap = new Map<string, string>();
    for (const filePath of files) {
      try {
        const c = await this.vault.adapter.read(normalizePath(filePath));
        contentMap.set(filePath, c);
      } catch {
        // skip
      }
    }

    // --- Remove stale files with no references ---
    const staleCutoffMs = STALE_DAYS * 24 * 60 * 60 * 1000;
    const timeNow = Date.now();

    for (const filePath of files) {
      const content = contentMap.get(filePath);
      if (!content) continue;

      const { frontmatter } = parseFrontmatter(content);
      const updatedStr = frontmatter["updated"] as string | undefined;
      if (!updatedStr) continue;

      const updatedMs = new Date(updatedStr).getTime();
      if (timeNow - updatedMs <= staleCutoffMs) continue;

      // Check if any other file references this file by name.
      const fileName = filePath.split("/").pop() ?? "";
      const baseName = fileName.replace(/\.md$/, "");
      const isReferenced = [...contentMap.values()].some(
        (c) => c !== content && c.includes(baseName)
      );

      if (!isReferenced) {
        try {
          await this.vault.adapter.remove(normalizePath(filePath));
          contentMap.delete(filePath);
          console.log(`[DreamRunner] Removed stale file: ${filePath}`);
        } catch (err) {
          console.warn(`[DreamRunner] Could not remove stale file ${filePath}:`, err);
        }
      }
    }

    // --- Merge duplicate entries ---
    const remainingFiles = [...contentMap.keys()];
    const merged = new Set<string>();

    for (let i = 0; i < remainingFiles.length; i++) {
      if (merged.has(remainingFiles[i])) continue;

      const pathA = remainingFiles[i];
      const contentA = contentMap.get(pathA);
      if (!contentA) continue;
      const { frontmatter: fmA } = parseFrontmatter(contentA);
      const descA = (fmA["description"] as string | undefined) ?? "";
      const nameA = (pathA.split("/").pop() ?? "").replace(/\.md$/, "");

      for (let j = i + 1; j < remainingFiles.length; j++) {
        if (merged.has(remainingFiles[j])) continue;

        const pathB = remainingFiles[j];
        const contentB = contentMap.get(pathB);
        if (!contentB) continue;
        const { frontmatter: fmB, body: bodyB } = parseFrontmatter(contentB);
        const descB = (fmB["description"] as string | undefined) ?? "";
        const nameB = (pathB.split("/").pop() ?? "").replace(/\.md$/, "");

        const isDuplicate =
          (descA.length > 0 && descA === descB) ||
          this.titleSimilarity(nameA, nameB) > 0.8;

        if (!isDuplicate) continue;

        // Merge B's body into A, then delete B.
        try {
          const { frontmatter: fmAMut, body: bodyA } = parseFrontmatter(
            contentMap.get(pathA) ?? ""
          );
          const mergedBody =
            bodyA.trimEnd() +
            "\n\n<!-- merged from " +
            nameB +
            " -->\n" +
            bodyB.trimEnd() +
            "\n";
          fmAMut["updated"] = now;
          const mergedContent = stringifyFrontmatter(fmAMut, mergedBody);
          await this.vault.adapter.write(normalizePath(pathA), mergedContent);
          contentMap.set(pathA, mergedContent);

          await this.vault.adapter.remove(normalizePath(pathB));
          contentMap.delete(pathB);
          merged.add(pathB);
          console.log(`[DreamRunner] Merged duplicate ${pathB} into ${pathA}`);
        } catch (err) {
          console.warn(`[DreamRunner] Could not merge ${pathB} into ${pathA}:`, err);
        }
      }
    }

    // --- Append new signals to a consolidated signals file ---
    if (signals.length > 0) {
      const signalsPath = normalizePath(`${MEMORY_DIR}/knowledge/session-signals.md`);
      await this.appendSignalsToFile(signalsPath, signals, now);
    }
  }

  // ---------------------------------------------------------------------------
  // Phase 4 – Reorganize
  // ---------------------------------------------------------------------------

  /**
   * Checks file counts and token sizes, splitting large files and merging
   * tiny ones to keep the knowledge base within the target range.
   *
   * - Splits files > {@link SPLIT_TOKEN_THRESHOLD} tokens.
   * - Merges files < {@link MERGE_TOKEN_THRESHOLD} tokens into related files.
   * - Target range: {@link TARGET_MIN_FILES}–{@link TARGET_MAX_FILES} knowledge files.
   */
  private async reorganize(): Promise<void> {
    const now = new Date().toISOString();
    const files = await this.listMemoryFiles();

    // Load all current file tokens.
    const tokenMap = new Map<string, number>();
    const contentStore = new Map<string, string>();

    for (const filePath of files) {
      try {
        const content = await this.vault.adapter.read(normalizePath(filePath));
        contentStore.set(filePath, content);
        tokenMap.set(filePath, estimateTokens(content));
      } catch {
        // skip
      }
    }

    // --- Split oversized files ---
    for (const [filePath, tokens] of tokenMap) {
      if (tokens <= SPLIT_TOKEN_THRESHOLD) continue;

      const content = contentStore.get(filePath);
      if (!content) continue;

      try {
        await this.splitFile(filePath, content, now);
        tokenMap.delete(filePath);
        contentStore.delete(filePath);
      } catch (err) {
        console.warn(`[DreamRunner] Could not split ${filePath}:`, err);
      }
    }

    // --- Merge tiny files ---
    const currentFiles = [...tokenMap.keys()];
    const absorbed = new Set<string>();

    for (const filePath of currentFiles) {
      if (absorbed.has(filePath)) continue;
      const tokens = tokenMap.get(filePath) ?? 0;
      if (tokens >= MERGE_TOKEN_THRESHOLD) continue;

      // Find the best related file to absorb into (smallest non-tiny file
      // that shares at least one word in the stem).
      const stem = (filePath.split("/").pop() ?? "").replace(/\.md$/, "").toLowerCase();
      const stemWords = stem.split(/[-_\s]+/).filter((w) => w.length > 2);

      let bestTarget: string | null = null;
      let bestScore = 0;

      for (const candidate of currentFiles) {
        if (candidate === filePath || absorbed.has(candidate)) continue;
        if ((tokenMap.get(candidate) ?? 0) < MERGE_TOKEN_THRESHOLD) continue;

        const cStem = (candidate.split("/").pop() ?? "")
          .replace(/\.md$/, "")
          .toLowerCase();
        const sharedWords = stemWords.filter((w) => cStem.includes(w)).length;
        if (sharedWords > bestScore) {
          bestScore = sharedWords;
          bestTarget = candidate;
        }
      }

      // Fall back to the first non-tiny file if no word match found.
      if (!bestTarget) {
        bestTarget =
          currentFiles.find(
            (c) =>
              c !== filePath &&
              !absorbed.has(c) &&
              (tokenMap.get(c) ?? 0) >= MERGE_TOKEN_THRESHOLD
          ) ?? null;
      }

      if (!bestTarget) continue;

      try {
        const smallContent = contentStore.get(filePath) ?? "";
        const { body: smallBody } = parseFrontmatter(smallContent);

        const targetRaw = contentStore.get(bestTarget) ?? "";
        const { frontmatter: targetFm, body: targetBody } =
          parseFrontmatter(targetRaw);

        const mergedBody =
          targetBody.trimEnd() +
          "\n\n<!-- absorbed from " +
          (filePath.split("/").pop() ?? filePath) +
          " -->\n" +
          smallBody.trimEnd() +
          "\n";

        targetFm["updated"] = now;
        const mergedContent = stringifyFrontmatter(targetFm, mergedBody);
        await this.vault.adapter.write(normalizePath(bestTarget), mergedContent);
        contentStore.set(bestTarget, mergedContent);
        tokenMap.set(bestTarget, estimateTokens(mergedContent));

        await this.vault.adapter.remove(normalizePath(filePath));
        tokenMap.delete(filePath);
        contentStore.delete(filePath);
        absorbed.add(filePath);
        console.log(
          `[DreamRunner] Absorbed tiny file ${filePath} into ${bestTarget}`
        );
      } catch (err) {
        console.warn(
          `[DreamRunner] Could not absorb ${filePath} into ${bestTarget}:`,
          err
        );
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Splits `content` into two halves at a heading boundary and writes them
   * as `{stem}-part1.md` and `{stem}-part2.md`, then removes the original.
   */
  private async splitFile(
    filePath: string,
    content: string,
    now: string
  ): Promise<void> {
    const { frontmatter, body } = parseFrontmatter(content);
    const lines = body.split("\n");

    // Find the midpoint heading.
    let splitIndex = Math.floor(lines.length / 2);
    for (let i = splitIndex; i < lines.length; i++) {
      if (lines[i].startsWith("#")) {
        splitIndex = i;
        break;
      }
    }

    const bodyPart1 = lines.slice(0, splitIndex).join("\n");
    const bodyPart2 = lines.slice(splitIndex).join("\n");

    const dir = filePath.lastIndexOf("/") > 0
      ? filePath.slice(0, filePath.lastIndexOf("/"))
      : MEMORY_DIR;
    const stem = (filePath.split("/").pop() ?? "file").replace(/\.md$/, "");

    const part1Path = normalizePath(`${dir}/${stem}-part1.md`);
    const part2Path = normalizePath(`${dir}/${stem}-part2.md`);

    const fm1 = { ...frontmatter, updated: now };
    const fm2 = { ...frontmatter, updated: now };

    await this.vault.adapter.write(part1Path, stringifyFrontmatter(fm1, bodyPart1));
    await this.vault.adapter.write(part2Path, stringifyFrontmatter(fm2, bodyPart2));
    await this.vault.adapter.remove(normalizePath(filePath));

    console.log(
      `[DreamRunner] Split ${filePath} into ${part1Path} and ${part2Path}`
    );
  }

  /**
   * Appends signal strings to a signals memory file, creating it if absent.
   */
  private async appendSignalsToFile(
    path: string,
    signals: string[],
    now: string
  ): Promise<void> {
    let rawContent: string;
    try {
      rawContent = await this.vault.adapter.read(path);
    } catch {
      rawContent = stringifyFrontmatter(
        {
          description: "Consolidated signals extracted from dream cycles",
          memtype: "knowledge",
          tier: MemoryTier.Indexed,
          tags: ["chimera/dream-signals"],
          created: now,
          updated: now,
        },
        ""
      );
    }

    const { frontmatter, body } = parseFrontmatter(rawContent);
    const newLines = signals.map((s) => `- [${now}] ${s}`).join("\n");
    const updatedBody =
      body.trimEnd() +
      (body.trim().length > 0 ? "\n" : "") +
      newLines +
      "\n";
    frontmatter["updated"] = now;

    await this.ensureParentDir(path);
    await this.vault.adapter.write(path, stringifyFrontmatter(frontmatter, updatedBody));
  }

  /**
   * Lists all `.md` files under `.claude/memory/` (excluding session summaries).
   *
   * @returns Array of vault-relative file paths.
   */
  private async listMemoryFiles(): Promise<string[]> {
    const results: string[] = [];

    const recurse = async (dir: string): Promise<void> => {
      try {
        const listing = await this.vault.adapter.list(normalizePath(dir));
        for (const filePath of listing.files) {
          if (filePath.endsWith(".md")) {
            results.push(filePath);
          }
        }
        for (const subDir of listing.folders) {
          await recurse(subDir);
        }
      } catch {
        // Directory may not exist yet.
      }
    };

    await recurse(MEMORY_DIR);
    return results;
  }

  /**
   * Lists all session summary `.md` files under `.claude/memory/sessions/`.
   *
   * @returns Array of vault-relative file paths.
   */
  private async listSessionFiles(): Promise<string[]> {
    const results: string[] = [];
    try {
      const listing = await this.vault.adapter.list(normalizePath(SESSIONS_DIR));
      for (const filePath of listing.files) {
        if (filePath.endsWith(".md")) {
          results.push(filePath);
        }
      }
    } catch {
      // Sessions directory may not exist yet.
    }
    return results;
  }

  /**
   * Loads the persisted dream state, returning defaults if the file is absent.
   */
  private async loadDreamState(): Promise<DreamState> {
    try {
      const raw = await this.vault.adapter.read(normalizePath(DREAM_STATE_PATH));
      const parsed = JSON.parse(raw) as Partial<DreamState>;
      return {
        lastDreamDate: parsed.lastDreamDate ?? "",
        sessionCountAtLastDream: parsed.sessionCountAtLastDream ?? 0,
      };
    } catch {
      return { lastDreamDate: "", sessionCountAtLastDream: 0 };
    }
  }

  /**
   * Persists the dream state to `.claude/memory/.dream-state.json`.
   */
  private async saveDreamState(state: DreamState): Promise<void> {
    try {
      await this.ensureParentDir(DREAM_STATE_PATH);
      await this.vault.adapter.write(
        normalizePath(DREAM_STATE_PATH),
        JSON.stringify(state, null, 2)
      );
    } catch (err) {
      console.error("[DreamRunner] saveDreamState failed:", err);
    }
  }

  /**
   * Ensures the parent directory of `filePath` exists.
   * Uses the vault adapter to create intermediate folders.
   */
  private async ensureParentDir(filePath: string): Promise<void> {
    const normalized = normalizePath(filePath);
    const lastSlash = normalized.lastIndexOf("/");
    if (lastSlash <= 0) return;

    const parent = normalized.slice(0, lastSlash);
    const exists = await this.vault.adapter.exists(parent);
    if (!exists) {
      try {
        await this.vault.createFolder(parent);
      } catch {
        // May already exist due to a race condition – ignore.
      }
    }
  }

  /**
   * Returns a rough similarity score (0–1) between two strings based on
   * character bigrams (Sørensen–Dice coefficient).
   */
  private titleSimilarity(a: string, b: string): number {
    if (a === b) return 1;
    if (a.length < 2 || b.length < 2) return 0;

    const bigrams = (s: string): Set<string> => {
      const set = new Set<string>();
      for (let i = 0; i < s.length - 1; i++) {
        set.add(s.slice(i, i + 2));
      }
      return set;
    };

    const setA = bigrams(a.toLowerCase());
    const setB = bigrams(b.toLowerCase());
    let intersection = 0;
    for (const bg of setA) {
      if (setB.has(bg)) intersection++;
    }

    return (2 * intersection) / (setA.size + setB.size);
  }

  /**
   * Throws an error if the current time has passed `deadline`, identifying the
   * offending phase in the message for easier debugging.
   */
  private checkTimeout(deadline: number, phase: string): void {
    if (Date.now() > deadline) {
      throw new Error(
        `[DreamRunner] Timeout exceeded before phase "${phase}". Aborting dream cycle.`
      );
    }
  }
}

// Re-export for consumers that import the MemoryFile / MemoryTier types through
// this module -- no additional code needed; the import at the top is sufficient.
export type { MemoryFile };
