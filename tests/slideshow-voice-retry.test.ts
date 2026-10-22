import { describe, expect, it, vi } from "vitest";
import { buildSlideshowVoicePlan } from "@/lib/studio/slideshow-voice";
import { slideshowEvidence, buildSlideshowCta, slideshowSourceCandidates } from "@/lib/studio/slideshow-plan";
import { MAX_SLIDESHOW_VOICE_ATTEMPTS, SlideshowVoiceTimingError, synthesizeCoveredSlideshowVoice } from "@/lib/studio/slideshow-voice-retry";

const product = { name: "Guide Snapchat", description: "Guide pour lancer des campagnes sur Snapchat. Le guide explique les réglages du ciblage. Il présente plusieurs exemples de publicités. Chaque chapitre détaille une étape de préparation. Les exercices accompagnent la lecture du guide. Une section décrit les indicateurs de suivi. Le document explique les formats publicitaires disponibles. Une liste rassemble les vérifications avant publication. Le guide aide à définir les objectifs de chaque campagne. Des conseils présentent les audiences disponibles dans la plateforme. Les exemples montrent comment rédiger des annonces claires. Un chapitre décrit le calendrier de publication. Le lecteur peut comparer plusieurs formats de publicité. Des étapes expliquent comment préparer les visuels. Le guide détaille aussi le budget quotidien. Une partie aide à suivre les clics reçus. Les sections proposent des méthodes pour ajuster les campagnes. Un glossaire définit le vocabulaire employé dans les menus. Des captures illustrent les écrans de configuration des comptes. Une annexe rassemble les dimensions des images acceptées. Le sommaire organise la lecture en modules thématiques. Des fiches proposent des questions pour préparer les annonces. Le document est disponible au format PDF sur ordinateur. Une page explique la différence entre les enchères et les dépenses." };
const input = { product, locale: "fr", campaignGoal: "buy" };
const words = (text: string) => text.trim().split(/\s+/).length;
const short = (audibleEnd = 20.09) => new SlideshowVoiceTimingError("short", audibleEnd, 25, `Internal diagnostic ${audibleEnd}/25, minimum 95%`);
const mockAudio = Buffer.from("mocked-audio-not-provider-output");

