import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ ask: vi.fn(), from: vi.fn(), insert: vi.fn(), after: vi.fn(), worker: vi.fn(), subscription: vi.fn(), debit: vi.fn() }));
vi.mock("next/server", () => ({ NextResponse: { json: (body: unknown, init?: ResponseInit) => new Response(JSON.stringify(body), init) }, after: mocks.after }));
vi.mock("@/lib/auth", () => ({ requireUser: async () => ({ user: { id: "user-test" } }) }));
vi.mock("@/lib/ai/text", () => ({ askText: mocks.ask }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: mocks.from }) }));
vi.mock("@/lib/subscription/access", () => ({ requireActiveSubscription: mocks.subscription }));
vi.mock("@/lib/shop/rate-limit", () => ({ rateLimit: () => false }));
vi.mock("@/lib/studio/slideshow-server", () => ({ isPreviewEnabled: () => true }));
vi.mock("@/lib/studio/background-tasks", () => ({ TASK_TYPE: "test", publicTask: vi.fn(), runTaskStep: mocks.worker }));
import { POST as prepare } from "@/app/api/studio/prompt/route";
import { POST as createTask } from "@/app/api/studio/tasks/route";
const request = (data: unknown) => new Request("http://localhost/api/studio/prompt", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
const facts = "Disponible au format PDF. Des exercices accompagnent chaque chapitre. La lecture est possible sans connexion.";
const input = (description: string) => ({ product: { name: "Atlas", description }, mediaType: "video", videoMode: "slideshow", duration: 25, aspectRatio: "9:16", musicId: "", locale: "fr" });
beforeEach(() => { vi.clearAllMocks(); mocks.subscription.mockResolvedValue(null); mocks.from.mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }), insert: mocks.insert }); });
describe("free slideshow preparation routes", () => {
  it("returns one short explanation with technical details, with no AI call or database write", async () => {
    const response = await prepare(request(input("")));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "INSUFFICIENT_PRODUCT_DETAILS", error: "Complète la description ci-dessous, puis appuie sur Relancer.", details: expect.stringContaining("insuffisantes") });
    expect(mocks.ask).not.toHaveBeenCalled(); expect(mocks.from).not.toHaveBeenCalled(); expect(mocks.after).not.toHaveBeenCalled(); expect(mocks.worker).not.toHaveBeenCalled();
  });
  it("replans supplemented text without creating a task, calling AI or spending credits", async () => {
    expect((await prepare(request(input("")))).status).toBe(400);
    const response = await prepare(request(input(facts)));
    expect(response.status).toBe(200);
    expect((await response.json()).slideshow.slides).toHaveLength(5);
    expect(mocks.ask).not.toHaveBeenCalled(); expect(mocks.from).not.toHaveBeenCalled(); expect(mocks.insert).not.toHaveBeenCalled(); expect(mocks.worker).not.toHaveBeenCalled();
  });
  it("rejects even a direct task request with duplicate facts before insertion or dispatch", async () => {
    const description = "Disponible au format PDF. Disponible au format PDF. Disponible au format PDF.";
    const response = await createTask(request({ id: "123e4567-e89b-42d3-a456-426614174000", kind: "slideshow", input: input(description) }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "INSUFFICIENT_PRODUCT_DETAILS" });
    expect(mocks.insert).not.toHaveBeenCalled(); expect(mocks.after).not.toHaveBeenCalled(); expect(mocks.worker).not.toHaveBeenCalled(); expect(mocks.ask).not.toHaveBeenCalled();
  });
});
