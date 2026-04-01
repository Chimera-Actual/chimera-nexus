/**
 * @file Tests for LoopScheduler
 */

import { LoopScheduler } from "../../../src/chimera/scheduler/loop-scheduler";
import { LoopTask } from "../../../src/chimera/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTask(overrides: Partial<LoopTask> = {}): LoopTask {
  return {
    id: "task-1",
    interval: 1000,
    prompt: "Do something",
    agent: "atlas",
    createdAt: new Date().toISOString(),
    expiresAt: "",
    lastRun: "",
    runCount: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("LoopScheduler", () => {
  let scheduler: LoopScheduler;

  beforeEach(() => {
    scheduler = new LoopScheduler();
    jest.useFakeTimers();
  });

  afterEach(() => {
    scheduler.cancelAll();
    jest.useRealTimers();
  });

  // 1. addLoop stores the loop task
  it("addLoop stores the loop task", () => {
    const task = makeTask({ id: "loop-1" });
    const onTick = jest.fn().mockResolvedValue(undefined);

    scheduler.addLoop(task, onTick);

    const stored = scheduler.getLoop("loop-1");
    expect(stored).toBeDefined();
    expect(stored!.id).toBe("loop-1");
    expect(stored!.prompt).toBe("Do something");
  });

  // 2. listLoops returns all active loops
  it("listLoops returns all active loops", () => {
    const onTick = jest.fn().mockResolvedValue(undefined);

    scheduler.addLoop(makeTask({ id: "loop-a" }), onTick);
    scheduler.addLoop(makeTask({ id: "loop-b" }), onTick);
    scheduler.addLoop(makeTask({ id: "loop-c" }), onTick);

    const loops = scheduler.listLoops();
    expect(loops).toHaveLength(3);
    const ids = loops.map((l) => l.id).sort();
    expect(ids).toEqual(["loop-a", "loop-b", "loop-c"]);
  });

  // 3. getLoop returns specific loop
  it("getLoop returns the correct specific loop", () => {
    const onTick = jest.fn().mockResolvedValue(undefined);

    scheduler.addLoop(makeTask({ id: "loop-x" }), onTick);
    scheduler.addLoop(makeTask({ id: "loop-y" }), onTick);

    const result = scheduler.getLoop("loop-x");
    expect(result).toBeDefined();
    expect(result!.id).toBe("loop-x");

    expect(scheduler.getLoop("loop-y")).toBeDefined();
    expect(scheduler.getLoop("does-not-exist")).toBeUndefined();
  });

  // 4. cancelLoop removes a loop
  it("cancelLoop removes a loop", () => {
    const onTick = jest.fn().mockResolvedValue(undefined);

    scheduler.addLoop(makeTask({ id: "loop-del" }), onTick);
    expect(scheduler.getLoop("loop-del")).toBeDefined();

    scheduler.cancelLoop("loop-del");
    expect(scheduler.getLoop("loop-del")).toBeUndefined();
    expect(scheduler.listLoops()).toHaveLength(0);
  });

  // cancelLoop is a no-op for unknown IDs
  it("cancelLoop is a no-op for unknown id", () => {
    expect(() => scheduler.cancelLoop("nonexistent")).not.toThrow();
  });

  // 5. cancelAll removes all loops
  it("cancelAll removes all loops", () => {
    const onTick = jest.fn().mockResolvedValue(undefined);

    scheduler.addLoop(makeTask({ id: "a" }), onTick);
    scheduler.addLoop(makeTask({ id: "b" }), onTick);
    scheduler.addLoop(makeTask({ id: "c" }), onTick);

    scheduler.cancelAll();
    expect(scheduler.listLoops()).toHaveLength(0);
  });

  // 6. Max 50 loops enforced
  it("throws when adding more than 50 loops", () => {
    const onTick = jest.fn().mockResolvedValue(undefined);

    for (let i = 0; i < 50; i++) {
      scheduler.addLoop(makeTask({ id: `loop-${i}` }), onTick);
    }

    expect(scheduler.listLoops()).toHaveLength(50);

    expect(() =>
      scheduler.addLoop(makeTask({ id: "overflow-loop" }), onTick)
    ).toThrow(/maximum of 50 loops/i);
  });

  // 7. onTick callback is called
  it("onTick callback is called after each interval", async () => {
    const onTick = jest.fn().mockResolvedValue(undefined);
    const task = makeTask({ id: "tick-test", interval: 500 });

    scheduler.addLoop(task, onTick);

    // Advance one tick
    jest.advanceTimersByTime(500);
    // Allow async callbacks to settle
    await Promise.resolve();

    expect(onTick).toHaveBeenCalledTimes(1);

    // Advance two more ticks
    jest.advanceTimersByTime(1000);
    await Promise.resolve();

    expect(onTick).toHaveBeenCalledTimes(3);
  });

  // 8. runCount increments on each tick
  it("runCount increments on each tick", async () => {
    const onTick = jest.fn().mockResolvedValue(undefined);
    const task = makeTask({ id: "count-test", interval: 200 });

    scheduler.addLoop(task, onTick);

    jest.advanceTimersByTime(200);
    await Promise.resolve();
    expect(scheduler.getLoop("count-test")!.runCount).toBe(1);

    jest.advanceTimersByTime(200);
    await Promise.resolve();
    expect(scheduler.getLoop("count-test")!.runCount).toBe(2);

    jest.advanceTimersByTime(200);
    await Promise.resolve();
    expect(scheduler.getLoop("count-test")!.runCount).toBe(3);
  });

  // 9. Expired loop is auto-cancelled
  it("auto-cancels a loop when expiresAt has passed", async () => {
    const onTick = jest.fn().mockResolvedValue(undefined);
    // expiresAt in the past
    const past = new Date(Date.now() - 1000).toISOString();
    const task = makeTask({ id: "expiry-test", interval: 500, expiresAt: past });

    scheduler.addLoop(task, onTick);

    // Trigger the timer; the loop should detect expiry and cancel itself
    jest.advanceTimersByTime(500);
    await Promise.resolve();
    await Promise.resolve(); // extra yield for nested async

    expect(scheduler.getLoop("expiry-test")).toBeUndefined();
    expect(onTick).not.toHaveBeenCalled();
  });

  // getLoop returns a copy, not the internal reference
  it("getLoop returns a copy of the stored task", () => {
    const onTick = jest.fn().mockResolvedValue(undefined);
    const task = makeTask({ id: "copy-test" });

    scheduler.addLoop(task, onTick);
    const copy = scheduler.getLoop("copy-test")!;
    copy.prompt = "mutated";

    // Internal state should be unchanged
    expect(scheduler.getLoop("copy-test")!.prompt).toBe("Do something");
  });
});
