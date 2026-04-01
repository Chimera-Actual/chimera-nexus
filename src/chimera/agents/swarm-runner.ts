/**
 * @file Multi-agent orchestration with dependency waves and vault-file coordination.
 *
 * Executes a swarm manifest that describes multiple agents running in
 * dependency-ordered waves, coordinating their outputs through vault files.
 *
 * Ported from chimera-nexus v1. BackgroundManager is imported from the same
 * agents/ directory (sibling module). No concrete imports from outside chimera/.
 */

import { Vault, normalizePath } from "obsidian";
import { BackgroundManager } from "./background-manager";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Overall status for a swarm run or individual task/wave. */
type RunStatus = "pending" | "running" | "completed" | "failed";

/**
 * A single agent task within a swarm wave.
 */
export interface SwarmTask {
  /** Unique task identifier within the manifest. */
  id: string;
  /** Name of the agent to invoke. */
  agent: string;
  /** Prompt sent to the agent. */
  prompt: string;
  /** IDs of tasks (from any preceding wave) that must complete first. */
  dependsOn: string[];
  /** Vault-relative path where the task output is written. */
  outputFile: string;
  /** Current lifecycle state of the task. */
  status: RunStatus;
  /** Full text response from the agent on success. */
  result?: string;
  /** Error message when status is `"failed"`. */
  error?: string;
}

/**
 * A single dependency wave containing one or more concurrent tasks.
 */
export interface SwarmWave {
  /** Zero-based wave index. */
  id: number;
  /** Tasks that execute concurrently within this wave. */
  agents: SwarmTask[];
  /** Current lifecycle state of the wave. */
  status: RunStatus;
}

/**
 * Declarative description of a multi-agent swarm run.
 */
export interface SwarmManifest {
  /** Unique run identifier (date-name slug). */
  id: string;
  /** Human-readable display name. */
  name: string;
  /** Short description of what the swarm accomplishes. */
  description: string;
  /** Ordered dependency waves produced by topological sort. */
  waves: SwarmWave[];
  /** Current lifecycle state of the swarm. */
  status: RunStatus;
  /** ISO-8601 timestamp when the manifest was created. */
  createdAt: string;
  /** ISO-8601 timestamp when the swarm finished (success or failure). */
  completedAt?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SWARM_RUNS_BASE = ".claude/swarm-runs";
const MANIFEST_FILE = "_manifest.json";

// ---------------------------------------------------------------------------
// SwarmRunner
// ---------------------------------------------------------------------------

/**
 * Orchestrates multi-agent swarm execution from a declarative manifest.
 *
 * Tasks are sorted into dependency waves and each wave executes concurrently.
 * Inter-wave ordering is strictly enforced: wave N does not start until every
 * task in wave N-1 has reached a terminal state. Task outputs are written to
 * the vault paths specified in the manifest so downstream waves can read them.
 */
export class SwarmRunner {
  /**
   * @param vault - Obsidian Vault instance used to persist manifests and outputs.
   * @param backgroundManager - Manager used to dispatch individual agent tasks.
   */
  constructor(
    private readonly vault: Vault,
    private readonly backgroundManager: BackgroundManager
  ) {}

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Executes a swarm manifest, running agents in dependency-ordered waves.
   *
   * For each wave all tasks are submitted to {@link BackgroundManager} in
   * parallel, then the runner polls until every task in the wave reaches a
   * terminal state. On wave failure the swarm is aborted and the manifest
   * returned with `status: "failed"`.
   *
   * @param manifest - Swarm manifest describing agents, tasks, and dependencies.
   * @returns The updated manifest reflecting final task and swarm statuses.
   */
  async runSwarm(manifest: SwarmManifest): Promise<SwarmManifest> {
    // 1. Create the swarm run directory and write the initial manifest.
    const runDir = normalizePath(`${SWARM_RUNS_BASE}/${manifest.id}`);
    await this.ensureDir(runDir);

    manifest.status = "running";
    await this.writeManifest(runDir, manifest);

    // 2. Process waves sequentially.
    for (const wave of manifest.waves) {
      wave.status = "running";
      await this.writeManifest(runDir, manifest);

      // Submit all tasks in the wave concurrently.
      const jobIds: Map<string, string> = new Map(); // taskId -> jobId
      const submitErrors: Map<string, string> = new Map(); // taskId -> error

      await Promise.all(
        wave.agents.map(async (task) => {
          task.status = "running";
          try {
            const jobId = await this.backgroundManager.submitByName(
              task.agent,
              task.prompt
            );
            jobIds.set(task.id, jobId);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            submitErrors.set(task.id, msg);
            task.status = "failed";
            task.error = msg;
          }
        })
      );

      // Poll until all submitted tasks reach a terminal state.
      const pendingIds = Array.from(jobIds.keys());
      await this.waitForTasks(pendingIds, jobIds, wave.agents);

      // Collect results / errors and write outputs to the vault.
      let waveFailed = submitErrors.size > 0;

      for (const task of wave.agents) {
        if (task.status === "failed") {
          waveFailed = true;
          continue;
        }

        const jobId = jobIds.get(task.id);
        if (jobId === undefined) {
          continue;
        }

        const job = this.backgroundManager.getStatus(jobId);
        if (!job) {
          task.status = "failed";
          task.error = "Job record not found after completion";
          waveFailed = true;
          continue;
        }

        if (job.status === "completed") {
          task.status = "completed";
          task.result = job.result ?? "";

          // Write task output to its designated vault path.
          const outputPath = normalizePath(
            `${runDir}/${task.outputFile}`
          );
          await this.ensureParentDir(outputPath);
          try {
            await this.vault.adapter.write(outputPath, task.result);
          } catch (writeErr) {
            console.warn(
              `[SwarmRunner] Failed to write output for task "${task.id}" at "${outputPath}":`,
              writeErr
            );
          }
        } else {
          task.status = "failed";
          task.error = job.error ?? "Task failed without an error message";
          waveFailed = true;
        }
      }

      if (waveFailed) {
        wave.status = "failed";
        manifest.status = "failed";
        manifest.completedAt = new Date().toISOString();
        await this.writeManifest(runDir, manifest);
        return manifest;
      }

      wave.status = "completed";
      await this.writeManifest(runDir, manifest);
    }

    // 3. All waves completed successfully.
    manifest.status = "completed";
    manifest.completedAt = new Date().toISOString();
    await this.writeManifest(runDir, manifest);
    return manifest;
  }

