/**
 * @file Tests for TaskScheduler
 */

import { Vault } from "obsidian";
import { TaskScheduler } from "../../../src/chimera/scheduler/task-scheduler";
import { ScheduledTask, PermissionMode } from "../../../src/chimera/types";

// ---------------------------------------------------------------------------
// Mock Vault factory
// ---------------------------------------------------------------------------

const createMockVault = () =>
  ({
    adapter: {
      exists: jest.fn(),
      read: jest.fn(),
      write: jest.fn(),
      list: jest.fn(),
      mkdir: jest.fn(),
    },
    getFiles: jest.fn().mockReturnValue([]),
    getMarkdownFiles: jest.fn().mockReturnValue([]),
    getAbstractFileByPath: jest.fn().mockReturnValue(null),
    createFolder: jest.fn().mockResolvedValue(undefined),
    create: jest.fn().mockResolvedValue({ path: "", name: "", stat: {} }),
    modify: jest.fn().mockResolvedValue(undefined),
    read: jest.fn().mockResolvedValue(""),
    on: jest.fn(),
  } as unknown as Vault);

/** Build a TFile-like stub using the mock's prototype so instanceof works. */
function makeTFileLike(path: string) {
  const { TFile } = jest.requireMock("obsidian") as typeof import("../../__mocks__/obsidian");
  const f = Object.create(TFile.prototype) as InstanceType<typeof TFile>;
  f.path = path;
  f.name = path.split("/").pop() ?? path;
  return f;
}

