import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireUser, askText } = vi.hoisted(() => ({ requireUser: vi.fn(), askText: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireUser }));
vi.mock("@/lib/ai/text", () => ({ askText }));
import { POST } from "@/app/api/studio/prompt/route";

const request = (body: unknown) => new Request("https://preview.example/api/studio/prompt", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});
const messages = () => askText.mock.calls[0][0] as Array<{ role: string; content: string }>;

beforeEach(() => {
  vi.clearAllMocks();
  requireUser.mockResolvedValue({ user: { id: "test-user" } });
  askText.mockResolvedValue("Create a product-led editorial poster.");
});

describe("Studio product-led prompt route", () => {
  it("preserves bundle facts, reference identity and previous creative context without imposing a template", async () => {
    const response = await POST(request({
      product: { name: "Pack spécial Promo développement", description: "Trois guides numériques : application, IA, réseau professionnel.", image: "https://cdn.chariow.com/pack.jpg" },
      previousPrompt: "Old sand, turquoise and orange poster with a man in a blazer.",
      locale: "fr", orientation: "square",
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ prompt: "Create a product-led editorial poster." });
    const context = messages().map(message => message.content).join("\n");
    expect(context).toContain("Pack spécial Promo développement");
    expect(context).toContain("Trois guides numériques");
    expect(context).toContain("https://cdn.chariow.com/pack.jpg");
    expect(context).toContain("n'a pas été analysée visuellement");
    expect(context).toContain("Prompt précédent");
    expect(context).toContain("pas un livre unique");
    expect(context).toContain("Person presence is optional");
    expect(context).not.toContain("IMPOSÉE");
    expect(context).not.toContain("#ff6a00");
    expect(context).not.toContain("Un ebook est toujours un livre physique");
  });

  it("honors explicit character and transparent background requests", async () => {
    await POST(request({ product: { name: "Cours de cuisine" }, character: "without", background: "transparent", orientation: "portrait", locale: "en" }));
    const context = messages().map(message => message.content).join("\n");
    expect(context).toContain("Do not include any person or character");
    expect(context).toContain("Fond : transparent");
    expect(context).toContain("English");
    expect(context).toContain("vertical portrait");
  });

  it("passes an explicit with-person request without prescribing gender or wardrobe", async () => {
    await POST(request({ product: { name: "Formation" }, character: "with" }));
    expect(messages()[1].content).toContain("Include a person");
    expect(messages()[1].content).not.toContain("blazer");
  });

  it("rejects missing products and unauthenticated requests before contacting AI", async () => {
    expect((await POST(request({ product: {} }))).status).toBe(400);
    expect(askText).not.toHaveBeenCalled();
    requireUser.mockResolvedValue({ user: null, response: new Response("Unauthorized", { status: 401 }) });
    expect((await POST(request({ product: { name: "Pack" } }))).status).toBe(401);
    expect(askText).not.toHaveBeenCalled();
  });

  it("returns a controlled service error instead of a misleading prompt", async () => {
    askText.mockRejectedValue(new Error("test provider unavailable"));
    expect((await POST(request({ product: { name: "Pack" } }))).status).toBe(502);
  });
});
