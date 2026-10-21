import { describe, expect, it, vi } from "vitest";
import { runVideoPipeline } from "../lib/studio/video-pipeline";
import type { VideoAdPlan } from "../lib/studio/video-plan";

const plan = { duration: 6, aspectRatio: "16:9", direction: "", continuity: "", segments: [0, 1, 2].map(index => ({ index, duration: 2, prompt: `segment ${index}` })) } as VideoAdPlan;

describe("runVideoPipeline", () => {
  it("generates sequentially, chains each last frame, then assembles in order", async () => {
    const calls: any[] = [];
    const generateSegment = vi.fn(async (input: any) => { calls.push(input); return { url: `/clip-${input.segment.index}.mp4`, duration: 2, index: input.segment.index }; });
    const extractLastFrame = vi.fn(async (clip: any) => `frame:${clip.index}`);
    const assemble = vi.fn(async clips => clips.length);
    const output = await runVideoPipeline("job-abc", plan, { generateSegment, extractLastFrame, assemble });
    expect(calls.map(c => c.idempotencyKey)).toEqual(["job-abc:0", "job-abc:1", "job-abc:2"]);
    expect(calls.map(c => c.referenceUrl)).toEqual([undefined, "frame:0", "frame:1"]);
    expect(extractLastFrame).toHaveBeenCalledTimes(2);
    expect(assemble).toHaveBeenCalledOnce();
    expect(output.clips.map(c => c.index)).toEqual([0, 1, 2]);
  });
  it("stops on generation error and never assembles partial output", async () => {
    const assemble = vi.fn();
    await expect(runVideoPipeline("job", plan, {
      generateSegment: async ({ segment }) => { if (segment.index === 1) throw Error("provider failed"); return { url: "clip", duration: 2, index: segment.index }; },
      extractLastFrame: async () => "frame", assemble,
    })).rejects.toThrow("provider failed");
    expect(assemble).not.toHaveBeenCalled();
  });
  it("rejects unordered plans before making calls", async () => {
    const bad = { ...plan, segments: [{ ...plan.segments[0], index: 1 }] } as VideoAdPlan;
    const generateSegment = vi.fn();
    await expect(runVideoPipeline("job", bad, { generateSegment, extractLastFrame: async () => "", assemble: async () => null })).rejects.toThrow();
    expect(generateSegment).not.toHaveBeenCalled();
  });
});
