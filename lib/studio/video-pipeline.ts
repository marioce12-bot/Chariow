import type { VideoAdPlan } from "./video-plan";

export type VideoClip = { url: string; duration: number; index: number };
export type GenerateSegment = (input: {
  segment: VideoAdPlan["segments"][number];
  referenceUrl?: string;
  idempotencyKey: string;
}) => Promise<VideoClip>;
export type VideoPipelineDependencies = {
  generateSegment: GenerateSegment;
  extractLastFrame: (clip: VideoClip) => Promise<string>;
  assemble: (clips: VideoClip[], plan: VideoAdPlan) => Promise<unknown>;
};

/** Sequential, explicit-dependency orchestration. No retries and no provider integration. */
export async function runVideoPipeline(
  jobId: string,
  plan: VideoAdPlan,
  dependencies: VideoPipelineDependencies,
  initialReferenceUrl?: string,
): Promise<{ clips: VideoClip[]; result: unknown }> {
  validatePlan(plan);
  if (!jobId.trim()) throw new Error("jobId is required");
  const clips: VideoClip[] = [];
  let referenceUrl: string | undefined = initialReferenceUrl;
  for (const segment of plan.segments) {
    const clip = await dependencies.generateSegment({
      segment,
      ...(referenceUrl ? { referenceUrl } : {}),
      idempotencyKey: `${jobId}:${segment.index}`,
    });
    if (!clip || typeof clip.url !== "string" || !clip.url || clip.index !== segment.index || !Number.isFinite(clip.duration) || clip.duration < segment.duration) {
      throw new Error(`Generated clip ${segment.index} is invalid or shorter than its planned duration`);
    }
    clips.push(clip);
    if (segment !== plan.segments[plan.segments.length - 1]) {
      referenceUrl = await dependencies.extractLastFrame(clip);
      if (!referenceUrl?.trim()) throw new Error("Continuity frame missing; refusing to restart the next segment without a reference");
    }
  }
  if (clips.length !== plan.segments.length) throw new Error("Generated clip count does not match plan");
  const result = await dependencies.assemble(clips, plan);
  return { clips, result };
}

export function validatePlan(plan: VideoAdPlan): void {
  if (!plan || !Number.isFinite(plan.duration) || plan.duration <= 0 || !Array.isArray(plan.segments) || plan.segments.length === 0) throw new Error("Invalid video plan");
  let total = 0;
  plan.segments.forEach((segment, index) => {
    if (segment.index !== index || !Number.isFinite(segment.duration) || segment.duration <= 0 || segment.duration > 15 || !segment.prompt?.trim()) throw new Error("Segments must have ordered zero-based indices, durations between 1 and 15 seconds, and prompts");
    total += segment.duration;
  });
  if (Math.abs(total - plan.duration) > 0.001) throw new Error("Segment durations must equal plan duration");
}
