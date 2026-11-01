import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
const start = vi.hoisted(() => vi.fn());
vi.mock("workflow/api", () => ({ start }));
import { GET } from "@/app/api/studio/tasks/fixture/route";
import { fixtureStage, studioTaskFixtureWorkflow } from "@/lib/studio/task-workflow-fixture";
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
describe("isolated preview workflow fixture", () => {
  it("is closed in production before queueing any workflow", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    expect((await GET()).status).toBe(404);
    expect(start).not.toHaveBeenCalled();
    await expect(fixtureStage(0)).rejects.toThrow("PREVIEW_FIXTURE_ONLY");
  });
  it("runs seven pure fixture stages in preview with no Studio debit", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    const result = await studioTaskFixtureWorkflow();
    expect(result).toEqual({ revisions: [0, 1, 2, 3, 4, 5, 6], completedImages: 5, studioCreditsConsumed: 0 });
    expect(fixtureStage.maxRetries).toBe(0);
  });
  it("does not import database, image, audio, render or billing code", () => {
    const source = readFileSync("lib/studio/task-workflow-fixture.ts", "utf8");
    expect(source).not.toMatch(/from ["'].*(?:supabase|image-generation|slideshow-server|slideshow-voice|credits|subscription)/);
    expect(source).not.toContain("fetch(");
  });
  it("serves the complete Preview check with enough synthetic evidence for every duration and no TTS", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    start.mockResolvedValue({ returnValue: Promise.resolve({ completedImages: 5, studioCreditsConsumed: 0 }) });
    const response = await GET();
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result).toMatchObject({ fixtureOnly: true, studioCreditsConsumed: 0, ttsCalls: 0 });
    expect(result.narration.map((plan: any) => plan.duration)).toEqual([25, 30, 40]);
    for (const plan of result.narration) expect(plan.words).toBeGreaterThanOrEqual(Math.ceil(plan.duration * 0.95 * 2));
  });

});
