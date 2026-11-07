import { describe, expect, it } from "vitest";
import { buildInterestSearchQueries, buildMetaAudienceFields, normalizeInterestLabel, pickBestMetaInterest, rankMetaInterestCandidates, resolveExactMetaInterests, sanitizeMetaTargeting, stripInterestDisambiguation } from "./meta-targeting";

describe("sanitizeMetaTargeting", () => {
  it("strips only one final parenthetical disambiguation group", () => {
    expect(stripInterestDisambiguation("Parentalité")).toBe("Parentalité");
    expect(stripInterestDisambiguation("Famille (parentalité) (intérêts)")).toBe("Famille (parentalité)");
    expect(stripInterestDisambiguation("Psychologie (santé) générale")).toBe("Psychologie (santé) générale");
    expect(stripInterestDisambiguation("Art (culture (locale))")).toBe("Art (culture (locale))");
  });

  it("picks exact matches first and base variants deterministically", () => {
    const options = [
      { id: "low", name: "Parentalité (famille)", audienceSize: 100 },
      { id: "high", name: "Parentalité (enfants)", audienceSize: 900 },
    ];
    expect(pickBestMetaInterest("Parentalité", options)).toEqual({ interest: options[1], confidence: "base" });
    expect(pickBestMetaInterest("Parentalité (famille)", options)).toEqual({ interest: options[0], confidence: "exact" });
    const exactBeforeBase = [{ id: "base", name: "Psychologie (science)", audienceSize: 900 }, { id: "exact", name: "Psychologie", audienceSize: 1 }];
    expect(pickBestMetaInterest("Psychologie", exactBeforeBase)).toEqual({ interest: exactBeforeBase[1], confidence: "exact" });
    expect(pickBestMetaInterest("Psychologie", [
      { id: "first", name: "Psychologie (santé)", audienceSize: 10 },
      { id: "second", name: "Psychologie (santé)", audienceSize: 900 },
    ])?.interest.id).toBe("second");
    expect(pickBestMetaInterest("Famille", [
      { id: "fam", name: "Famille (parentalité)", audienceSize: 10 },
      { id: "family", name: "Famille (loisirs)", audienceSize: 100 },
    ])?.interest.id).toBe("family");
  });

  it("resolves the actual French Meta variants for parenting, family, psychology, and personal development", () => {
    const parenting = { id: "parenting", name: "Parentalité (enfants et parents)" };
    expect(pickBestMetaInterest("Parentalité", [parenting])).toEqual({ interest: parenting, confidence: "base" });

    const family = [
      { id: "family-concept", name: "Famille (concept social)" },
      { id: "recomposed", name: "Famille recomposée" },
      { id: "addams", name: "La Famille Addams" },
    ];
    expect(pickBestMetaInterest("Famille", family)).toEqual({ interest: family[0], confidence: "base" });

    const psychology = [
      { id: "self-esteem", name: "Estime de soi (psychologie)" },
      { id: "psychology", name: "Psychologie (science)" },
      { id: "development-psychology", name: "Psychologie du développement (psychologie)" },
    ];
    expect(pickBestMetaInterest("Psychologie", psychology)).toEqual({ interest: psychology[1], confidence: "base" });

    const development = [
      { id: "identity", name: "Développement personnel (identité personnelle)", audienceSize: 100 },
      { id: "psychology", name: "Développement personnel (psychologie)", audienceSize: 900 },
      { id: "software", name: "Développement de logiciels (logiciel)", audienceSize: 5000 },
      { id: "web", name: "Développement web (sites web)", audienceSize: 4000 },
    ];
    expect(pickBestMetaInterest("Développement personnel", development)).toEqual({ interest: development[1], confidence: "base" });
  });

  it("chooses close education matches only on whole words and prioritizes explanatory parenthetical words on ties", () => {
    const education = [
      { id: "children", name: "Éducation (enfants et parents)", audienceSize: 100 },
      { id: "distance", name: "Éducation à distance (éducation)", audienceSize: 9000 },
      { id: "health", name: "Éducation à la santé", audienceSize: 8000 },
      { id: "adults", name: "Éducation des adultes (formation professionnelle)", audienceSize: 7000 },
      { id: "kindergarten", name: "Éducation en maternelle (éducation primaire et secondaire)", audienceSize: 6000 },
    ];
    expect(pickBestMetaInterest("Éducation des enfants", education)).toEqual({ interest: education[0], confidence: "close" });

    const tied = [
      { id: "unrelated-context", name: "Éducation (formation générale)", audienceSize: 500 },
      { id: "shared-context", name: "Éducation (enfants et parents)", audienceSize: 500 },
    ];
    expect(pickBestMetaInterest("Éducation des enfants", tied)?.interest.id).toBe("shared-context");
    expect(pickBestMetaInterest("Libellé sans correspondance", education)).toBeNull();
    expect(pickBestMetaInterest("Art", [{ id: "phone", name: "Smartphone" }])).toBeNull();
  });

  it("scores the disambiguated base when ranking without changing unsuffixed rankings", () => {
    expect(rankMetaInterestCandidates("Parentalité", [{ id: "1", name: "Parentalité (enfants et parents)" }])).toEqual([
      { id: "1", name: "Parentalité (enfants et parents)" },
    ]);
    expect(rankMetaInterestCandidates("enfants", [{ id: "1", name: "Enfants" }, { id: "2", name: "Enfants (parentalité)" }])).toEqual([
      { id: "1", name: "Enfants" },
      { id: "2", name: "Enfants (parentalité)" },
    ]);
  });

  it("allows only whole-word close matches and rejects unrelated labels", () => {
    const interests = [
      { id: "education", name: "Éducation (enfants et parents)", audienceSize: 100 },
      { id: "self", name: "Développement personnel (psychologie)", audienceSize: 900 },
      { id: "unrelated", name: "Smartphone (technologie)", audienceSize: 5000 },
    ];
    expect(pickBestMetaInterest("Éducation des enfants", interests)).toEqual({ interest: interests[0], confidence: "close" });
    expect(pickBestMetaInterest("Développement personnel", interests)).toEqual({ interest: interests[1], confidence: "base" });
    expect(pickBestMetaInterest("Développement", [{ id: "noise", name: "Développement immobilier" }, { id: "other", name: "Personnel (psychologie)" }])).toBeNull();
    expect(pickBestMetaInterest("Art", [{ id: "phone", name: "Smartphone" }])).toBeNull();
    expect(pickBestMetaInterest("Aucun intérêt", interests)).toBeNull();
  });

  it("keeps the existing accent- and punctuation-insensitive normalization", () => {
    expect(normalizeInterestLabel("Développement de l'enfant")).toBe("developpement de l enfant");
    expect(resolveExactMetaInterests(["Développement de l'enfant"], [{ id: "1", name: "Developpement de l enfant" }]).resolved).toEqual([{ id: "1", name: "Developpement de l enfant" }]);
  });

  it("returns the original catalogue object unchanged and never manufactures a missing interest", () => {
    const catalogue = { id: "6002991239659", name: "Parentalité (enfants et parents)" };
    expect(pickBestMetaInterest("Parentalité", [catalogue])?.interest).toBe(catalogue);
    expect(pickBestMetaInterest("Conseils parentaux", [])).toBeNull();
    expect(pickBestMetaInterest("Conseils parentaux", [catalogue])).toBeNull();
    expect(rankMetaInterestCandidates("Conseils parentaux", [])).toEqual([]);
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