  /**
   * Builds a {@link SwarmManifest} from a flat task list by sorting tasks into
   * dependency waves via topological sort.
   *
   * Tasks with no dependencies are placed in wave 0. Tasks that depend on
   * wave-0 tasks go in wave 1, and so on. The manifest is not persisted here;
   * call {@link runSwarm} to execute it.
   *
   * @param name - Human-readable name for the swarm.
   * @param tasks - Flat list of tasks with optional `dependsOn` arrays.
   * @returns A fully-populated manifest ready for {@link runSwarm}.
   * @throws {Error} If the task graph contains a dependency cycle.
   */
  createManifest(
    name: string,
    tasks: Array<{
      agent: string;
      prompt: string;
      dependsOn?: string[];
      outputFile: string;
    }>
  ): SwarmManifest {
    // Assign stable IDs to each task.
    const swarmTasks: SwarmTask[] = tasks.map((t, idx) => ({
      id: `task-${idx}`,
      agent: t.agent,
      prompt: t.prompt,
      dependsOn: t.dependsOn ?? [],
      outputFile: t.outputFile,
      status: "pending",
    }));

    const waves = this.topologicalSort(swarmTasks);

    const dateSlug = new Date()
      .toISOString()
      .slice(0, 10)
      .replace(/-/g, "");
    const nameSlug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    const id = `${dateSlug}-${nameSlug}`;

    return {
      id,
      name,
      description: "",
      waves,
      status: "pending",
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Reads the persisted manifest for the given swarm run ID.
   *
   * @param id - Swarm run ID (matches the manifest's `id` field).
   * @returns The parsed manifest, or `null` if no run with that ID exists.
   */
  async getSwarmStatus(id: string): Promise<SwarmManifest | null> {
    const manifestPath = normalizePath(
      `${SWARM_RUNS_BASE}/${id}/${MANIFEST_FILE}`
    );
    const exists = await this.vault.adapter.exists(manifestPath);
    if (!exists) {
      return null;
    }
    try {
      const raw = await this.vault.adapter.read(manifestPath);
      return JSON.parse(raw) as SwarmManifest;
    } catch {
      return null;
    }
  }

  /**
   * Lists all swarm runs recorded under `.claude/swarm-runs/`.
   *
   * @returns Summary records for every swarm run that has a readable manifest.
   */
  async listSwarms(): Promise<
    Array<{ id: string; name: string; status: string; createdAt: string }>
  > {
    const baseExists = await this.vault.adapter.exists(SWARM_RUNS_BASE);
    if (!baseExists) {
      return [];
    }

    let listing: { files: string[]; folders: string[] };
    try {
      listing = await this.vault.adapter.list(SWARM_RUNS_BASE);
    } catch {
      return [];
    }

    const results: Array<{
      id: string;
      name: string;
      status: string;
      createdAt: string;
    }> = [];

    for (const folder of listing.folders) {
      const folderName = folder.split("/").pop() ?? folder;
      const manifestPath = normalizePath(
        `${SWARM_RUNS_BASE}/${folderName}/${MANIFEST_FILE}`
      );
      try {
        const exists = await this.vault.adapter.exists(manifestPath);
        if (!exists) continue;
        const raw = await this.vault.adapter.read(manifestPath);
        const manifest = JSON.parse(raw) as SwarmManifest;
        results.push({
          id: manifest.id,
          name: manifest.name,
          status: manifest.status,
          createdAt: manifest.createdAt,
        });
      } catch {
        // Skip unreadable or malformed manifests.
      }
    }

    return results;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Sorts a flat list of tasks into sequential dependency waves.
   *
   * Uses a level-based topological sort: each task is assigned to the lowest
   * wave index that satisfies all its `dependsOn` constraints.
   *
   * @param tasks - Tasks with `id` and `dependsOn` populated.
   * @returns Ordered array of {@link SwarmWave} objects.
   * @throws {Error} If a dependency references an unknown task ID.
   * @throws {Error} If the dependency graph contains a cycle.
   */
  private topologicalSort(tasks: SwarmTask[]): SwarmWave[] {
    const taskById = new Map<string, SwarmTask>(tasks.map((t) => [t.id, t]));

    // Validate dependency references.
    for (const task of tasks) {
      for (const dep of task.dependsOn) {
        if (!taskById.has(dep)) {
          throw new Error(
            `[SwarmRunner] Task "${task.id}" depends on unknown task "${dep}"`
          );
        }
      }
    }

    // Assign each task to a wave level using memoised DFS.
    const level = new Map<string, number>();
    const visiting = new Set<string>(); // cycle detection

    const getLevel = (id: string): number => {
      if (level.has(id)) return level.get(id)!;
      if (visiting.has(id)) {
        throw new Error(
          `[SwarmRunner] Dependency cycle detected involving task "${id}"`
        );
      }
      visiting.add(id);
      const task = taskById.get(id)!;
      let maxDepLevel = -1;
      for (const dep of task.dependsOn) {
        maxDepLevel = Math.max(maxDepLevel, getLevel(dep));
      }
      visiting.delete(id);
      const l = maxDepLevel + 1;
      level.set(id, l);
      return l;
    };

    for (const task of tasks) {
      getLevel(task.id);
    }

    // Group tasks by level into waves.
    const waveMap = new Map<number, SwarmTask[]>();
    for (const task of tasks) {
      const l = level.get(task.id)!;
      if (!waveMap.has(l)) waveMap.set(l, []);
      waveMap.get(l)!.push(task);
    }

    // Sort wave keys and build the output.
    const sortedLevels = Array.from(waveMap.keys()).sort((a, b) => a - b);
    return sortedLevels.map((l) => ({
      id: l,
      agents: waveMap.get(l)!,
      status: "pending" as RunStatus,
    }));
  }

  /**
   * Polls the background manager until every task in `taskIds` has reached a
   * terminal state (`"completed"`, `"failed"`, or `"cancelled"`).
   *
   * @param taskIds - SwarmTask IDs to wait for (subset of `wave.agents`).
   * @param jobIds - Map from task ID to background job ID.
   * @param waveTasks - Full wave task list (mutated to reflect final status).
   */
  private async waitForTasks(
    taskIds: string[],
    jobIds: Map<string, string>,
    waveTasks: SwarmTask[]
  ): Promise<void> {
    const terminal = new Set(["completed", "failed", "cancelled"]);
    const taskById = new Map<string, SwarmTask>(
      waveTasks.map((t) => [t.id, t])
    );

    const pending = new Set(taskIds);
    while (pending.size > 0) {
      for (const taskId of Array.from(pending)) {
        const jobId = jobIds.get(taskId);
        if (jobId === undefined) {
          pending.delete(taskId);
          continue;
        }
        const job = this.backgroundManager.getStatus(jobId);
        if (job && terminal.has(job.status)) {
          const task = taskById.get(taskId);
          if (task) {
            if (job.status === "completed") {
              task.status = "completed";
              task.result = job.result;
            } else {
              task.status = "failed";
              task.error = job.error ?? `Job ended with status "${job.status}"`;
            }
          }
          pending.delete(taskId);
        }
      }
      if (pending.size > 0) {
        // Brief yield to avoid tight-spin; keeps the event loop responsive.
        await new Promise<void>((resolve) => setTimeout(resolve, 200));
      }
    }
  }

  /**
   * Writes the current manifest to `{runDir}/_manifest.json`.
   *
   * @param runDir - Normalised vault-relative path to the swarm run directory.
   * @param manifest - Manifest to serialise.
   */
  private async writeManifest(
    runDir: string,
    manifest: SwarmManifest
  ): Promise<void> {
    const path = normalizePath(`${runDir}/${MANIFEST_FILE}`);
    await this.vault.adapter.write(path, JSON.stringify(manifest, null, 2));
  }

  /**
   * Ensures a directory exists, creating it if necessary.
   *
   * @param dir - Vault-relative directory path.
   */
  private async ensureDir(dir: string): Promise<void> {
    const exists = await this.vault.adapter.exists(dir);
    if (!exists) {
      await this.vault.adapter.mkdir(dir);
    }
  }

  /**
   * Ensures the parent directory of the given file path exists.
   *
   * @param filePath - Vault-relative file path whose parent directory to create.
   */
  private async ensureParentDir(filePath: string): Promise<void> {
    const parts = filePath.split("/");
    if (parts.length > 1) {
      const parent = parts.slice(0, -1).join("/");
      await this.ensureDir(parent);
    }
  }
}
