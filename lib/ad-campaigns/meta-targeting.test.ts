import { describe, expect, it } from "vitest";
import { buildInterestSearchQueries, buildMetaAudienceFields, normalizeInterestLabel, pickBestMetaInterest, rankMetaInterestCandidates, resolveExactMetaInterests, sanitizeMetaTargeting, stripInterestDisambiguation } from "./meta-targeting";

describe("sanitizeMetaTargeting", () => {
  it("keeps the existing accent- and punctuation-insensitive normalization", () => {
    expect(normalizeInterestLabel("Développement de l'enfant")).toBe("developpement de l enfant");
    expect(resolveExactMetaInterests(["Développement de l'enfant"], [{ id: "1", name: "Developpement de l enfant" }]).resolved).toEqual([{ id: "1", name: "Developpement de l enfant" }]);
  });

  it("builds full and significant-token queries in order", () => {
    expect(buildInterestSearchQueries("Éducation des enfants")).toEqual(["Éducation des enfants", "Éducation", "enfants"]);
    expect(buildInterestSearchQueries("Développement de l'enfant")).toEqual(["Développement de l'enfant", "Développement", "enfant"]);
    expect(buildInterestSearchQueries("Marketing du marketing avec stratégie")).toEqual(["Marketing du marketing avec stratégie", "Marketing", "stratégie"]);
  });

  it("ranks, filters, sorts, and deduplicates Meta interest candidates", () => {
    expect(rankMetaInterestCandidates("Éducation des enfants", [
      { id: "5", name: "Autre éducation", audienceSize: 500 },
      { id: "2", name: "Education des enfants", audienceSize: 20 },
      { id: "3", name: "Enfants", audienceSize: 100 },
      { id: "4", name: "Sans rapport", audienceSize: 10000 },
      { id: "1", name: "Éducation des enfants", audienceSize: 10 },
      { id: "1", name: "Éducation des enfants", audienceSize: 999 },
    ])).toEqual([
      { id: "2", name: "Education des enfants" },
      { id: "1", name: "Éducation des enfants" },
      { id: "3", name: "Enfants" },
      { id: "5", name: "Autre éducation" },
    ]);
    expect(rankMetaInterestCandidates("enfants", [{ id: "1", name: "Enfants" }], 0)).toEqual([]);
  });

  it("keeps optional supported targeting and removes malformed or duplicate interests", () => {
    expect(sanitizeMetaTargeting({
      gender: "female",
      interests: [
        { id: "6001", name: "Finance" },
        { id: "6001", name: "Finance duplicate" },
        { id: "not-an-id", name: "Invalid" },
        { id: "6002", name: "  Développement personnel  " },
      ],
    })).toEqual({ gender: "female", interests: [{ id: "6001", name: "Finance" }, { id: "6002", name: "Développement personnel" }] });
  });

  it("treats missing or unsupported criteria as no additional targeting", () => {
    expect(sanitizeMetaTargeting(null)).toBeNull();
    expect(sanitizeMetaTargeting({ gender: "gay", interests: [] })).toEqual({ gender: null, interests: [] });
  });

  it("resolves only exact labels returned by Meta and reports unmatched labels", () => {
    expect(resolveExactMetaInterests(["Finance", "Finance", "Afrique"], [
      { id: "6001", name: "Finance" },
      { id: "6002", name: "Financial Markets" },
    ])).toEqual({ resolved: [{ id: "6001", name: "Finance" }], missing: ["Afrique"] });
  });

  it("builds Meta API fields only for criteria the user selected", () => {
    expect(buildMetaAudienceFields({ gender: "female", interests: [{ id: "6001", name: "Finance" }] })).toEqual({
      genders: [2],
      flexible_spec: [{ interests: [{ id: "6001", name: "Finance" }] }],
    });
    expect(buildMetaAudienceFields({ gender: null, interests: [] })).toEqual({});
  });
});

const candidate = (name: string, audienceSize?: number) => ({ id: name, name, ...(audienceSize === undefined ? {} : { audienceSize }) });

describe("stripInterestDisambiguation", () => {
  it("removes one trailing parenthesized group and leaves other names untouched", () => {
    expect(stripInterestDisambiguation("Parentalité (enfants et parents)")).toBe("Parentalité");
    expect(stripInterestDisambiguation("Parentalité")).toBe("Parentalité");
    expect(stripInterestDisambiguation("Jazz (musique) (genre)")).toBe("Jazz (musique)");
    expect(stripInterestDisambiguation("Jazz (musique) club")).toBe("Jazz (musique) club");
  });
});

describe("pickBestMetaInterest", () => {
  it("matches a label to Meta's name with the parenthesized precision (base)", () => {
    expect(pickBestMetaInterest("Parentalité", [candidate("Parentalité (enfants et parents)")])).toEqual({
      interest: { id: "Parentalité (enfants et parents)", name: "Parentalité (enfants et parents)" },
      confidence: "base",
    });
    expect(pickBestMetaInterest("Famille", [candidate("Famille (concept social)"), candidate("Famille recomposée"), candidate("La Famille Addams")])?.interest.name).toBe("Famille (concept social)");
    expect(pickBestMetaInterest("Psychologie", [
      candidate("Estime de soi (psychologie)"), candidate("Psychologie (science)"), candidate("Psychologie du développement (psychologie)"),
    ])).toMatchObject({ interest: { name: "Psychologie (science)" }, confidence: "base" });
  });

  it("prefers the largest audience among several base matches and never picks an unrelated candidate", () => {
    expect(pickBestMetaInterest("Développement personnel", [
      candidate("Développement personnel (identité personnelle)", 100),
      candidate("Développement personnel (psychologie)", 900),
      candidate("Développement de logiciels (logiciel)"),
      candidate("Développement web (sites web)"),
    ])).toMatchObject({ interest: { name: "Développement personnel (psychologie)" }, confidence: "base" });
    expect(pickBestMetaInterest("Développement personnel", [
      candidate("Développement de logiciels (logiciel)"), candidate("Développement web (sites web)"),
    ])).toBeNull();
  });

  it("falls back to a close match when the candidate base is contained as whole words in the label", () => {
    expect(pickBestMetaInterest("Éducation des enfants", [
      candidate("Éducation (enfants et parents)"),
      candidate("Éducation à distance (éducation)"),
      candidate("Éducation à la santé"),
      candidate("Éducation des adultes (formation professionnelle)"),
      candidate("Éducation en maternelle (éducation primaire et secondaire)"),
    ])).toMatchObject({ interest: { name: "Éducation (enfants et parents)" }, confidence: "close" });
  });

  it("returns null without a related candidate and never matches a bare substring", () => {
    expect(pickBestMetaInterest("Relations familiales", [candidate("Football (sport)"), candidate("Cuisine")])).toBeNull();
    expect(pickBestMetaInterest("Art", [candidate("Smartphone")])).toBeNull();
    expect(pickBestMetaInterest("Marketing digital", [candidate("Market (commerce)")])).toBeNull();
  });

  it("gives priority to an exact name over a base match", () => {
    expect(pickBestMetaInterest("Famille", [candidate("Famille (concept social)", 9000), candidate("Famille", 10)])).toMatchObject({
      interest: { name: "Famille" },
      confidence: "exact",
    });
  });
});

describe("rankMetaInterestCandidates with parenthesized names", () => {
  it("scores a candidate by the best of its full name and its base", () => {
    expect(rankMetaInterestCandidates("Parentalité", [candidate("Parentalité (enfants et parents)"), candidate("Sans rapport")])).toEqual([
      { id: "Parentalité (enfants et parents)", name: "Parentalité (enfants et parents)" },
    ]);
  });
});
