import { describe, expect, it } from "vitest";
import { buildInterestSearchQueries, buildMetaAudienceFields, normalizeInterestLabel, rankMetaInterestCandidates, resolveExactMetaInterests, sanitizeMetaTargeting } from "./meta-targeting";

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
