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
const slideshowInput = (voiceover?: boolean) => ({ ...(voiceover === undefined ? {} : { voiceover }), product: { name: "Guide", description: "Disponible au format PDF. Le guide comporte huit chapitres consacrés à la préparation du jardin. Chaque chapitre présente trois exercices pratiques, une liste de matériel et un calendrier saisonnier. Les fiches expliquent le choix des graines, la préparation du sol, l’arrosage régulier, la rotation des cultures et la récolte. Les illustrations montrent des plantations en pots et en pleine terre. Le téléchargement permet une lecture hors connexion sur téléphone ou tablette." }, duration: 25, musicId: "", locale: "fr" });
const request = (input: unknown) => new Request("https://preview.test/api/studio/tasks", { method: "POST", body: JSON.stringify({ id, kind: "slideshow", input }) });
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("VERCEL_ENV", "preview"); vi.stubEnv("VENDEO_SLIDESHOW_TTS_TEST_ALLOWED", "false"); vi.stubEnv("VENDEO_SLIDESHOW_TTS_ENABLED", "false"); vi.stubEnv("VENDEO_GEMINI_FREE_TIER_CONFIRMED", "false");
  mocks.user.mockResolvedValue({ user: { id: "owner" } }); mocks.subscription.mockResolvedValue(null);
});
describe("nouveaux diaporamas avec voix", () => {
  it.each([false, undefined])("refuse un client obsolète avec voiceover=%s avant insertion ni provider", async (voiceover) => {
    vi.stubEnv("VENDEO_SLIDESHOW_TTS_ENABLED", "true"); vi.stubEnv("VENDEO_GEMINI_FREE_TIER_CONFIRMED", "true");
    const insert = vi.fn(); mocks.from.mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }), insert });
    const response = await POST(request(slideshowInput(voiceover)));
    const body = await response.json();
    expect(response.status).toBe(409); expect(body.code).toBe("STUDIO_CLIENT_UPDATE_REQUIRED"); expect(body.error).toMatch(/Actualisez.*narration/i);
    expect(insert).not.toHaveBeenCalled(); expect(mocks.after).not.toHaveBeenCalled(); expect(mocks.generate).not.toHaveBeenCalled(); expect(mocks.render).not.toHaveBeenCalled();
  });
  it("accepte une demande voiceover=true selon la garde normale", async () => {
    vi.stubEnv("VENDEO_SLIDESHOW_TTS_ENABLED", "true"); vi.stubEnv("VENDEO_GEMINI_FREE_TIER_CONFIRMED", "true");
    const insertedRow = { id, user_id: "owner", status: "processing", metadata: { type: TASK_TYPE, taskKind: "slideshow", input: { voiceover: true }, revision: 0, phase: "queued" } };
    const insert = vi.fn(() => ({ select: () => ({ single: async () => ({ data: insertedRow, error: null }) }) }));
    mocks.from.mockImplementation((table) => table === "credit_accounts"
      ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { balance: 500, reserved: 0 }, error: null }) }) }) }
      : { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }), insert });
    const response = await POST(request(slideshowInput(true)));
    expect(response.status).toBe(202); expect(insert).toHaveBeenCalledOnce(); expect(mocks.after).toHaveBeenCalledOnce();
    expect(mocks.generate).not.toHaveBeenCalled(); expect(mocks.render).not.toHaveBeenCalled();
  });
  it("renvoie la tâche existante avant la garde, sans redispatch", async () => {
    vi.stubEnv("VENDEO_SLIDESHOW_TTS_ENABLED", "true"); vi.stubEnv("VENDEO_GEMINI_FREE_TIER_CONFIRMED", "true");
    const row = { id, user_id: "owner", status: "processing", metadata: { type: TASK_TYPE, taskKind: "slideshow", input: { voiceover: false }, phase: "running", revision: 2 } };
    const insert = vi.fn(); mocks.from.mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row }) }) }), insert });
    const response = await POST(request(slideshowInput(false)));
    expect(response.status).toBe(200); expect(insert).not.toHaveBeenCalled(); expect(mocks.after).not.toHaveBeenCalled(); expect(mocks.generate).not.toHaveBeenCalled(); expect(mocks.render).not.toHaveBeenCalled();
  });
  it("bloque avant insertion, image ou voix tant que le test réel n’est pas autorisé", async () => {
    const insert = vi.fn(); mocks.from.mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }), insert });
    const response = await POST(new Request("https://preview.test/api/studio/tasks", { method: "POST", body: JSON.stringify({ id, kind: "slideshow", input: { voiceover: true, product: { name: "Guide", description: "Disponible au format PDF. Le guide comporte huit chapitres consacrés à la préparation du jardin. Chaque chapitre présente trois exercices pratiques, une liste de matériel et un calendrier saisonnier. Les fiches expliquent le choix des graines, la préparation du sol, l’arrosage régulier, la rotation des cultures et la récolte. Les illustrations montrent des plantations en pots et en pleine terre. Le téléchargement permet une lecture hors connexion sur téléphone ou tablette." }, duration: 25, musicId: "", locale: "fr" } }) }));
    expect(response.status).toBe(400); expect(insert).not.toHaveBeenCalled(); expect(mocks.after).not.toHaveBeenCalled(); expect(mocks.generate).not.toHaveBeenCalled();
  });
  it("un worker voix running n’est jamais réexécuté après une réponse ambiguë", async () => {
    const row = { id, user_id: "owner", status: "processing", metadata: { type: TASK_TYPE, taskKind: "slideshow", input: { voiceover: true }, phase: "running", revision: 6 } };
    mocks.from.mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row }) }) }) });
    await runTaskStep(id, 6); await runTaskStep(id, 6);
    expect(mocks.render).not.toHaveBeenCalled(); expect(mocks.generate).not.toHaveBeenCalled();
  });
  it("publicTask masque les diagnostics de narration historiques dans status et output", async () => {
    const diagnostic = "Narration duration 20.09s exceeds 25s limit (95%)";
    const task = await publicTask({ id, user_id: "owner", status: "failed", metadata: { type: TASK_TYPE, taskKind: "slideshow", input: { voiceover: true, locale: "fr" }, revision: 3, phase: "failed", progress: 95, updatedAt: new Date().toISOString(), images: [], error: diagnostic, message: diagnostic, details: diagnostic } });
    expect(task.status).toBe("failed");
    expect(task.message).toBe("Le montage n’a pas abouti. Tes visuels terminés sont conservés ; suis l’action indiquée ici pour le terminer.");
    expect(task.error).toBe(task.message);
    expect(JSON.stringify(task)).not.toMatch(/20\.09|25s|95%|details/i);
  });
  it("préflight POST narration sparse ne divulgue pas les détails techniques", async () => {
    vi.stubEnv("VENDEO_SLIDESHOW_TTS_ENABLED", "true"); vi.stubEnv("VENDEO_GEMINI_FREE_TIER_CONFIRMED", "true");
    mocks.preflight.mockRejectedValue(new Error("Narration duration 20.09s exceeds 25s limit (95%)"));
    const insert = vi.fn();
    mocks.from.mockImplementation((table) => table === "credit_accounts"
      ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { balance: 500, reserved: 0 }, error: null }) }) }) }
      : { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }), insert });
    const response = await POST(request({ ...slideshowInput(true), product: { name: "Guide", description: "Bref." } }));
    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body).not.toHaveProperty("details");
    expect(JSON.stringify(body)).not.toMatch(/20\.09|25s|95%|technical|stack/i);
    expect(body.code).toBe("INSUFFICIENT_PRODUCT_DETAILS");
    expect(body.error).toMatch(/description est trop courte.*25 s.*aucune image.*aucun crédit/i);
    expect(insert).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
  });
  it("retrouve le MP4 enfant en lecture seule après perte de l’écriture parent", async () => {
    const saved = { id: "final", status: "completed", storage_path: "owner/final.mp4", metadata: { type: "slideshow", voiceover: { version: 1 }, duration: 25, musicId: "sb-reverie", attribution: "CC BY 4.0", imageGenerationIds: [] } };
    mocks.from.mockImplementation(() => ({ select: () => {
      const chain: any = { eq: () => chain, limit: async () => ({ data: [saved] }), maybeSingle: async () => ({ data: saved }) }; return chain;
    } }));
    const task = await publicTask({ id, user_id: "owner", status: "failed", metadata: { type: TASK_TYPE, taskKind: "slideshow", input: { voiceover: true }, revision: 6, phase: "failed", progress: 90, updatedAt: new Date().toISOString(), images: [], stages: [{ kind: "render", state: "uncertain" }] } });
    expect(task.status).toBe("completed"); expect(task.progress).toBe(100); expect(task.result.videoUrl).toBe("signed:owner/final.mp4");
    expect(mocks.render).not.toHaveBeenCalled(); expect(mocks.generate).not.toHaveBeenCalled();
  });
});
