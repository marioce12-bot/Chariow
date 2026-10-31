import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import postcss from "postcss";
import { describe, expect, it } from "vitest";

const css = postcss.parse(readFileSync(resolve(process.cwd(), "app/styles/desktop-polish.css"), "utf8"));

describe("slideshow desktop layout boundaries", () => {
  it("keeps every slideshow-specific override outside mobile and small tablet widths", () => {
    const rules: string[] = [];
    css.walkRules(rule => {
      if (!rule.selector.includes("studio-slideshow")) return;
      rules.push(rule.selector);
      expect(rule.parent?.type).toBe("atrule");
      expect((rule.parent as postcss.AtRule).name).toBe("media");
      expect((rule.parent as postcss.AtRule).params).toMatch(/\(min-width:\s*(801|1200)px\)/);
    });
    expect(rules.length).toBeGreaterThan(8);
  });

  it("bounds only the slideshow grid and player instead of changing every Studio result", () => {
    const values: Record<string, Record<string, string>> = {};
    css.walkRules(rule => {
      if (!rule.selector.includes("studio-slideshow")) return;
      const media = (rule.parent as postcss.AtRule).params;
      if (media !== "(min-width: 801px)") return;
      values[rule.selector] = {};
      rule.walkDecls(decl => { values[rule.selector][decl.prop] = decl.value; });
    });
    expect(values[".studio-slideshow-grid"]["grid-template-columns"]).toBe("minmax(0, 1fr) minmax(300px, 360px)");
    expect(values[".studio-slideshow-grid"]["max-width"]).toBe("1040px");
    expect(values[".studio-slideshow-preview"]["min-height"]).toBe("0");
    expect(values[".studio-slideshow-final > video"]["--slideshow-player-height"]).toBe("clamp(260px, 38vh, 320px)");
  });
});
