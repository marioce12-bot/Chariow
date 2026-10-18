import { describe, expect, it } from "vitest";
import { translations } from "./translations";
import { uiTranslations } from "./ui";
import { featureCopyGroups } from "./features";
import { translate } from "./translate";

function flatten(dict: Record<string, unknown>, prefix = "", result: Record<string, string> = {}) {
  for (const [key, value] of Object.entries(dict)) {
    if (typeof value === "string") result[prefix + key] = value;
    else if (value && typeof value === "object") flatten(value as Record<string, unknown>, `${prefix}${key}.`, result);
  }
  return result;
}

function variables(text: string) {
  return [...new Set([...text.matchAll(/\{([^{}]+)\}/g)].map((match) => match[1]))].sort();
}

const groups = { base: translations, ui: uiTranslations, ...featureCopyGroups };

describe("translation dictionaries", () => {
  for (const [name, copy] of Object.entries(groups)) {
    it(`${name}: has matching French and English keys and interpolation parameters`, () => {
      const fr = flatten(copy.fr);
      const en = flatten(copy.en);
      expect(Object.keys(en).sort()).toEqual(Object.keys(fr).sort());
      for (const key of Object.keys(fr)) {
        expect(en[key].trim(), key).not.toBe("");
        expect(variables(en[key]), key).toEqual(variables(fr[key]));
        expect(translate("fr", key), key).toBe(fr[key]);
        expect(translate("en", key), key).toBe(en[key]);
      }
    });
  }

  it("does not let feature dictionaries silently overwrite one another", () => {
    const keys = Object.values(featureCopyGroups).flatMap((copy) => Object.keys(copy.fr));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("supports both nested historic dictionaries and flat UI keys", () => {
    expect(translate("fr", "launch.title")).toBe(uiTranslations.fr["launch.title"]);
    expect(translate("en", "launch.title")).toBe(uiTranslations.en["launch.title"]);
    const nestedKey = Object.keys(flatten(translations.fr)).find((key) => key.includes("."))!;
    expect(translate("en", nestedKey)).toBe(flatten(translations.en)[nestedKey]);
  });

  it("returns the key for unknown keys and object paths rather than leaking an object", () => {
    expect(translate("en", "not.a.real.translation")).toBe("not.a.real.translation");
    expect(translate("en", "landing")).toBe("landing");
  });

  it("inserts dollar signs and apparent placeholders literally, without recursive replacement", () => {
    expect(translate("en", "Hello {name}, {count}", { name: "$&{count}", count: 0 })).toBe("Hello $&{count}, 0");
    expect(translate("fr", "{missing} {amount}", { amount: 12.5 })).toBe("{missing} 12.5");
  });
});
