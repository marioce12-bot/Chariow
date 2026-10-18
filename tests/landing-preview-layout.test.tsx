import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";

describe("simplified Vendeo landing", () => {
  it("has no phone, background image, decorative orbs or invented preview component", () => {
    const source = readFileSync("components/Marketing.tsx", "utf8");
    const css = readFileSync("app/landing-preview-layout.css", "utf8");
    expect(source).not.toContain("HeroPhonePreview");
    expect(source).not.toContain("hero-phone");
    expect(source).not.toContain("MarketingProductPreview");
    expect(source).not.toContain('className="landing-orb');
    expect(css).toContain("background-image:none");
    expect(css).not.toContain("url(");
    expect(existsSync("components/HeroPhonePreview.tsx")).toBe(false);
    expect(existsSync("public/landing/hero-connected-workspace.webp")).toBe(false);
  });
  it.each(["home", "ads", "studio"])("includes authentic %s screenshots in both languages", view => {
    for (const locale of ["fr", "en"]) {
      const image = readFileSync(`public/landing/actual-${view}-${locale}.webp`);
      expect(image.length).toBeGreaterThan(10000);
      expect(image.subarray(8,12).toString()).toBe("WEBP");
    }
  });
});
