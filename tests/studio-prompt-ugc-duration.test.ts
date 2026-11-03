import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireUser, askText } = vi.hoisted(() => ({ requireUser: vi.fn(), askText: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireUser }));
vi.mock("@/lib/ai/text", () => ({ askText: (...args: unknown[]) => askText(...args) }));

import { POST } from "@/app/api/studio/prompt/route";

const product = {
  name: "Savon Kora",
  description: "Savon fabriqué artisanalement au Bénin.",
  category: "Beauté",
  type: "physical",
  tags: ["savon"],
};
const analysis = {
  product_type: "physique", niche: "soin", target_audience: "adultes", core_problem: null,
  main_benefit: null, emotion_dominante: "curiosité", usage_context: "routine quotidienne",
  visual_assets: [], price_positioning: "accessible", objections_probables: ["format"],
  risks: [], assumptions: [], confirmed_fact_ids: [0],
};
const creative = {
  angle: "Découverte du quotidien",
  hook: { text: "Une découverte ?", visual: "La présentatrice montre le produit." },
  scene: { location: "Salle de bain", lighting: "lumière naturelle", mood: "simple", props: ["savon"] },
  characters: [{ id: "creator", age: "30", gender: "femme", look: "noire adulte", outfit: "tenue sobre", personality: "naturelle", role: "présentatrice fictive" }],
  shortLines: ["Je cherche une idée.", "Je regarde ce produit.", "Voici sa référence."],
};
const request = (body: unknown) => new Request("https://preview.example/api/studio/prompt", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
const replies = () => {
  askText.mockResolvedValueOnce(JSON.stringify(analysis)).mockResolvedValueOnce(JSON.stringify(creative));
};

beforeEach(() => {
  vi.clearAllMocks();
  requireUser.mockResolvedValue({ user: { id: "test-user" } });
});

describe("Studio UGC video duration validation", () => {
  it.each([10, 15, 25])("prepares %i seconds with matching beats, voice and provider clips", async duration => {
    replies();
    const response = await POST(request({ product, mediaType: "video", duration, aspectRatio: "9:16", locale: "fr" }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.plan.duration).toBe(duration);
    expect(body.plan.segments.map((segment: { duration: number }) => segment.duration)).toEqual(duration === 25 ? [15, 10] : [duration]);
    expect(body.creative.shots.at(-1).end).toBe(duration);
    expect(body.creative.shots.at(-1).dialogue).toBe(body.creative.cta);
    expect(body.creative.shots.every((shot: { start: number; end: number }) => shot.start >= 0 && shot.end <= duration)).toBe(true);
    expect(askText.mock.calls[1][0][0].content).toContain(`La vidéo dure ${duration} secondes`);
    if (duration === 10) {
      expect(body.creative.shots).toHaveLength(4);
      expect(body.creative.shots.map((shot: { end: number; start: number }) => shot.end - shot.start)).toEqual([2, 2, 3, 3]);
      expect(askText.mock.calls[1][0][0].content).toContain("18 mots de voix maximum");
    } else {
      expect(body.creative.shots).toHaveLength(5);
    }
  });

  it.each([5, 12, 30, "abc"])("rejects invalid duration %s with a clear 400 before any model call", async duration => {
    const response = await POST(request({ product, mediaType: "video", duration, aspectRatio: "9:16", locale: "fr" }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toMatchObject({
      code: "invalid_input",
      keyPath: "options.duration",
      supported: [10, 15, 25],
    });
    expect(body.error).toMatch(/Durée invalide pour options\.duration.*10, 15, 25 secondes/);
    expect(askText).not.toHaveBeenCalled();
  });

  it("defaults an omitted UGC duration to the interface default of 10 seconds", async () => {
    replies();
    const response = await POST(request({ product, mediaType: "video", aspectRatio: "9:16", locale: "fr" }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.plan).toMatchObject({ duration: 10, segments: [{ duration: 10 }] });
    expect(body.creative.shots.at(-1).end).toBe(10);
  });
});
