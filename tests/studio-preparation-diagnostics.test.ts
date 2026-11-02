import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ from: vi.fn(), insert: vi.fn(), after: vi.fn(), gate: vi.fn(), voice: vi.fn(), plan: vi.fn(), start: vi.fn() }));
vi.mock("workflow/api", () => ({ start: mocks.start }));
vi.mock("@/lib/studio/task-workflow", () => ({ studioTaskWorkflow: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireUser: async () => ({ user: { id: "PRIVATE_USER" } }) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: mocks.from }) }));
vi.mock("@/lib/subscription/access", () => ({ requireActiveSubscription: async () => null }));
vi.mock("@/lib/shop/rate-limit", () => ({ rateLimit: () => false }));
vi.mock("@/lib/studio/slideshow-server", () => ({ isPreviewEnabled: () => true }));
vi.mock("@/lib/studio/background-tasks", () => ({ TASK_TYPE: "test", logTaskEvent: vi.fn(), publicTask: async (row: unknown) => row }));
vi.mock("@/lib/studio/slideshow-plan", async (original) => ({ ...await original<object>(), buildSlideshowPlan: mocks.plan }));
vi.mock("@/lib/studio/slideshow-voice", () => ({
  SlideshowVoiceUnavailableError: class extends Error {},
  assertSlideshowVoiceAllowed: mocks.gate,
  buildSlideshowVoicePlan: mocks.voice,
  slideshowVoiceAvailability: () => ({ available: false, voiceoverEnabled: false }),
}));
vi.mock("next/server", () => ({ after: mocks.after, NextResponse: { json: (body: unknown, init?: ResponseInit) => new Response(JSON.stringify(body), init) } }));
import { POST } from "@/app/api/studio/tasks/route";
import { logPreparationFailure } from "@/lib/studio/preparation-diagnostics";
import { InsufficientProductDetailsError } from "@/lib/studio/slideshow-plan";
import { slideshowPublicFailure } from "@/lib/studio/slideshow-errors";
const id = "123e4567-e89b-42d3-a456-426614174000";
const request = (voiceover = true) => new Request("https://test.invalid/api/studio/tasks", { method: "POST", body: JSON.stringify({ id, kind: "slideshow", input: { voiceover, product: { name: "PRIVATE_PRODUCT", description: "PRIVATE_DESCRIPTION", image: "https://private.invalid/secret" }, duration: 25, musicId: "", locale: "fr", prompt: "PRIVATE_PROMPT" } }) });
let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.resetAllMocks(); warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  mocks.voice.mockReturnValue({ language: "fr", musicId: "" });
  mocks.insert.mockReturnValue({ select: () => ({ single: async () => ({ data: { id }, error: null }) }) });
  mocks.from.mockImplementation((table: string) => table === "credit_accounts"
    ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { balance: 100, reserved: 0 } }) }) }) }
    : { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }), insert: mocks.insert });
});
afterEach(() => vi.restoreAllMocks());
const diagnostic = () => JSON.parse(String(warn.mock.calls[0][0]));
const noEffects = () => {
  expect(mocks.insert).not.toHaveBeenCalled(); expect(mocks.after).not.toHaveBeenCalled(); expect(mocks.start).not.toHaveBeenCalled();
  expect(mocks.from.mock.calls.map(([table]) => table)).toEqual(["studio_generations"]);
  expect(JSON.stringify(warn.mock.calls)).not.toMatch(/PRIVATE_|private\.invalid|secret|stack/);
};
describe("server-only preparation diagnostics", () => {
  it.each([
    ["TTS diaporama réservé aux environnements preview ou production autorisés.", "VOICE_ENVIRONMENT_UNSUPPORTED"],
    ["La voix off n’est pas encore activée dans cet environnement. Aucun appel vocal effectué.", "VOICE_DISABLED"],
    ["Voix off bloquée : le palier gratuit Gemini doit être confirmé. Aucune offre payante utilisée.", "VOICE_FREE_TIER_UNCONFIRMED"],
  ])("classifies a voice gate refusal without changing the public response: %s", async (message, reason) => {
    mocks.gate.mockImplementation(() => { throw new Error(message); });
    const response = await POST(request());
    expect(response.status).toBe(400); expect(await response.json()).toEqual({ error: slideshowPublicFailure("fr"), locale: "fr" });
    expect(diagnostic()).toEqual({ event: "studio_preparation_failed", taskId: id, stage: "voice_gate", reason, status: 400 });
    expect(warn).toHaveBeenCalledOnce(); noEffects();
  });
  it.each([true, false])("locates insufficient evidence with voiceover=%s", async (voiceover) => {
    const target = voiceover ? mocks.voice : mocks.plan;
    target.mockImplementation(() => { throw new InsufficientProductDetailsError("PRIVATE_EXCEPTION"); });
    const response = await POST(request(voiceover));
    expect(response.status).toBe(400); expect(await response.json()).toMatchObject({ code: "INSUFFICIENT_PRODUCT_DETAILS" });
    expect(diagnostic()).toMatchObject({ stage: voiceover ? "voice_plan" : "slideshow_plan", reason: "INSUFFICIENT_PRODUCT_DETAILS" }); noEffects();
  });
  it.each([
    ["Invalid narration word budget", "VOICE_WORD_BUDGET_INVALID"],
    ["Nom du produit trop long pour le budget vocal de cette durée; TTS non lancé.", "VOICE_PRODUCT_NAME_TOO_LONG"],
    ["Nom et CTA complet dépassent le budget vocal; TTS non lancé.", "VOICE_CTA_BUDGET_EXCEEDED"],
  ])("classifies fixed narration failures: %s", async (message, reason) => {
    mocks.voice.mockImplementation(() => { throw new Error(message); });
    expect((await POST(request())).status).toBe(400);
    expect(diagnostic()).toMatchObject({ stage: "voice_plan", reason }); noEffects();
  });
  it.each([new Error("PRIVATE_EXCEPTION token=PRIVATE_TOKEN"), { code: "PRIVATE_CODE", message: "PRIVATE_EXCEPTION" }, "PRIVATE_EXCEPTION"])("redacts arbitrary exceptions", async (error) => {
    mocks.plan.mockImplementation(() => { throw error; });
    const response = await POST(request());
    expect(response.status).toBe(400); expect(await response.json()).toEqual({ error: slideshowPublicFailure("fr"), locale: "fr" });
    expect(diagnostic()).toMatchObject({ stage: "slideshow_plan", reason: "UNEXPECTED_PREPARATION_ERROR" }); noEffects();
  });
  it("does not log successful preparation or execute the scheduled workflow", async () => {
    expect((await POST(request())).status).toBe(202);
    expect(warn).not.toHaveBeenCalled(); expect(mocks.insert).toHaveBeenCalledOnce(); expect(mocks.after).toHaveBeenCalledOnce(); expect(mocks.start).not.toHaveBeenCalled();
  });
  it("keeps ordinary refusals working if logging fails", async () => {
    warn.mockImplementation(() => { throw new Error("logger down"); });
    mocks.gate.mockImplementation(() => { throw new Error("PRIVATE_EXCEPTION"); });
    expect((await POST(request())).status).toBe(400); expect(mocks.insert).not.toHaveBeenCalled(); expect(mocks.after).not.toHaveBeenCalled();
  });
  it("rejects unvalidated correlation identifiers and stages", () => {
    logPreparationFailure("PRIVATE_ID", "PRIVATE_STAGE" as never, new Error("PRIVATE_EXCEPTION"));
    expect(diagnostic()).toMatchObject({ taskId: null, stage: "unknown", reason: "UNEXPECTED_PREPARATION_ERROR" });
    expect(JSON.stringify(warn.mock.calls)).not.toContain("PRIVATE_");
  });
});
