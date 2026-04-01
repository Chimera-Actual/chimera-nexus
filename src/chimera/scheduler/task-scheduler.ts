/**
 * @file Persistent cron-based task scheduler.
 *
 * Loads scheduled task definitions from the vault, evaluates cron expressions,
 * and dispatches tasks when their scheduled time arrives. Task state is
 * persisted as Markdown files with YAML frontmatter under `.claude/tasks/`.
 * Execution logs are written to `.claude/task-logs/`.
 */

import { Vault, normalizePath } from "obsidian";
import { PermissionMode, ScheduledTask } from "../types";
import { parseFrontmatter, stringifyFrontmatter } from "../utils/frontmatter";
import { resolveTemplate } from "../runtime/template-resolver";
import { parseCron } from "./cron-parser";

/** Vault-relative folder where task definition files live. */
const TASKS_FOLDER = ".claude/tasks";

/** Vault-relative folder where execution logs are written. */
const LOGS_FOLDER = ".claude/task-logs";

/**
 * Loads and executes cron-scheduled tasks stored in the vault.
 *
 * Task definitions are markdown files with YAML frontmatter located in
 * `.claude/tasks/`. Each file's stem is used as the task ID.
 */
export class TaskScheduler {
  /**
   * @param vault - The Obsidian Vault instance used for task persistence.
   */
  constructor(private readonly vault: Vault) {}

  /**
   * Reads all enabled scheduled task definitions from the vault.
   *
   * Scans `.claude/tasks/` for `.md` files, parses their frontmatter, and
   * returns only tasks whose `enabled` field is `true`.
   *
   * @returns Array of enabled {@link ScheduledTask} objects.
   */
  async loadTasks(): Promise<ScheduledTask[]> {
    const folderPath = normalizePath(TASKS_FOLDER);
    const folder = this.vault.getAbstractFileByPath(folderPath);

    if (!folder) {
      return [];
    }

    // List all .md files in the tasks folder.
    const files = this.vault.getFiles().filter((f) =>
      f.path.startsWith(folderPath + "/") && f.path.endsWith(".md")
    );

    const tasks: ScheduledTask[] = [];
    for (const file of files) {
      const content = await this.vault.read(file);
      const { frontmatter } = parseFrontmatter(content);
      const task = this.frontmatterToTask(frontmatter, file.path);
      if (task && task.enabled) {
        tasks.push(task);
      }
    }

    return tasks;
  }

  /**
   * Finds a specific scheduled task by its ID.
   *
   * @param id - The task ID to look up (corresponds to the file stem).
   * @returns The matching {@link ScheduledTask}, or `undefined` if not found.
   */
  async getTask(id: string): Promise<ScheduledTask | undefined> {
    const filePath = normalizePath(`${TASKS_FOLDER}/${id}.md`);
    const file = this.vault.getAbstractFileByPath(filePath);
    if (!file) return undefined;

    const { TFile } = await import("obsidian");
    if (!(file instanceof TFile)) return undefined;

    const content = await this.vault.read(file);
    const { frontmatter } = parseFrontmatter(content);
    return this.frontmatterToTask(frontmatter, filePath) ?? undefined;
  }

  /**
   * Persists a scheduled task to the vault as a Markdown file.
   *
   * Writes (or overwrites) `.claude/tasks/{id}.md` with the task's full
   * frontmatter representation.
   *
   * @param task - The {@link ScheduledTask} to save.
   */
  async saveTask(task: ScheduledTask): Promise<void> {
    await this.ensureFolder(TASKS_FOLDER);

    const filePath = normalizePath(`${TASKS_FOLDER}/${task.id}.md`);
    const frontmatter: Record<string, unknown> = {
      id: task.id,
      name: task.name,
      enabled: task.enabled,
      schedule: task.schedule,
      scheduleHuman: task.scheduleHuman,
      model: task.model,
      agent: task.agent,
      permissionMode: task.permissionMode,
      maxDurationSeconds: task.maxDurationSeconds,
      created: task.created,
      lastRun: task.lastRun,
      nextRun: task.nextRun,
      prompt: task.prompt,
      toolAccess: task.toolAccess,
      tags: task.tags,
    };

    const body = "";

    const content = stringifyFrontmatter(frontmatter, body);

    const existing = this.vault.getAbstractFileByPath(filePath);
    if (existing) {
      const { TFile } = await import("obsidian");
      if (existing instanceof TFile) {
        await this.vault.modify(existing, content);
        return;
      }
    }

    await this.vault.create(filePath, content);
  }