function makeTFolderLike(path: string) {
  const { TFolder } = jest.requireMock("obsidian") as typeof import("../../__mocks__/obsidian");
  const f = Object.create(TFolder.prototype) as InstanceType<typeof TFolder>;
  f.path = path;
  f.name = path.split("/").pop() ?? path;
  return f;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTask(overrides: Partial<ScheduledTask> = {}): ScheduledTask {
  return {
    id: "daily-standup",
    name: "Daily Standup",
    enabled: true,
    schedule: "0 9 * * 1-5",
    scheduleHuman: "Weekdays at 9 AM",
    model: "claude-opus-4-5",
    agent: "atlas",
    permissionMode: PermissionMode.AskBeforeEdits,
    maxDurationSeconds: 300,
    created: "2024-01-01T00:00:00.000Z",
    lastRun: "",
    nextRun: "",
    prompt: "Write a standup update",
    toolAccess: [],
    tags: [],
    ...overrides,
  };
}

/** Build a minimal markdown file with YAML frontmatter from a ScheduledTask. */
function taskToMarkdown(task: ScheduledTask): string {
  return [
    "---",
    `id: ${task.id}`,
    `name: ${task.name}`,
    `enabled: ${task.enabled}`,
    `schedule: ${task.schedule}`,
    `scheduleHuman: ${task.scheduleHuman}`,
    `model: ${task.model}`,
    `agent: ${task.agent}`,
    `permissionMode: ${task.permissionMode}`,
    `maxDurationSeconds: ${task.maxDurationSeconds}`,
    `created: ${task.created}`,
    `lastRun: ${task.lastRun || ""}`,
    `nextRun: ${task.nextRun || ""}`,
    `prompt: ${task.prompt}`,
    "toolAccess: []",
    "tags: []",
    "---",
    "",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("TaskScheduler", () => {
  let vault: ReturnType<typeof createMockVault>;
  let scheduler: TaskScheduler;

  beforeEach(() => {
    jest.clearAllMocks();
    vault = createMockVault();
    scheduler = new TaskScheduler(vault);
  });

  // 1. loadTasks returns empty array when no tasks dir
  it("loadTasks returns empty array when tasks folder does not exist", async () => {
    (vault.getAbstractFileByPath as jest.Mock).mockReturnValue(null);

    const tasks = await scheduler.loadTasks();
    expect(tasks).toEqual([]);
  });

  // 2. loadTasks parses task frontmatter correctly
  it("loadTasks parses task frontmatter correctly", async () => {
    const task = makeTask();
    const md = taskToMarkdown(task);

    const mockFolder = makeTFolderLike(".claude/tasks");
    const mockFile = makeTFileLike(".claude/tasks/daily-standup.md");

    (vault.getAbstractFileByPath as jest.Mock).mockImplementation((path: string) => {
      if (path === ".claude/tasks") return mockFolder;
      return null;
    });

    (vault.getFiles as jest.Mock).mockReturnValue([mockFile]);
    (vault.read as jest.Mock).mockResolvedValue(md);

    const tasks = await scheduler.loadTasks();
    expect(tasks).toHaveLength(1);
    expect(tasks[0].id).toBe("daily-standup");
    expect(tasks[0].name).toBe("Daily Standup");
    expect(tasks[0].schedule).toBe("0 9 * * 1-5");
    expect(tasks[0].agent).toBe("atlas");
    expect(tasks[0].enabled).toBe(true);
  });

  // loadTasks skips disabled tasks
  it("loadTasks skips disabled tasks", async () => {
    const disabledTask = makeTask({ id: "disabled-task", enabled: false });
    const md = taskToMarkdown(disabledTask);

    const mockFolder = makeTFolderLike(".claude/tasks");
    const mockFile = makeTFileLike(".claude/tasks/disabled-task.md");

    (vault.getAbstractFileByPath as jest.Mock).mockImplementation((path: string) => {
      if (path === ".claude/tasks") return mockFolder;
      return null;
    });

    (vault.getFiles as jest.Mock).mockReturnValue([mockFile]);
    (vault.read as jest.Mock).mockResolvedValue(md);

    const tasks = await scheduler.loadTasks();
    expect(tasks).toHaveLength(0);
  });

  // 3. saveTask writes markdown with correct frontmatter
  it("saveTask creates a new markdown file with correct frontmatter", async () => {
    const task = makeTask();

    // Folder does not exist (will be created)
    (vault.getAbstractFileByPath as jest.Mock).mockReturnValue(null);

    await scheduler.saveTask(task);

    expect(vault.createFolder).toHaveBeenCalledWith(".claude/tasks");
    expect(vault.create).toHaveBeenCalledTimes(1);

    const [filePath, content] = (vault.create as jest.Mock).mock.calls[0];
    expect(filePath).toBe(".claude/tasks/daily-standup.md");
    expect(content).toContain("id: daily-standup");
    // cron strings containing * are YAML-quoted by stringifyFrontmatter
    expect(content).toContain("0 9 * * 1-5");
    expect(content).toContain("agent: atlas");
  });

  // saveTask modifies existing file
  it("saveTask modifies an existing file if it already exists", async () => {
    const task = makeTask();
    const dynObsidian = await import("obsidian");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existingFile = Object.create((dynObsidian as any).TFile.prototype) as { path: string; name: string };
    existingFile.path = ".claude/tasks/daily-standup.md";
    existingFile.name = "daily-standup.md";

    (vault.getAbstractFileByPath as jest.Mock).mockImplementation((path: string) => {
      if (path === ".claude/tasks") return makeTFolderLike(".claude/tasks");
      if (path === ".claude/tasks/daily-standup.md") return existingFile;
      return null;
    });

    await scheduler.saveTask(task);

    expect(vault.modify).toHaveBeenCalledTimes(1);
    expect(vault.create).not.toHaveBeenCalled();
  });

  // 4. getDueTasks returns overdue tasks only
  it("getDueTasks returns only tasks whose nextRun is in the past", async () => {
    const pastDate = new Date(Date.now() - 60_000).toISOString();
    const futureDate = new Date(Date.now() + 60_000).toISOString();

    const overdueTask = makeTask({ id: "overdue", nextRun: pastDate });
    const futureTask = makeTask({ id: "future", nextRun: futureDate });

    const mockFolder = makeTFolderLike(".claude/tasks");
    const overdueFile = makeTFileLike(".claude/tasks/overdue.md");
    const futureFile = makeTFileLike(".claude/tasks/future.md");

    (vault.getAbstractFileByPath as jest.Mock).mockImplementation((path: string) => {
      if (path === ".claude/tasks") return mockFolder;
      return null;
    });

    (vault.getFiles as jest.Mock).mockReturnValue([overdueFile, futureFile]);
    (vault.read as jest.Mock).mockImplementation((file: { path: string }) => {
      if (file.path === ".claude/tasks/overdue.md") return Promise.resolve(taskToMarkdown(overdueTask));
      return Promise.resolve(taskToMarkdown(futureTask));
    });

    const due = await scheduler.getDueTasks();
    expect(due).toHaveLength(1);
    expect(due[0].id).toBe("overdue");
  });

  // getDueTasks skips tasks with no nextRun
  it("getDueTasks skips tasks with no nextRun", async () => {
    const taskNoNext = makeTask({ id: "no-next", nextRun: "" });

    const mockFolder = makeTFolderLike(".claude/tasks");
    const file = makeTFileLike(".claude/tasks/no-next.md");

    (vault.getAbstractFileByPath as jest.Mock).mockImplementation((path: string) => {
      if (path === ".claude/tasks") return mockFolder;
      return null;
    });

    (vault.getFiles as jest.Mock).mockReturnValue([file]);
    (vault.read as jest.Mock).mockResolvedValue(taskToMarkdown(taskNoNext));

    const due = await scheduler.getDueTasks();
    expect(due).toHaveLength(0);
  });

  // 5. runTask calls executor with resolved template
  it("runTask calls executor with the resolved prompt and agent", async () => {
    const task = makeTask({ prompt: "Run daily check", agent: "atlas" });
    const executor = jest.fn().mockResolvedValue("Task complete");

    (vault.getAbstractFileByPath as jest.Mock).mockReturnValue(null);

    await scheduler.runTask(task, executor);

    expect(executor).toHaveBeenCalledTimes(1);
    const [calledPrompt, calledAgent] = executor.mock.calls[0];
    expect(typeof calledPrompt).toBe("string");
    expect(calledPrompt.length).toBeGreaterThan(0);
    expect(calledAgent).toBe("atlas");
  });

  // 6. runTask updates lastRun and nextRun
  it("runTask updates lastRun and nextRun on the task", async () => {
    const task = makeTask({ lastRun: "", nextRun: "" });
    const executor = jest.fn().mockResolvedValue("done");

    (vault.getAbstractFileByPath as jest.Mock).mockReturnValue(null);

    const before = new Date();
    await scheduler.runTask(task, executor);

    expect(task.lastRun).toBeTruthy();
    expect(task.nextRun).toBeTruthy();

    const lastRunDate = new Date(task.lastRun);
    expect(lastRunDate.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(new Date(task.nextRun).getTime()).toBeGreaterThan(lastRunDate.getTime());
  });

  // 7. calculateNextRun uses cron parser correctly
  it("calculateNextRun returns a future date based on the cron schedule", () => {
    const task = makeTask({ schedule: "0 9 * * *" }); // every day at 9 AM
    const next = scheduler.calculateNextRun(task);

    expect(next).toBeInstanceOf(Date);
    expect(next.getTime()).toBeGreaterThan(Date.now());
  });

  it("calculateNextRun returns correct next time for '*/15 * * * *'", () => {
    const task = makeTask({ schedule: "*/15 * * * *" });
    const next = scheduler.calculateNextRun(task);
    expect(next).toBeInstanceOf(Date);
    // Next run should be within the next 15 minutes
    expect(next.getTime()).toBeLessThanOrEqual(Date.now() + 15 * 60 * 1000 + 1000);
  });
});
