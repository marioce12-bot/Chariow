import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ from: vi.fn(), generate: vi.fn(), render: vi.fn(), preflight: vi.fn(), after: vi.fn(), user: vi.fn(), subscription: vi.fn() }));
vi.mock("workflow/api", () => ({ start: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: mocks.from }) }));
vi.mock("@/lib/studio/image-generation", () => ({ generateStudioImage: mocks.generate }));
vi.mock("@/lib/studio/slideshow-server", () => ({ renderSlideshow: mocks.render, preflightSlideshow: mocks.preflight, isPreviewEnabled: () => true }));
vi.mock("@/lib/studio/media", () => ({ signedStudioUrl: async (p: string) => `signed:${p}` }));
vi.mock("next/server", () => ({ after: mocks.after, NextResponse: { json: (body: unknown, init?: ResponseInit) => new Response(JSON.stringify(body), init) } }));
vi.mock("@/lib/auth", () => ({ requireUser: mocks.user }));
vi.mock("@/lib/subscription/access", () => ({ requireActiveSubscription: mocks.subscription }));
vi.mock("@/lib/shop/rate-limit", () => ({ rateLimit: () => false }));
import { POST } from "@/app/api/studio/tasks/route";
import { TASK_TYPE } from "@/lib/studio/background-tasks";
const id = "123e4567-e89b-42d3-a456-426614174000";
const input = { voiceover: true, product: { name: "Guide", description: "Disponible au format PDF. Des exercices accompagnent chaque chapitre. La lecture est possible sans connexion." }, duration: 25, musicId: "", locale: "fr" };
const request = () => new Request("https://preview.test/api/studio/tasks", { method: "POST", body: JSON.stringify({ id, kind: "slideshow", input }) });
const insertedRow = { id, user_id: "owner", status: "processing", metadata: { type: TASK_TYPE, taskKind: "slideshow", input: { voiceover: true }, revision: 0, phase: "queued" } };
function configureDb(account: { balance: number; reserved: number } | null, accountError: unknown = null) {
  const insert = vi.fn(() => ({ select: () => ({ single: async () => ({ data: insertedRow, error: null }) }) }));
  mocks.from.mockImplementation((table: string) => table === "credit_accounts"
    ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: account, error: accountError }) }) }) }
    : { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }), insert });
  return insert;
}
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("VERCEL_ENV", "preview"); vi.stubEnv("VENDEO_SLIDESHOW_TTS_TEST_ALLOWED", "false");
  vi.stubEnv("VENDEO_SLIDESHOW_TTS_ENABLED", "true"); vi.stubEnv("VENDEO_GEMINI_FREE_TIER_CONFIRMED", "true");
  mocks.user.mockResolvedValue({ user: { id: "owner" } }); mocks.subscription.mockResolvedValue(null);
});
describe("pré-vérification du solde avant lancement d’un diaporama", () => {
  it("refuse avec 402 INSUFFICIENT_CREDITS quand le solde disponible est inférieur à 100, sans insertion ni dispatch", async () => {
    const insert = configureDb({ balance: 60, reserved: 0 });
    const response = await POST(request());
    const body = await response.json();
    expect(response.status).toBe(402);
    expect(body).toMatchObject({ code: "INSUFFICIENT_CREDITS", required: 100, balance: 60 });
    expect(body.error).toContain("Solde insuffisant");
    expect(insert).not.toHaveBeenCalled(); expect(mocks.after).not.toHaveBeenCalled(); expect(mocks.generate).not.toHaveBeenCalled();
  });
  it("déduit les crédits déjà réservés du solde disponible", async () => {
    const insert = configureDb({ balance: 150, reserved: 80 });
    const response = await POST(request());
    expect(response.status).toBe(402);
    expect(await response.json()).toMatchObject({ balance: 70, required: 100 });
    expect(insert).not.toHaveBeenCalled();
  });
  it("traite l’absence de compte crédits comme un solde nul", async () => {
    const insert = configureDb(null);
    expect((await POST(request())).status).toBe(402);
    expect(insert).not.toHaveBeenCalled();
  });
  it("accepte et lance la tâche quand le solde disponible couvre exactement 100 crédits", async () => {
    const insert = configureDb({ balance: 100, reserved: 0 });
    const response = await POST(request());
    expect(response.status).toBe(202);
    expect(insert).toHaveBeenCalledOnce(); expect(mocks.after).toHaveBeenCalledOnce();
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it("répond 503 sans rien créer si le solde ne peut pas être lu", async () => {
    const insert = configureDb(null, { message: "db down" });
    expect((await POST(request())).status).toBe(503);
    expect(insert).not.toHaveBeenCalled(); expect(mocks.after).not.toHaveBeenCalled();
  });
});