  /**
   * Executes a scheduled task immediately.
   *
   * Resolves template variables in the task prompt, calls `executor`, updates
   * `lastRun` and `nextRun` on the task, saves the updated task, and writes an
   * execution log entry to `.claude/task-logs/`.
   *
   * @param task - The task to run.
   * @param executor - Async function that accepts a resolved prompt and agent name,
   *   runs the agent, and returns the output string.
   */
  async runTask(
    task: ScheduledTask,
    executor: (prompt: string, agent: string) => Promise<string>
  ): Promise<void> {
    const resolvedPrompt = resolveTemplate(task.prompt);

    const output = await executor(resolvedPrompt, task.agent);

    const now = new Date();
    task.lastRun = now.toISOString();
    task.nextRun = this.calculateNextRun(task).toISOString();

    await this.saveTask(task);
    await this.writeLog(task, resolvedPrompt, output, now);
  }

  /**
   * Returns all tasks whose `nextRun` timestamp is in the past (overdue).
   *
   * @returns Array of due {@link ScheduledTask} objects.
   */
  async getDueTasks(): Promise<ScheduledTask[]> {
    const tasks = await this.loadTasks();
    const now = new Date();
    return tasks.filter((t) => {
      if (!t.nextRun) return false;
      const next = new Date(t.nextRun);
      return !isNaN(next.getTime()) && next <= now;
    });
  }

  /**
   * Calculates the next run time for a task after the current moment.
   *
   * @param task - The task whose cron schedule should be evaluated.
   * @returns The next {@link Date} at which the task should fire.
   */
  calculateNextRun(task: ScheduledTask): Date {
    const cron = parseCron(task.schedule);
    return cron.nextRun(new Date());
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Converts a parsed frontmatter map into a {@link ScheduledTask}.
   * Returns `null` if required fields are missing.
   */
  private frontmatterToTask(
    fm: Record<string, unknown>,
    filePath: string
  ): ScheduledTask | null {
    // Derive id from the file stem if not present in frontmatter.
    const stemId = filePath.replace(/^.*\//, "").replace(/\.md$/, "");

    const id = typeof fm["id"] === "string" ? fm["id"] : stemId;
    const name = typeof fm["name"] === "string" ? fm["name"] : id;
    const enabled = fm["enabled"] === true;
    const schedule = typeof fm["schedule"] === "string" ? fm["schedule"] : "";
    const scheduleHuman =
      typeof fm["scheduleHuman"] === "string" ? fm["scheduleHuman"] : "";
    const model = typeof fm["model"] === "string" ? fm["model"] : "";
    const agent = typeof fm["agent"] === "string" ? fm["agent"] : "";
    const permissionMode = (
      Object.values(PermissionMode).includes(fm["permissionMode"] as PermissionMode)
        ? fm["permissionMode"]
        : PermissionMode.AskBeforeEdits
    ) as PermissionMode;
    const maxDurationSeconds =
      typeof fm["maxDurationSeconds"] === "number"
        ? fm["maxDurationSeconds"]
        : 300;
    const created = typeof fm["created"] === "string" ? fm["created"] : "";
    const lastRun = typeof fm["lastRun"] === "string" ? fm["lastRun"] : "";
    const nextRun = typeof fm["nextRun"] === "string" ? fm["nextRun"] : "";
    const prompt = typeof fm["prompt"] === "string" ? fm["prompt"] : "";
    const toolAccess = Array.isArray(fm["toolAccess"])
      ? (fm["toolAccess"] as string[]).filter((v) => typeof v === "string")
      : [];
    const tags = Array.isArray(fm["tags"])
      ? (fm["tags"] as string[]).filter((v) => typeof v === "string")
      : [];

    if (!schedule) return null;

    return {
      id,
      name,
      enabled,
      schedule,
      scheduleHuman,
      model,
      agent,
      permissionMode,
      maxDurationSeconds,
      created,
      lastRun,
      nextRun,
      prompt,
      toolAccess,
      tags,
    };
  }

  /** Ensures the given vault-relative folder path exists, creating it if needed. */
  private async ensureFolder(folderPath: string): Promise<void> {
    const normalized = normalizePath(folderPath);
    const existing = this.vault.getAbstractFileByPath(normalized);
    if (!existing) {
      await this.vault.createFolder(normalized);
    }
  }

  /** Writes an execution log entry for a completed task run. */
  private async writeLog(
    task: ScheduledTask,
    resolvedPrompt: string,
    output: string,
    runAt: Date
  ): Promise<void> {
    await this.ensureFolder(LOGS_FOLDER);

    const timestamp = runAt
      .toISOString()
      .replace(/[:.]/g, "-")
      .replace("T", "_")
      .slice(0, 19);
    const logPath = normalizePath(`${LOGS_FOLDER}/${task.id}_${timestamp}.md`);

    const frontmatter: Record<string, unknown> = {
      taskId: task.id,
      taskName: task.name,
      agent: task.agent,
      runAt: runAt.toISOString(),
    };

    const body = [
      "## Prompt\n",
      resolvedPrompt,
      "\n## Output\n",
      output,
    ].join("\n");

    const content = stringifyFrontmatter(frontmatter, body);
    await this.vault.create(logPath, content);
  }
}
