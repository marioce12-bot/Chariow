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
  it("keeps rendering binaries on the durable worker and direct slideshow renderer only", () => {
    const workflow = readFileSync("lib/studio/task-workflow.ts", "utf8");
    const config = readFileSync("next.config.ts", "utf8");
    const includes = config.split("outputFileTracingIncludes: {")[1]?.split("async headers()")[0] ?? "";
    const excludes = config.split("outputFileTracingExcludes: {")[1]?.split("outputFileTracingIncludes:")[0] ?? "";
    const runtimeFiles = config.split("const videoRuntimeFiles = [")[1]?.split("];", 1)[0] ?? "";
    const apiFiles = config.split("const videoApiFiles = [")[1]?.split("];", 1)[0] ?? "";
    const probeFiles = config.split("const videoProbeFiles = [")[1]?.split("];", 1)[0] ?? "";
    expect(workflow).toContain('"use workflow"'); expect(workflow).toContain('"use step"');
    expect(includes).toContain('"/.well-known/workflow/v1/step"');
    expect(includes).not.toContain('"/.well-known/workflow/**"');
    expect(includes).toContain('"/.well-known/workflow/v1/step": [...videoRuntimeFiles');
    expect(includes).toContain('"/api/studio/slideshow/render": [...videoRuntimeFiles');
    expect(includes).toContain('"/api/studio/video": videoApiFiles');
    expect(includes).not.toContain('"/api/studio/tasks": videoRuntimeFiles');
    expect(includes).not.toContain('"/api/studio/tasks/*": videoRuntimeFiles');
    expect(includes).not.toContain('"/api/studio/slideshow/*":');
    expect(includes).not.toContain('"/api/studio/video": videoRuntimeFiles');
    expect(apiFiles).toContain("./node_modules/ffmpeg-static/index.js");
    expect(apiFiles).toContain("./node_modules/ffmpeg-static/package.json");
    expect(apiFiles).toContain("...videoProbeFiles");
    expect(runtimeFiles).toContain("./node_modules/ffmpeg-static/index.js");
    expect(runtimeFiles).toContain("./node_modules/ffmpeg-static/ffmpeg");
    expect(runtimeFiles).toContain("...videoProbeFiles");
    expect(probeFiles).toContain("./node_modules/ffprobe-static/index.js");
    expect(probeFiles).toContain("./node_modules/ffprobe-static/bin/linux/x64/ffprobe");
    expect(excludes).toContain('"/api/studio/video": [');
    expect(excludes).toContain("./node_modules/ffmpeg-static/ffmpeg");
    expect(excludes).not.toContain("./node_modules/ffmpeg-static/**");
    expect(excludes).toContain('"/.well-known/workflow/v1/step"');
    expect(readFileSync("lib/studio/background-tasks.ts", "utf8")).not.toContain("/api/studio/tasks/worker");
  });
});
