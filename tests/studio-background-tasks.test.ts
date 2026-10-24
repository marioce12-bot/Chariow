import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(), generate: vi.fn(), preflight: vi.fn(), render: vi.fn(), dispatch: vi.fn(),
  requireUser: vi.fn(), subscription: vi.fn(), rateLimit: vi.fn(), after: vi.fn((fn: () => unknown) => { void fn; }),
  preview: vi.fn(() => true), start: vi.fn(),
}));
vi.mock("workflow/api", () => ({ start: mocks.start }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: mocks.from }) }));
vi.mock("@/lib/studio/image-generation", () => ({ generateStudioImage: mocks.generate }));
vi.mock("@/lib/studio/slideshow-server", () => ({ preflightSlideshow: mocks.preflight, renderSlideshow: mocks.render, isPreviewEnabled: mocks.preview }));
vi.mock("@/lib/studio/media", () => ({ signedStudioUrl: vi.fn(async (path: string) => `https://signed.test/${path}`) }));
vi.mock("next/server", () => ({ NextResponse: { json: (body: unknown, init?: ResponseInit) => new Response(JSON.stringify(body), init) }, after: mocks.after }));
vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/subscription/access", () => ({ requireActiveSubscription: mocks.subscription }));
vi.mock("@/lib/shop/rate-limit", () => ({ rateLimit: mocks.rateLimit }));

import { publicTask, runTaskStep, TASK_TYPE, stageGenerationId, taskToken } from "@/lib/studio/background-tasks";
import { studioTaskWorkflow } from "@/lib/studio/task-workflow";
import { GET, POST as createTask } from "@/app/api/studio/tasks/route";
import { POST as workerPost } from "@/app/api/studio/tasks/worker/route";

const id = "123e4567-e89b-42d3-a456-426614174000";
const user = { id: "user-1" };
const rowFor = (metadata: any, status = "processing") => ({ id, user_id: user.id, status, metadata, created_at: "2026-01-01" });
function metadata(kind: "image" | "slideshow" = "image", extra: any = {}) {
  return { type: TASK_TYPE, taskKind: kind, input: kind === "image" ? { prompt: "un paysage" } : { product: { name: "Produit", description: "Disponible au format PDF. Des exercices accompagnent chaque chapitre. La lecture est possible sans connexion." }, duration: 25, musicId: "", locale: "fr", campaignGoal: "discover" }, revision: 0, phase: "queued", progress: 1, message: "queued", updatedAt: new Date().toISOString(), images: [], ...extra };
}
function configureDb(row: any, claimWon = true) {
  const updates: any[] = [];
  mocks.from.mockImplementation(() => ({
    select: () => {
      const filters: Record<string, any> = {};
      const chain: any = { eq: (key: string, value: any) => { filters[key] = value; return chain; }, maybeSingle: async () => ({ data: row, error: null }) };
      return chain;
    },
    update: (values: any) => {
      updates.push(values);
      const filters: Record<string, any> = {};
      const matches = () => Object.entries(filters).every(([key, value]) => {
        if (key === "id") return row.id === value;
        if (key === "status") return row.status === value;
        if (key === "metadata->>phase") return row.metadata?.phase === value;
        if (key === "metadata->>revision") return String(row.metadata?.revision) === value;
        return true;
      });
      const apply = () => {
        if (matches()) {
          if (values.metadata) row.metadata = values.metadata;
          if (values.status) row.status = values.status;
          if (values.error) row.error = values.error;
        }
        return { data: null, error: null };
      };
      const chain: any = {
        eq: (key: string, value: any) => { filters[key] = value; return chain; },
        select: async () => {
          const won = claimWon && matches();
          if (won) { if (values.metadata) row.metadata = values.metadata; if (values.status) row.status = values.status; }
          return { data: won ? [{ id }] : [], error: null };
        },
      };
      chain.then = (resolve: any) => resolve(apply());
      return chain;
    },
  }));
  (updates as any).row = row;
  return updates;
}
const ok = (body: any) => ({ ok: true, json: async () => body });

beforeEach(() => {
  vi.clearAllMocks(); process.env.SUPABASE_SERVICE_ROLE_KEY = "test-secret";
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 202 })));
  mocks.after.mockImplementation((fn: () => unknown) => { void fn; });
  mocks.dispatch.mockResolvedValue(undefined);
  mocks.from.mockReset();
  mocks.generate.mockResolvedValue(ok({ generationId: "gen-1", imageUrl: "https://image.test/1" }));
});

