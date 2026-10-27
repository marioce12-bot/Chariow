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
const input = { voiceover: true, product: { name: "Guide", description: "Disponible au format PDF. Le guide comporte huit chapitres consacrés à la préparation du jardin. Chaque chapitre présente trois exercices pratiques, une liste de matériel et un calendrier saisonnier. Les fiches expliquent le choix des graines, la préparation du sol, l’arrosage régulier, la rotation des cultures et la récolte. Les illustrations montrent des plantations en pots et en pleine terre. Le téléchargement permet une lecture hors connexion sur téléphone ou tablette." }, duration: 25, musicId: "", locale: "fr" };
const request = (taskInput = input) => new Request("https://preview.test/api/studio/tasks", { method: "POST", body: JSON.stringify({ id, kind: "slideshow", input: taskInput }) });
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
  it("refuse une description de 54 mots avant lecture du solde, toute image et tout lancement", async () => {
    const insert = configureDb({ balance: 100, reserved: 0 });
    const shortInput = { ...input, product: { name: "Guide Atlas", description: "Le guide est disponible en PDF. Il présente les bases du jardinage. Chaque chapitre décrit une étape du potager. Les fiches expliquent la préparation du sol. Des exercices aident à organiser les plantations. Un calendrier accompagne le suivi des cultures. Les illustrations montrent des plantes en pots. Le téléchargement permet une lecture hors connexion." } };
    const response = await POST(request(shortInput));
    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body).toMatchObject({ code: "INSUFFICIENT_PRODUCT_DETAILS", duration: 25, requiredWords: 58 });
    expect(body.wordCount).toBeLessThan(body.requiredWords);
    expect(body.missingWords).toBe(body.requiredWords - body.wordCount);
    expect(body.error).toContain("La description de ce produit dans ta boutique est trop courte pour une voix off de 25 secondes.");
    expect(body.error).toContain(`il en manque environ ${body.missingWords}`);
    expect(body.error).toContain("Aucune image n'a été générée et aucun crédit n'a été consommé.");
    expect(mocks.from.mock.calls.map(([table]) => table)).toEqual(["studio_generations"]);
    expect(insert).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.render).not.toHaveBeenCalled();
  });
  it("ne transforme pas un refus storyboard en erreur de précontrôle vocal au stage voice_plan", async () => {
    const insert = configureDb({ balance: 100, reserved: 0 });
    const duplicateInput = { ...input, product: { name: "Guide Atlas", description: "Disponible au format PDF. Disponible au format PDF. Disponible au format PDF." } };
    const response = await POST(request(duplicateInput));
    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body).toMatchObject({ code: "INSUFFICIENT_PRODUCT_DETAILS" });
    expect(body.error).toContain("informations distinctes");
    expect(body.error).not.toContain("voix off");
    expect(body).not.toHaveProperty("duration");
    expect(body).not.toHaveProperty("requiredWords");
    expect(body).not.toHaveProperty("missingWords");
    expect(body).not.toHaveProperty("wordCount");
    expect(mocks.from.mock.calls.map(([table]) => table)).toEqual(["studio_generations"]);
    expect(insert).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
  });
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
  it("retourne un 409 explicite quand un conflit d’ID correspond à une tâche déjà acceptée", async () => {
    const lookups = vi.fn()
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: insertedRow, error: null });
    const insert = vi.fn(() => ({ select: () => ({ single: async () => ({ data: null, error: { code: "23505" } }) }) }));
    mocks.from.mockImplementation((table: string) => table === "credit_accounts"
      ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { balance: 100, reserved: 0 }, error: null }) }) }) }
      : { select: () => ({ eq: () => ({ maybeSingle: lookups }) }), insert });
    const response = await POST(request());
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "TASK_ALREADY_ACCEPTED" });
    expect(lookups).toHaveBeenCalledTimes(2);
    expect(insert).toHaveBeenCalledOnce();
    expect(mocks.after).not.toHaveBeenCalled();
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it("conserve l’interface française et persiste la création anglaise sans génération réelle", async () => {
    const insert = configureDb({ balance: 100, reserved: 0 });
    const englishInput = { ...input, product: { name: "Guide pratique", description: "This guide is available in PDF format. The guide contains eight chapters about preparing a garden. Each chapter includes three practical exercises, a materials checklist and a seasonal calendar. The worksheets explain seed selection, soil preparation, regular watering, crop rotation and harvesting. The illustrations show plants grown in pots and in the ground. The download can be read offline on a phone or tablet." } };
    const response = await POST(request(englishInput));
    expect(response.status).toBe(202);
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ metadata: expect.objectContaining({ input: expect.objectContaining({ locale: "fr", contentLanguage: "en" }) }) }));
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.render).not.toHaveBeenCalled();
  });
  it("garde les erreurs en français même si le produit est anglais", async () => {
    configureDb({ balance: 0, reserved: 0 });
    const englishInput = { ...input, product: { name: "Practical Guide", description: "This guide is available in PDF format. The guide contains eight chapters about preparing a garden. Each chapter includes three practical exercises, a materials checklist and a seasonal calendar. The worksheets explain seed selection, soil preparation, regular watering, crop rotation and harvesting. The illustrations show plants grown in pots and in the ground. The download can be read offline on a phone or tablet." } };
    const response = await POST(request(englishInput));
    expect(response.status).toBe(402);
    expect((await response.json()).error).toContain("Solde insuffisant");
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it("répond 503 sans rien créer si le solde ne peut pas être lu", async () => {
    const insert = configureDb(null, { message: "db down" });
    expect((await POST(request())).status).toBe(503);
    expect(insert).not.toHaveBeenCalled(); expect(mocks.after).not.toHaveBeenCalled();
  });
});