describe("bounded measured narration correction, mocked TTS only", () => {
  it("repairs the real 20.09/25 failure with fresh verified detail and preserves the CTA", async () => {
    const plan = buildSlideshowVoicePlan(product, 25, "fr", "buy");
    const synthesize = vi.fn().mockResolvedValue(mockAudio);
    const prepare = vi.fn().mockRejectedValueOnce(short()).mockResolvedValueOnce("/tmp/covered.wav");
    const result = await synthesizeCoveredSlideshowVoice(plan, input, prepare, synthesize);
    expect(result.attempts).toBe(2);
    expect(prepare).toHaveBeenCalledTimes(2);
    expect(synthesize).toHaveBeenCalledTimes(2);
    expect(words(result.plan.script)).toBeGreaterThanOrEqual(Math.ceil(words(plan.script) / 20.09 * 24.6 * 1.02));
    expect(result.plan.script.endsWith("Prêt à lancer tes campagnes sur Snapchat ? Procure-toi le guide.")).toBe(true);
    const facts = slideshowEvidence(product.description, product.name, 60);
    const cta = buildSlideshowCta(product.name, slideshowSourceCandidates(product.description), "buy", false);
    const body = result.plan.script.slice(`${product.name}. `.length, -`${cta}.`.length).trim();
    const spokenFacts = body.split(/(?<=[.!?])\s+/).filter(Boolean);
    expect(new Set(spokenFacts).size).toBe(spokenFacts.length);
    for (const fact of spokenFacts) expect(facts.map(value => value.replace(/[.!?]+$/g, "") + ".")).toContain(fact);
    expect(spokenFacts.length).toBeGreaterThan(plan.script.split(". ").length - 3);
  });
  it.each([25, 30, 40])("returns the first measured fitting voice without extra requests at %ss", async duration => {
    const plan = buildSlideshowVoicePlan(product, duration, "fr", "buy");
    const synthesize = vi.fn().mockResolvedValue(mockAudio);
    const prepare = vi.fn().mockResolvedValue("/tmp/valid.wav");
    const result = await synthesizeCoveredSlideshowVoice(plan, input, prepare, synthesize);
    expect(result.plan.script).toBe(plan.script);
    expect(result.attempts).toBe(1);
    expect(synthesize).toHaveBeenCalledTimes(1);
  });
  it("stops after at most two timing corrections, without infinite provider usage", async () => {
    const plan = buildSlideshowVoicePlan(product, 25, "fr", "buy");
    const synthesize = vi.fn().mockResolvedValue(mockAudio);
    const prepare = vi.fn().mockRejectedValue(short());
    await expect(synthesizeCoveredSlideshowVoice(plan, input, prepare, synthesize)).rejects.toBeInstanceOf(SlideshowVoiceTimingError);
    expect(synthesize).toHaveBeenCalledTimes(MAX_SLIDESHOW_VOICE_ATTEMPTS);
    expect(prepare).toHaveBeenCalledTimes(3);
    const scripts = synthesize.mock.calls.map(([p]) => p.script);
    expect(new Set(scripts).size).toBe(3);
  });
  it.each(["HTTP 429 quota", "HTTP 403 access", "HTTP 500 service", "AbortError timeout", "invalid PCM data"])("never retries provider failure: %s", async message => {
    const synthesize = vi.fn().mockRejectedValue(new Error(message));
    const prepare = vi.fn();
    await expect(synthesizeCoveredSlideshowVoice(buildSlideshowVoicePlan(product, 25), input, prepare, synthesize)).rejects.toThrow(message);
    expect(synthesize).toHaveBeenCalledTimes(1);
    expect(prepare).not.toHaveBeenCalled();
  });
  it("does not retry a failed API request after a successful but short first response", async () => {
    const synthesize = vi.fn().mockResolvedValueOnce(mockAudio).mockRejectedValueOnce(new Error("quota exhausted"));
    const prepare = vi.fn().mockRejectedValue(short());
    await expect(synthesizeCoveredSlideshowVoice(buildSlideshowVoicePlan(product, 25), input, prepare, synthesize)).rejects.toThrow("quota exhausted");
    expect(synthesize).toHaveBeenCalledTimes(2);
    expect(prepare).toHaveBeenCalledTimes(1);
  });
  it("does not request identical speech or invent filler when verified copy is insufficient", async () => {
    const scarce = { name: product.name, description: slideshowEvidence(product.description, product.name).slice(0, 8).join(" ") };
    const plan = buildSlideshowVoicePlan(scarce, 25, "fr", "buy");
    const synthesize = vi.fn().mockResolvedValue(mockAudio);
    const prepare = vi.fn().mockRejectedValue(short(10));
    await expect(synthesizeCoveredSlideshowVoice(plan, { ...input, product: scarce }, prepare, synthesize)).rejects.toThrow();
    expect(synthesize).toHaveBeenCalledTimes(1);
  });
  it("does not retry a filesystem or encoder failure as if it were a short voice", async () => {
    const synthesize = vi.fn().mockResolvedValue(mockAudio);
    await expect(synthesizeCoveredSlideshowVoice(buildSlideshowVoicePlan(product, 25), input, vi.fn().mockRejectedValue(new Error("disk unavailable")), synthesize)).rejects.toThrow("disk unavailable");
    expect(synthesize).toHaveBeenCalledTimes(1);
  });
  it("shares one time budget across attempts and leaves time for local assembly", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValueOnce(0).mockReturnValueOnce(0).mockReturnValue(180_001);
    try {
      const synthesize = vi.fn().mockResolvedValue(mockAudio);
      await expect(synthesizeCoveredSlideshowVoice(buildSlideshowVoicePlan(product, 25), input, vi.fn().mockRejectedValue(short()), synthesize)).rejects.toThrow("time budget exhausted");
      expect(synthesize).toHaveBeenCalledTimes(1);
      expect(synthesize.mock.calls[0][1]).toBe(180_000);
    } finally { now.mockRestore(); }
  });
  it("rejects invalid measured budgets before any provider call", () => {
    for (const budget of [{ minimumWords: NaN, maxWords: 100 }, { minimumWords: 50, maxWords: 40 }, { minimumWords: 0, maxWords: 40 }]) {
      expect(() => buildSlideshowVoicePlan(product, 25, "fr", "buy", budget)).toThrow("word budget");
    }
  });
  it("uses strictly more different verified details for longer selections", () => {
    const plans = [25, 30, 40].map(duration => buildSlideshowVoicePlan(product, duration, "fr", "buy"));
    expect(words(plans[0].script)).toBeLessThan(words(plans[1].script));
    expect(words(plans[1].script)).toBeLessThan(words(plans[2].script));
    expect(plans[0].script.split(". ").length).toBeLessThan(plans[2].script.split(". ").length);
  });
});
