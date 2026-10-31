vi.mock("workflow/api", () => ({ start: vi.fn() }));
import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ from: vi.fn(), generate: vi.fn(), render: vi.fn(), after: [] as Array<() => Promise<void>>, auth: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireUser: m.auth }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: m.from }) }));
vi.mock("@/lib/subscription/access", () => ({ requireActiveSubscription: async () => null }));
vi.mock("@/lib/studio/image-generation", () => ({ generateStudioImage: m.generate }));
vi.mock("@/lib/studio/slideshow-server", () => ({ preflightSlideshow: vi.fn(), renderSlideshow: m.render }));
vi.mock("@/lib/studio/slideshow-plan", async () => {
  const actual = await vi.importActual<typeof import("@/lib/studio/slideshow-plan")>("@/lib/studio/slideshow-plan");
  return { ...actual, buildSlideshowPlan: () => ({ slides: Array.from({ length: 5 }, (_, i) => ({ prompt: "mock", index: i })) }) };
});
vi.mock("@/lib/studio/media", () => ({ signedStudioUrl: async (p: string) => `https://stored.test/${p}` }));
vi.mock("next/server", () => ({ after: (fn: () => Promise<void>) => m.after.push(fn), NextResponse: { json: (body: any, init?: any) => new Response(JSON.stringify(body), init) } }));
import { GET, POST } from "@/app/api/studio/tasks/[id]/continue/route";
import { runTaskStep, stageGenerationId, TASK_TYPE } from "@/lib/studio/background-tasks";
const id = "883f32ed-f033-4c65-95a0-a565e0bde7a1";
const context = { params: Promise.resolve({ id }) };
const richDescription = [
  "Le guide explique comment choisir un budget adapté à chaque campagne.",
  "Chaque chapitre présente une étape de configuration des annonces.",
  "Une section détaille les formats publicitaires disponibles sur Snapchat.",
  "Des exercices pratiques accompagnent la lecture du guide.",
  "Le document est disponible au format PDF et consultable sur ordinateur.",
  "Une liste aide à vérifier le ciblage avant la publication.",
  "Des exemples montrent la rédaction d’annonces claires pour les audiences.",
  "Le guide présente les indicateurs de suivi et leur interprétation.",
  "Une partie explique l’organisation du calendrier de publication.",
  "Des fiches permettent de préparer les visuels de chaque campagne.",
  "Un glossaire définit les termes présents dans les menus.",
  "L’annexe rassemble les dimensions d’images prises en charge.",
  "Les étapes décrivent la comparaison entre plusieurs formats publicitaires.",
].join(" ");
let row: any;
let children: any[];
const request = (body: any) => new Request(`https://test.invalid/api/studio/tasks/${id}/continue`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
function database() {
  m.from.mockImplementation(() => {
    let update: any; const filters: Array<[string, unknown]> = []; let ids: string[] | null = null;
    const matches = (value: any) => filters.every(([key, wanted]) => {
      const actual = key.startsWith("metadata->>") ? String(value.metadata?.[key.slice(11)]) : value[key];
      return actual === wanted;
    }) && (!ids || ids.includes(value.id));
    const run = () => {
      if (update) { if (!matches(row)) return { data: [], error: null }; Object.assign(row, update); return { data: [{ id }], error: null }; }
      return { data: [row, ...children].filter(matches).map(value => structuredClone(value)), error: null };
    };
    const q: any = { select: () => q, update: (value: any) => { update = value; return q; }, eq: (key: string, value: unknown) => { filters.push([key, value]); return q; }, in: (_key: string, values: string[]) => { ids = values; return q; }, limit: () => q, maybeSingle: async () => { const r = run(); return { ...r, data: r.data[0] ?? null }; }, then: (resolve: any) => resolve(run()) };
    return q;
  });
}
beforeEach(() => {
  vi.clearAllMocks(); m.after.length = 0;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "mock-only-key";
  m.auth.mockResolvedValue({ user: { id: "owner" } });
  children = Array.from({ length: 4 }, (_, i) => ({ id: stageGenerationId(id, i + 1), user_id: "owner", status: "completed", storage_path: `owner/${i}.png`, credits_cost: 20 }));
  row = { id, user_id: "owner", status: "failed", created_at: "2026-10-21T23:26:12Z", metadata: { type: TASK_TYPE, taskKind: "slideshow", phase: "failed", revision: 5, images: children.map(c => ({ id: c.id, url: "old" })), creditsConsumed: 80, creditState: "confirmed", progress: 73, updatedAt: "2026-10-21T23:28:00Z", error: "dispatch", input: { product: { name: "mock", description: "mock" }, duration: 25, musicId: "", locale: "fr" }, stages: children.map((c, i) => ({ step: i + 1, kind: "image", state: "completed", generationId: c.id, cost: 20, creditState: "confirmed" })) } };
  m.generate.mockImplementation(async (_user, _input, stage) => { children.push({ id: stage.generationId, user_id: "owner", status: "completed", storage_path: "owner/fifth.png", credits_cost: 20 }); return Response.json({ generationId: stage.generationId, imageUrl: "https://stored.test/fifth.png", cost: 20 }); });
  m.render.mockResolvedValue({ generationId: "mp4", videoUrl: "https://stored.test/final.mp4" });
  vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 202 })));
  database();
});
function configureVoiceShortage() {
  const images = Array.from({ length: 5 }, (_, i) => ({ id: stageGenerationId(id, i + 1), url: `old-${i}` }));
  children = images.map((image, i) => ({ id: image.id, user_id: "owner", status: "completed", storage_path: `owner/${i}.png`, credits_cost: 20 }));
  row.metadata = {
    ...row.metadata, phase: "failed", revision: 6, images, creditsConsumed: 100,
    input: { product: { name: "mock", description: "mock" }, duration: 25, musicId: "", locale: "fr", campaignGoal: "buy", voiceover: true },
    errorCode: "STUDIO_STEP_FAILED",
    error: "Source insuffisante pour une narration couvrant 25s (54 mots disponibles, 61 requis); TTS non lancé.",
    stages: [...images.map((image, i) => ({ step: i + 1, kind: "image", state: "completed", generationId: image.id, cost: 20, creditState: "confirmed" })),
      { step: 6, kind: "render", state: "uncertain", generationId: stageGenerationId(id, 6), cost: 0, creditState: "uncertain" }],
  };
  return { images, originalIds: images.map(image => image.id) };
}
describe("continue route no-charge integration", () => {
  it("GET loads the four saved images, 80 credits and quote without scheduling any work", async () => {
    const response = await GET(new Request("https://test.invalid"), context); const data = await response.json();
    expect(response.status).toBe(200); expect(data.task.images).toHaveLength(4); expect(data.task.creditsConsumed).toBe(80);
    expect(data.task.resume).toMatchObject({ allowed: true, cost: 20 }); expect(m.after).toHaveLength(0); expect(m.generate).not.toHaveBeenCalled();
  });
  it("one double-click queues one continuation and creates only the missing fifth image", async () => {
    const responses = await Promise.all([POST(request({ expectedRevision: 5, confirmCost: 20 }), context), POST(request({ expectedRevision: 5, confirmCost: 20 }), context)]);
    expect(responses.map(r => r.status).sort()).toEqual([202, 409]); expect(m.after).toHaveLength(1);
    expect(row.status).toBe("processing"); expect(m.generate).not.toHaveBeenCalled();
    const firstFour = row.metadata.images.map((i: any) => i.id);
    await m.after[0]();
    expect(m.generate).not.toHaveBeenCalled();
    await runTaskStep(id, 5);
    expect(m.generate).toHaveBeenCalledTimes(1); expect(row.metadata.images).toHaveLength(5);
    expect(row.metadata.images.slice(0, 4).map((i: any) => i.id)).toEqual(firstFour); expect(row.metadata.creditsConsumed).toBe(100);
    await runTaskStep(id, 5); expect(m.generate).toHaveBeenCalledTimes(1);
    await runTaskStep(id, 6); expect(m.render).toHaveBeenCalledTimes(1); expect(row.status).toBe("completed");
    expect(m.generate).toHaveBeenCalledTimes(1);
  });
  it("requires exact visible cost confirmation before queueing", async () => {
    expect((await POST(request({ expectedRevision: 5, confirmCost: 0 }), context)).status).toBe(409);
    expect(row.metadata.images).toHaveLength(4); expect(row.metadata.creditsConsumed).toBe(80); expect(m.after).toHaveLength(0); expect(m.generate).not.toHaveBeenCalled();
  });
  it("unknown paid stage is blocked without provider calls or mutation", async () => {
    row.metadata.stages.push({ step: 5, kind: "image", state: "uncertain", generationId: stageGenerationId(id, 5), cost: 20, creditState: "uncertain" });
    const original = structuredClone(row);
    const response = await POST(request({ expectedRevision: 5, confirmCost: 20 }), context);
    expect(response.status).toBe(409); expect((await response.json()).reason).toBe("STAGE_UNCERTAIN");
    expect(row).toEqual(original); expect(m.after).toHaveLength(0); expect(m.generate).not.toHaveBeenCalled();
  });
  it("retries only the render for a verified 5-image short-source task after validating added details", async () => {
    const { originalIds } = configureVoiceShortage();
    const getResponse = await GET(new Request("https://test.invalid"), context);
    const getData = await getResponse.json();
    expect(getData.task.resume).toMatchObject({ allowed: false, voiceSourceRetryAllowed: true, reason: "VOICE_SOURCE_TOO_SHORT", requiredNarrationWords: 61, maximumNarrationWords: 68, cost: 0 });
    expect(getData.task.error).toContain("Ajoute quelques faits précis");
    const response = await POST(request({ expectedRevision: 6, confirmCost: 0, productDescription: richDescription }), context);
    expect(response.status, JSON.stringify(await response.clone().json())).toBe(202);
    expect(m.after).toHaveLength(1);
    expect(row.status).toBe("processing");
    expect(row.metadata.revision).toBe(7);
    expect(row.metadata.input.product.description).toBe(richDescription);
    expect(row.metadata.images.map((image: any) => image.id)).toEqual(originalIds);
    expect(row.metadata.creditsConsumed).toBe(100);
    expect(m.generate).not.toHaveBeenCalled();
    await m.after[0]();
    await runTaskStep(id, 7);
    expect(m.render).toHaveBeenCalledTimes(1);
    expect(m.render).toHaveBeenCalledWith("owner", originalIds, 25, "", id,
      expect.objectContaining({ product: expect.objectContaining({ name: "mock", description: richDescription }), campaignGoal: "buy", locale: "fr" }), undefined, undefined);
    expect(m.generate).not.toHaveBeenCalled();
    expect(row.metadata.images.map((image: any) => image.id)).toEqual(originalIds);
    expect(row.metadata.creditsConsumed).toBe(100);
    expect(row.status).toBe("completed");
  });
  it("does not queue if the added narration details are still too short", async () => {
    configureVoiceShortage();
    const original = structuredClone(row);
    const response = await POST(request({ expectedRevision: 6, confirmCost: 0, productDescription: "Quelques détails du produit." }), context);
    expect(response.status).toBe(409);
    expect(row).toEqual(original);
    expect(m.after).toHaveLength(0);
    expect(m.generate).not.toHaveBeenCalled();
    expect(m.render).not.toHaveBeenCalled();
  });
  it("resumes the proved legacy queued dispatch checkpoint without recreating the four images", async () => {
    delete row.metadata.stages; row.metadata.error = "Le suivi serveur n’a pas pu continuer. Aucune étape payante n’est relancée.";
    expect((await POST(request({ expectedRevision: 5, confirmCost: 20 }), context)).status).toBe(202);
    expect(row.metadata.stages).toHaveLength(4); await m.after[0](); await runTaskStep(id, 5); expect(m.generate).toHaveBeenCalledTimes(1); expect(row.metadata.images).toHaveLength(5);
  });
  it("arbitrary legacy failure stays unknown and missing stored sources block continuation", async () => {
    delete row.metadata.stages;
    expect((await POST(request({ expectedRevision: 5, confirmCost: 20 }), context)).status).toBe(409);
    row.metadata.error = "Le suivi serveur n’a pas pu continuer. Aucune étape payante n’est relancée."; children.pop();
    expect((await POST(request({ expectedRevision: 5, confirmCost: 20 }), context)).status).toBe(409);
    expect(m.after).toHaveLength(0); expect(m.generate).not.toHaveBeenCalled();
  });
  it("does not expose or resume another user's task", async () => {
    m.auth.mockResolvedValue({ user: { id: "other" } });
    expect((await GET(new Request("https://test.invalid"), context)).status).toBe(404);
    expect((await POST(request({ expectedRevision: 5, confirmCost: 20 }), context)).status).toBe(404);
    expect(m.after).toHaveLength(0);
  });
});
