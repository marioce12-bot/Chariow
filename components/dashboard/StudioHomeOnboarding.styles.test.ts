import { readFileSync } from "node:fs";
import postcss from "postcss";
import { describe, expect, it } from "vitest";

const css = postcss.parse(readFileSync("app/styles/dashboard.css", "utf8"));

function declarations(selector: string): Record<string, string> {
  const result: Record<string, string> = {};
  css.walkRules((rule) => {
    if (rule.selector !== selector || rule.parent?.type !== "root") return;
    rule.walkDecls((declaration) => { result[declaration.prop] = declaration.value; });
  });
  return result;
}

describe("Studio home onboarding surfaces", () => {
  it("defines opaque surfaces locally, without relying on dashboard inheritance", () => {
    const panel = declarations(".studio-home-onboarding");
    const darkPanel = declarations('html[data-theme="dark"] .studio-home-onboarding');
    const card = declarations(".studio-mobile-choice");
    const darkCard = declarations('html[data-theme="dark"] .studio-mobile-choice');
    const opaqueHex = /^#(?:[\da-f]{3}|[\da-f]{6})$/i;

    expect(panel["--card"]).toMatch(opaqueHex);
    expect(darkPanel["--card"]).toMatch(opaqueHex);
    expect(panel.background).toBe("var(--card)");
    expect(card.background).toBe("var(--card)");
    expect(darkCard.background).toMatch(opaqueHex);
    expect(declarations(".studio-home-onboarding-backdrop").background).toBe("rgba(13,20,38,.66)");
  });
});
