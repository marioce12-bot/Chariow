import { describe, expect, it } from "vitest";
import { buildMetaAudienceFields, resolveExactMetaInterests, sanitizeMetaTargeting } from "./meta-targeting";

describe("sanitizeMetaTargeting", () => {
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
