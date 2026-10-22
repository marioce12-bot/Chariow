import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
const mocks = vi.hoisted(() => ({ step: vi.fn(), fail: vi.fn() }));
vi.mock("@/lib/studio/background-tasks", () => ({
  runTaskStep: mocks.step, failTask: mocks.fail,
  StudioTaskError: class extends Error { code: string; constructor(code: string) { super(code); this.code = code; } },
}));
import { studioTaskWorkflow, executeStudioTaskStep } from "@/lib/studio/task-workflow";
beforeEach(() => { vi.clearAllMocks(); mocks.fail.mockResolvedValue(undefined); });
describe("durable Studio orchestration (fixtures only)", () => {
  it("runs preflight, all five visuals and render sequentially with no recursive fetch", async () => {
    const fetcher = vi.fn(() => { throw new Error("No network allowed"); });
    vi.stubGlobal("fetch", fetcher);
    mocks.step.mockImplementation(async (_id, revision) => revision === 6 ? null : revision + 1);
    await studioTaskWorkflow("fixture-task", 0);
    expect(mocks.step.mock.calls).toEqual(Array.from({ length: 7 }, (_, revision) => ["fixture-task", revision]));
    expect(fetcher).not.toHaveBeenCalled();
    expect(executeStudioTaskStep.maxRetries).toBe(0);
    vi.unstubAllGlobals();
  });
  it("stops after a genuine fifth-image failure; never auto-resumes it", async () => {
    mocks.step.mockImplementation(async (_id, revision) => revision === 5 ? undefined : revision + 1);
    await studioTaskWorkflow("fixture-task", 0);
    expect(mocks.step.mock.calls.map(call => call[1])).toEqual([0, 1, 2, 3, 4, 5]);
  });
  it("honors the exact revision of an explicitly approved continuation", async () => {
    mocks.step.mockResolvedValueOnce(6).mockResolvedValueOnce(null);
    await studioTaskWorkflow("fixture-task", 5);
    expect(mocks.step.mock.calls).toEqual([["fixture-task", 5], ["fixture-task", 6]]);
  });
  it("a duplicate claim stops instead of scheduling another paid stage", async () => {
    mocks.step.mockResolvedValue(undefined);
    await studioTaskWorkflow("fixture-task", 4);
    expect(mocks.step).toHaveBeenCalledTimes(1);
  });
  it("marks a failed queued claim and throws a non-retryable sanitized error", async () => {
    mocks.step.mockRejectedValue(new Error("private database details"));
    await expect(studioTaskWorkflow("fixture-task", 4)).rejects.toThrow("STUDIO_WORKER_EXECUTION_FAILED");
    expect(mocks.step).toHaveBeenCalledTimes(1);
    expect(mocks.fail).toHaveBeenCalledWith("fixture-task", expect.any(Error), { revision: 4, phase: "queued" });
  });
  it("compiles durable boundaries and includes rendering binaries for the generated step route", () => {
    const workflow = readFileSync("lib/studio/task-workflow.ts", "utf8");
    expect(workflow).toContain('"use workflow"'); expect(workflow).toContain('"use step"');
    expect(readFileSync("next.config.ts", "utf8")).toContain('"/.well-known/workflow/**"');
    expect(readFileSync("lib/studio/background-tasks.ts", "utf8")).not.toContain("/api/studio/tasks/worker");
  });
});
