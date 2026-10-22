import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ from: vi.fn(), generate: vi.fn(), render: vi.fn(), preflight: vi.fn(), after: vi.fn(), user: vi.fn(), subscription: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: mocks.from }) }));
vi.mock("@/lib/studio/image-generation", () => ({ generateStudioImage: mocks.generate }));
vi.mock("@/lib/studio/slideshow-server", () => ({ renderSlideshow: mocks.render, preflightSlideshow: mocks.preflight, isPreviewEnabled: () => true }));
vi.mock("@/lib/studio/media", () => ({ signedStudioUrl: async (p: string) => `signed:${p}` }));
vi.mock("next/server", () => ({ after: mocks.after, NextResponse: { json: (body: unknown, init?: ResponseInit) => new Response(JSON.stringify(body), init) } }));
vi.mock("@/lib/auth", () => ({ requireUser: mocks.user }));
vi.mock("@/lib/subscription/access", () => ({ requireActiveSubscription: mocks.subscription }));
vi.mock("@/lib/shop/rate-limit", () => ({ rateLimit: () => false }));
import { POST } from "@/app/api/studio/tasks/route";
import { publicTask, TASK_TYPE, runTaskStep } from "@/lib/studio/background-tasks";
const id = "123e4567-e89b-42d3-a456-426614174000";
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("VERCEL_ENV", "preview"); vi.stubEnv("VENDEO_SLIDESHOW_TTS_TEST_ALLOWED", "false");
  mocks.user.mockResolvedValue({ user: { id: "owner" } }); mocks.subscription.mockResolvedValue(null);
});
describe("nouveaux diaporamas avec voix", () => {
  it("bloque avant insertion, image ou voix tant que le test réel n’est pas autorisé", async () => {
    const insert = vi.fn(); mocks.from.mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }), insert });
    const response = await POST(new Request("https://preview.test/api/studio/tasks", { method: "POST", body: JSON.stringify({ id, kind: "slideshow", input: { voiceover: true, product: { name: "Guide", description: "Disponible au format PDF. Des exercices accompagnent chaque chapitre. La lecture est possible sans connexion." }, duration: 25, musicId: "", locale: "fr" } }) }));
    expect(response.status).toBe(400); expect(insert).not.toHaveBeenCalled(); expect(mocks.after).not.toHaveBeenCalled(); expect(mocks.generate).not.toHaveBeenCalled();
  });
  it("un worker voix running n’est jamais réexécuté après une réponse ambiguë", async () => {
    const row = { id, user_id: "owner", status: "processing", metadata: { type: TASK_TYPE, taskKind: "slideshow", input: { voiceover: true }, phase: "running", revision: 6 } };
    mocks.from.mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row }) }) }) });
    await runTaskStep(id, 6); await runTaskStep(id, 6);
    expect(mocks.render).not.toHaveBeenCalled(); expect(mocks.generate).not.toHaveBeenCalled();
  });
  it("retrouve le MP4 enfant en lecture seule après perte de l’écriture parent", async () => {
    const saved = { id: "final", storage_path: "owner/final.mp4", metadata: { type: "slideshow", voiceover: { version: 1 }, duration: 25, musicId: "sb-reverie", attribution: "CC BY 4.0", imageGenerationIds: [] } };
    mocks.from.mockImplementation(() => ({ select: () => {
      const chain: any = { eq: () => chain, limit: async () => ({ data: [saved] }), maybeSingle: async () => ({ data: saved }) }; return chain;
    } }));
    const task = await publicTask({ id, user_id: "owner", status: "failed", metadata: { type: TASK_TYPE, taskKind: "slideshow", input: { voiceover: true }, revision: 6, phase: "failed", progress: 90, updatedAt: new Date().toISOString(), images: [], stages: [{ kind: "render", state: "uncertain" }] } });
    expect(task.status).toBe("completed"); expect(task.progress).toBe(100); expect(task.result.videoUrl).toBe("signed:owner/final.mp4");
    expect(mocks.render).not.toHaveBeenCalled(); expect(mocks.generate).not.toHaveBeenCalled();
  });
});
