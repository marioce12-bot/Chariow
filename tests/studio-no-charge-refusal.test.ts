import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ from: vi.fn(), generate: vi.fn(), preflight: vi.fn(), render: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: mocks.from }) }));
vi.mock("@/lib/studio/image-generation", () => ({ generateStudioImage: mocks.generate }));
vi.mock("@/lib/studio/slideshow-server", () => ({ preflightSlideshow: mocks.preflight, renderSlideshow: mocks.render, isPreviewEnabled: () => true }));
import { continuationQuote, runTaskStep, TASK_TYPE } from "@/lib/studio/background-tasks";

const id = "123e4567-e89b-42d3-a456-426614174000";
const rowFor = (metadata: any, status = "processing") => ({ id, user_id: "user-1", status, metadata, created_at: "2026-01-01" });
const images = Array.from({ length: 3 }, (_, i) => ({ id: `g${i}`, url: `u${i}` }));
const slideshow = (extra: any = {}) => ({ type: TASK_TYPE, taskKind: "slideshow", input: { product: { name: "Produit", description: "Disponible au format PDF. Des exercices accompagnent chaque chapitre. La lecture est possible sans connexion." }, duration: 25, musicId: "", locale: "fr", campaignGoal: "discover" }, revision: 4, phase: "queued", progress: 56, message: "queued", updatedAt: new Date().toISOString(), images, stages: [], ...extra });
function configureDb(row: any) {
  mocks.from.mockImplementation(() => ({
    select: () => {
      const chain: any = { eq: () => chain, maybeSingle: async () => ({ data: row, error: null }) };
      return chain;
    },
    update: (values: any) => {
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
        select: async () => { const won = matches(); if (won) { if (values.metadata) row.metadata = values.metadata; if (values.status) row.status = values.status; } return { data: won ? [{ id }] : [], error: null }; },
      };
      chain.then = (resolve: any) => resolve(apply());
      return chain;
    },
  }));
}
beforeEach(() => { vi.clearAllMocks(); mocks.from.mockReset(); });

describe("refus 402 sans débit pendant une étape image", () => {
  it("conserve le vrai message de solde insuffisant et ne marque aucune étape incertaine", async () => {
    const row = rowFor(slideshow());
    configureDb(row);
    const message = "Solde insuffisant. Cette image nécessite 20 crédits, ton solde est de 0.";
    mocks.generate.mockResolvedValue({ ok: false, status: 402, json: async () => ({ error: message, code: "INSUFFICIENT_CREDITS" }) });
    await runTaskStep(id, 4);
    expect(row.status).toBe("failed");
    expect(row.metadata.errorCode).toBe("STUDIO_INSUFFICIENT_CREDITS");
    expect(row.metadata.httpStatus).toBe(402);
    expect(row.metadata.error).toBe(message);
    expect(row.metadata.creditState).toBe("confirmed");
    expect(row.metadata.stages.some((stage: any) => stage.state === "uncertain" || stage.state === "running")).toBe(false);
    expect(row.metadata.images).toEqual(images);
    expect(mocks.generate).toHaveBeenCalledTimes(1);
  });
  it("la reprise reste autorisée après ce refus (coût des 2 images restantes)", async () => {
    const row = rowFor(slideshow());
    configureDb(row);
    mocks.generate.mockResolvedValue({ ok: false, status: 402, json: async () => ({ error: "Solde insuffisant.", code: "INSUFFICIENT_CREDITS" }) });
    await runTaskStep(id, 4);
    const quote = continuationQuote(row, { status: "failed", images, sourceImagesConfirmed: true });
    expect(quote).toMatchObject({ allowed: true, cost: 40, nextStep: "image" });
  });
  it("un échec fournisseur reste incertain et bloque la reprise (comportement inchangé)", async () => {
    const row = rowFor(slideshow());
    configureDb(row);
    mocks.generate.mockResolvedValue({ ok: false, status: 502, json: async () => ({ error: "provider error" }) });
    await runTaskStep(id, 4);
    expect(row.metadata.errorCode).toBe("STUDIO_IMAGE_HTTP");
    expect(row.metadata.stages.at(-1).state).toBe("uncertain");
    expect(continuationQuote(row, { status: "failed", images, sourceImagesConfirmed: true })).toMatchObject({ allowed: false, reason: "STAGE_UNCERTAIN" });
  });
});
