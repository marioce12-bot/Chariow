import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireUser, askText } = vi.hoisted(() => ({ requireUser: vi.fn(), askText: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireUser }));
vi.mock("@/lib/ai/text", () => ({ askText: (...args: unknown[]) => askText(...args) }));

import { POST } from "@/app/api/studio/prompt/route";

const product = { name: "Savon Kora", description: "Savon fabriqué artisanalement au Bénin.", category: "Beauté", type: "physical", tags: ["savon"] };
const analysis = {
  product_type: "physique", niche: "soin", target_audience: "adultes", core_problem: null,
  main_benefit: null, emotion_dominante: "curiosité", usage_context: "routine quotidienne",
  visual_assets: [], price_positioning: "accessible", objections_probables: ["format"],
  risks: [], assumptions: [], confirmed_fact_ids: [0],
};
const linesFor = (duration: number) => duration === 10
  ? ["Tu aimerais choisir un savon artisanal pour ta routine ?", "Je prends Savon Kora et j'en regarde l'étiquette.", "Retrouve Savon Kora dans la boutique."]
  : duration === 15
    ? ["Tu cherches un savon artisanal à intégrer à ta routine quotidienne ?", "Je le prends près du lavabo et lis son étiquette.", "La fiche indique Savon fabriqué artisanalement au Bénin.", "Retrouve Savon Kora dans la boutique pour le découvrir."]
    : ["Tu connais ce moment où tu veux choisir un savon pour ta routine quotidienne ?", "Je m'arrête devant le lavabo, un peu hésitante devant les produits alignés.", "Je prends Savon Kora et lis ce qui figure sur sa fiche.", "La fiche indique Savon fabriqué artisanalement au Bénin, rien de plus.", "Retrouve Savon Kora dans la boutique et regarde si cela te correspond."];
const creativeFor = (duration: number) => {
  const lines = linesFor(duration);
  const ends = duration === 10 ? [3, 7, 10] : duration === 15 ? [4, 8, 12, 15] : [4, 9, 15, 20, 25];
  const types = duration === 10 ? ["hook", "product", "cta"] : duration === 15 ? ["hook", "problem", "product", "cta"] : ["hook", "problem", "turning_point", "product", "cta"];
  let start = 0;
  const shots = lines.map((dialogue, index) => {
    const end = ends[index];
    const shot = { start, end, type: types[index], visual: "Téléphone et savon dans la salle de bain.", action: "Elle tourne le savon entre ses doigts puis porte son regard vers la caméra.", camera: "plan vertical rapproché", dialogue, emotion: "curiosité" };
    start = end;
    return shot;
  });
  return {
    angle: "Choisir un produit dans une routine quotidienne",
    link_theme: "La salle de bain évoque le savon artisanal décrit dans la fiche produit.",
    hook: { text: lines[0], visual: "La présentatrice hésite devant le lavabo." },
    scene: { location: "salle de bain", lighting: "lumière naturelle", mood: "simple", props: ["lavabo", "savon"], characters: [{ id: "creator", age: "30", gender: "femme", look: "noire adulte", outfit: "tenue sobre", personality: "naturelle", role: "présentatrice fictive" }] },
    shots,
  };
};
const request = (body: unknown) => new Request("https://preview.example/api/studio/prompt", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const replies = (duration: number) => { askText.mockResolvedValueOnce(JSON.stringify(analysis)).mockResolvedValueOnce(JSON.stringify(creativeFor(duration))); };

beforeEach(() => { vi.clearAllMocks(); requireUser.mockResolvedValue({ user: { id: "test-user" } }); });

describe("Studio UGC video duration validation", () => {
  it.each([10, 15, 25])("prépare %i secondes avec beats, voix et segments provider cohérents", async duration => {
    replies(duration);
    const response = await POST(request({ product, mediaType: "video", duration, aspectRatio: "9:16", locale: "fr" }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.plan.duration).toBe(duration);
    expect(body.plan.segments.map((segment: { duration: number }) => segment.duration)).toEqual(duration === 25 ? [15, 10] : [duration]);
    expect(body.creative.shots.at(-1).end).toBe(duration);
    expect(body.creative.shots.at(-1).dialogue).toBe(body.creative.cta);
    expect(body.creative.shots.every((shot: { start: number; end: number; emotion: string }) => shot.start >= 0 && shot.end <= duration && shot.emotion)).toBe(true);
    expect(askText.mock.calls[1][0][0].content).toContain(`exactement ${duration === 10 ? 3 : duration === 15 ? 4 : 5} beats`);
    expect(body.creative.shots).toHaveLength(duration === 10 ? 3 : duration === 15 ? 4 : 5);
  });

  it.each([5, 12, 30, "abc"]) ("rejette la durée invalide %s avant tout appel modèle", async duration => {
    const response = await POST(request({ product, mediaType: "video", duration, aspectRatio: "9:16", locale: "fr" }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toMatchObject({ code: "invalid_input", keyPath: "options.duration", supported: [10, 15, 25] });
    expect(body.error).toMatch(/Durée invalide pour options\.duration.*10, 15, 25 secondes/);
    expect(askText).not.toHaveBeenCalled();
  });

  it("utilise 10 secondes par défaut", async () => {
    replies(10);
    const response = await POST(request({ product, mediaType: "video", aspectRatio: "9:16", locale: "fr" }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.plan).toMatchObject({ duration: 10, segments: [{ duration: 10 }] });
    expect(body.creative.shots.at(-1).end).toBe(10);
  });

  it("signale le scénario simplifié si la direction reste invalide après une seule relance", async () => {
    const invalid = creativeFor(10);
    invalid.shots[1].dialogue = "Je regarde.";
    askText.mockResolvedValueOnce(JSON.stringify(analysis)).mockResolvedValueOnce(JSON.stringify(invalid)).mockRejectedValueOnce(new Error("provider unavailable"));
    const response = await POST(request({ product, mediaType: "video", duration: 10, aspectRatio: "9:16", locale: "fr" }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.scenarioFallback).toBe(true);
    expect(body.creative.assumptions).toContain("Scénario simplifié de dernier recours.");
    expect(askText).toHaveBeenCalledTimes(3);
  });

  it("retourne un timeout clair après 20 secondes sans plan ni rendu", async () => {
    askText.mockResolvedValueOnce(JSON.stringify(analysis)).mockRejectedValueOnce(Object.assign(new Error("request timed out"), { timedOut: true }));
    const response = await POST(request({ product, mediaType: "video", duration: 10, aspectRatio: "9:16", locale: "fr" }));
    expect(response.status).toBe(504);
    const body = await response.json();
    expect(body).toMatchObject({ code: "assistant_timeout" });
    expect(body.error).toContain("20 secondes");
    expect(body).not.toHaveProperty("plan");
    expect(askText).toHaveBeenCalledTimes(2);
  });
});