describe("runTaskStep", () => {
  it("utilise le claim CAS pour ignorer un worker doublon sans génération", async () => {
    configureDb(rowFor(metadata()), false);
    await runTaskStep(id, 0);
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it("génère une image et persiste l'étape suivante", async () => {
    const updates = configureDb(rowFor(metadata()));
    await runTaskStep(id, 0);
    expect(mocks.generate).toHaveBeenCalledWith(user.id, { prompt: "un paysage" }, { generationId: stageGenerationId(id, 0), taskId: id, step: 0 });
    expect(updates[1]).toMatchObject({ status: "completed", metadata: { phase: "completed", revision: 1, result: { generationId: "gen-1" } } });
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });
  it("marque un échec sans nouvelle tentative du fournisseur", async () => {
    const updates = configureDb(rowFor(metadata()));
    mocks.generate.mockResolvedValue({ ...ok({ error: "provider error" }), ok: false });
    await runTaskStep(id, 0);
    expect(updates.at(-1)).toMatchObject({ status: "failed", metadata: { phase: "failed", errorCode: "STUDIO_IMAGE_HTTP" } });
    expect(mocks.dispatch).not.toHaveBeenCalled();
    expect(mocks.generate).toHaveBeenCalledTimes(1);
  });
  it("persiste 4/5 puis retourne la révision 5 sans aucun appel HTTP récursif", async () => {
    const row = rowFor(metadata("slideshow", { revision: 4, images: Array.from({ length: 3 }, (_, i) => ({ id: `g${i}`, url: `u${i}` })) }));
    configureDb(row);
    vi.mocked(fetch).mockResolvedValue(new Response("recursion blocked", { status: 508 }));
    expect(await runTaskStep(id, 4)).toBe(5);
    expect(row.status).toBe("processing");
    expect(row.metadata.images).toHaveLength(4);
    expect(row.metadata.creditsConsumed).toBe(80);
    expect(row.metadata.phase).toBe("queued");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("conserve les quatre images si le cinquième fournisseur échoue et ne le rejoue pas", async () => {
    const images = Array.from({ length: 4 }, (_, i) => ({ id: `g${i}`, url: `u${i}` }));
    const row = rowFor(metadata("slideshow", { revision: 5, images, creditsConsumed: 80 }));
    configureDb(row);
    mocks.generate.mockResolvedValue({ ...ok({ error: "provider error" }), ok: false });
    expect(await runTaskStep(id, 5)).toBeUndefined();
    expect(row.status).toBe("failed");
    expect(row.metadata.images).toEqual(images);
    expect(row.metadata.creditsConsumed).toBe(80);
    expect(row.metadata.errorCode).toBe("STUDIO_IMAGE_HTTP");
    expect(row.metadata.stages.at(-1).state).toBe("uncertain");
    await runTaskStep(id, 5);
    expect(mocks.generate).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("ne reprend jamais une étape running incertaine même avec le même token", async () => {
    configureDb(rowFor(metadata("slideshow", { revision: 5, phase: "running", images: Array.from({ length: 4 }, (_, i) => ({ id: `g${i}`, url: `u${i}` })) })));
    await runTaskStep(id, 5); await runTaskStep(id, 5);
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it("utilise une identité stable distincte pour chaque étape", () => {
    expect(stageGenerationId(id, 4)).toBe(stageGenerationId(id, 4));
    expect(stageGenerationId(id, 4)).not.toBe(stageGenerationId(id, 5));
    expect(stageGenerationId(id, 4)).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/);
  });
  it("bloque un récit répétitif avant préflight, images et dispatch", async () => {
    const meta = metadata("slideshow");
    meta.input.product.description = "Le pack réunit trois guides pratiques. Le pack rassemble 3 ouvrages pratiques.";
    const updates = configureDb(rowFor(meta));
    await runTaskStep(id, 0);
    expect(updates.at(-1)).toMatchObject({ status: "failed", metadata: { phase: "failed" } });
    expect(mocks.preflight).not.toHaveBeenCalled(); expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.render).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });
  it("n'annonce jamais 100 sans MP4 prêt", async () => {
    const row = rowFor(metadata("slideshow", { revision: 6, images: Array.from({ length: 5 }, (_, i) => ({ id: `g${i}`, url: `u${i}` })) }));
    configureDb(row); mocks.render.mockResolvedValue({ generationId: "video-1" });
    await runTaskStep(id, 6);
    expect(row.status).toBe("failed"); expect(row.metadata.progress).not.toBe(100);
    expect(row.metadata.errorCode).toBe("STUDIO_MP4_NOT_READY");
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it("le workflow complète réellement les cinq checkpoints et le MP4 sans réseau ni récursion", async () => {
    const row = rowFor(metadata("slideshow"));
    configureDb(row);
    mocks.generate.mockImplementation(async (_user, _input, stage) => ok({ generationId: stage.generationId, imageUrl: `https://fixture.test/${stage.step}` }));
    mocks.render.mockResolvedValue({ generationId: "fixture-mp4", videoUrl: "https://fixture.test/final.mp4" });
    await studioTaskWorkflow(id, 0);
    expect(row.status).toBe("completed");
    expect(row.metadata).toMatchObject({ revision: 7, phase: "completed", progress: 100, creditsConsumed: 100 });
    expect(row.metadata.images).toHaveLength(5);
    expect(row.metadata.stages).toHaveLength(7);
    expect(new Set(row.metadata.images.map((image: any) => image.id)).size).toBe(5);
    expect(mocks.preflight).toHaveBeenCalledTimes(1);
    expect(mocks.generate).toHaveBeenCalledTimes(5);
    expect(mocks.render).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("fait le préflight puis les cinq images puis le rendu aux phases correspondantes", async () => {
    const slideshowInput = metadata("slideshow").input;
    configureDb(rowFor(metadata("slideshow")));
    await runTaskStep(id, 0);
    expect(mocks.preflight).toHaveBeenCalledWith("");
    expect(mocks.generate).not.toHaveBeenCalled();

    for (let index = 0; index < 5; index++) {
      const meta = metadata("slideshow", { input: slideshowInput, revision: index + 1, images: Array.from({ length: index }, (_, i) => ({ id: `g${i}`, url: `u${i}` })) });
      configureDb(rowFor(meta));
      await runTaskStep(id, index + 1);
    }
    expect(mocks.generate).toHaveBeenCalledTimes(5);
    const fullMeta = metadata("slideshow", { input: slideshowInput, revision: 6, images: Array.from({ length: 5 }, (_, i) => ({ id: `g${i}`, url: `u${i}` })) });
    const updates = configureDb(rowFor(fullMeta));
    mocks.render.mockResolvedValue({ generationId: "video-1", videoUrl: "https://video.test/1" });
    await runTaskStep(id, 6);
    expect(mocks.render).toHaveBeenCalledWith(user.id, ["g0", "g1", "g2", "g3", "g4"], 25, "", id, undefined, undefined, undefined);
    expect(updates.at(-1).metadata).toMatchObject({ phase: "completed", revision: 7 });
  });
});

describe("routes des tâches studio", () => {
  it("rejette un token worker absent ou à signature incorrecte", async () => {
    const request = (token: string) => new Request("http://localhost/api/studio/tasks/worker", { method: "POST", headers: { "content-type": "application/json", "x-studio-task-token": token }, body: JSON.stringify({ id, revision: 0 }) });
    expect((await workerPost(request(""))).status).toBe(401);
    expect((await workerPost(request("0".repeat(64)))).status).toBe(401);
    expect(mocks.after).not.toHaveBeenCalled();
  });
  it("accepte le worker signé en lançant le workflow durable, pas une étape récursive", async () => {
    const response = await workerPost(new Request("http://localhost/api/studio/tasks/worker", { method: "POST", headers: { "content-type": "application/json", "x-studio-task-token": taskToken(id, 0) }, body: JSON.stringify({ id, revision: 0 }) }));
    expect(response.status).toBe(202);
    await mocks.after.mock.calls[0][0]();
    expect(mocks.start).toHaveBeenCalledWith(expect.any(Function), [id, 0]);
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("ne retourne en GET que les tâches du propriétaire", async () => {
    mocks.requireUser.mockResolvedValue({ user, response: null });
    let filteredOwner: string | undefined;
    mocks.from.mockReturnValue({ select: () => ({ eq: (_key: string, value: string) => { filteredOwner = value; return { eq: () => ({ order: () => ({ limit: async () => ({ data: [], error: null }) }) }) }; } }) });
    const response = await GET(new Request("https://preview.test/api/studio/tasks"));
    expect(response.status).toBe(200);
    expect(filteredOwner).toBe(user.id);
    expect(await response.json()).toEqual({ tasks: [] });
  });
  it("un résultat supprimé reste null et les liens d’image sont resignés", async () => {
    const taskRow = rowFor(metadata("slideshow", { images: [{ id: "img-kept", url: "https://old.test/image" }], result: { generationId: "video-deleted", videoUrl: "https://old.test/video" } }));
    const queries: string[] = [];
    mocks.from.mockImplementation(() => ({
      select: () => {
        const chain: any = {
          in: (_key: string, ids: string[]) => { queries.push(`in:${ids.join(",")}`); return chain; },
          eq: () => chain,
          limit: async (n: number) => { queries.push(`limit:${n}`); return { data: [{ id: "img-kept", status: "completed", storage_path: "user-1/img-kept.png" }], error: null }; },
          maybeSingle: async () => ({ data: null, error: null }),
        };
        return chain;
      },
    }));
    const adminModule = await import("@/lib/supabase/admin");
    vi.spyOn(adminModule, "createAdminClient").mockReturnValue({
      from: mocks.from,
      storage: { from: () => ({ createSignedUrl: async (path: string) => ({ data: { signedUrl: `https://signed.test/${path}` }, error: null }) }) },
    } as any);
    const result = await publicTask(taskRow);
    expect(result.result).toBeNull();
    expect(result.images[0].url).toBe("https://signed.test/user-1/img-kept.png");
    expect(queries).toContain("in:img-kept");
    expect(queries).toContain("limit:5");
  });
  it("récupère en lecture seule l'image enfant si l'écriture parent a été perdue", async () => {
    const taskRow = rowFor(metadata("slideshow", { phase: "failed", stages: [{ step: 1, kind: "image", state: "uncertain", generationId: "child-saved", cost: 20, creditState: "uncertain", startedAt: new Date().toISOString() }] }), "failed");
    mocks.from.mockImplementation(() => ({ select: () => {
      const chain: any = { in: () => chain, eq: () => chain, limit: async () => ({ data: [{ id: "child-saved", storage_path: "owner/child.png", status: "completed", credits_cost: 20 }], error: null }) }; return chain;
    } }));
    const result = await publicTask(taskRow);
    expect(result.images).toHaveLength(1); expect(result.images[0].id).toBe("child-saved");
    expect(result.creditsConsumed).toBe(20); expect(mocks.generate).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });
  it("expose la variation persistée pour restaurer le même seed depuis l’historique", async () => {
    const taskRow = rowFor(metadata("slideshow", { input: { ...metadata("slideshow").input, variationId: "stable-seed-42" } }));
    const result = await publicTask(taskRow);
    expect(result.input?.variationId).toBe("stable-seed-42");
    expect(mocks.generate).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });
  it("POST répété par le même propriétaire ne redéclenche pas la tâche", async () => {
    mocks.requireUser.mockResolvedValue({ user, response: null });
    const existing = rowFor(metadata());
    mocks.from.mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: existing, error: null }) }) }) });
    const request = new Request("http://localhost/api/studio/tasks", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, kind: "image", input: { prompt: "x" } }) });
    const response = await createTask(request);
    expect(response.status).toBe(200);
    expect(mocks.after).not.toHaveBeenCalled();
    expect(mocks.subscription).not.toHaveBeenCalled();
  });
});

describe("reprise après indisponibilité des URL signées", () => {
  it("conserve les IDs enfants vérifiés et le coût même si la signature échoue", async () => {
    const taskRow = rowFor(metadata("slideshow", {
      phase: "failed", revision: 2,
      stages: [{ step: 1, kind: "image", state: "completed", generationId: "child-429", cost: 20, creditState: "confirmed", startedAt: new Date().toISOString() }],
    }), "failed");
    const media = await import("@/lib/studio/media");
    const urls = vi.mocked(media.signedStudioUrl);
    urls.mockRejectedValueOnce(new Error("storage 429"));
    const adminModule = await import("@/lib/supabase/admin");
    vi.spyOn(adminModule, "createAdminClient").mockReturnValue({
      from: () => ({ select: () => ({ in: () => ({ eq: () => ({ limit: async () => ({ data: [{ id: "child-429", status: "completed", storage_path: "owner/child.png", credits_cost: 20 }], error: null }) }) }) }) }),
      storage: { from: () => ({ createSignedUrl: urls }) },
    } as any);
    const task = await publicTask(taskRow);
    expect(task.images).toEqual([{ id: "child-429", url: null }]);
    expect(task.sourceImagesConfirmed).toBe(true);
    expect(urls).toHaveBeenCalledTimes(1);
    expect(task.creditsConsumed).toBe(20);
  });
});
