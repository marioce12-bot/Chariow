import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const marketingPath = "components/Marketing.tsx";
const current = readFileSync(marketingPath, "utf8");
const baseline = execFileSync("git", ["show", `origin/main:${marketingPath}`], { encoding: "utf8" });
const visual = readFileSync("components/DigitalWorkspaceVisual.tsx", "utf8");
const fr = readFileSync("lib/i18n/translations/fr.ts", "utf8");
const en = readFileSync("lib/i18n/translations/en.ts", "utf8");

function between(source: string, start: string, end: string) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  if (from < 0 || to < 0) throw new Error(`Missing source boundary: ${start} / ${end}`);
  return source.slice(from, to);
}

function hrefs(source: string) {
  return [...source.matchAll(/\bhref\s*=\s*["']([^"']+)["']/g)].map((match) => match[1]);
}

describe("verified digital-product landing page", () => {
  it("keeps the approved header and navigation byte-for-byte identical to origin/main", () => {
    expect(between(current, '<header className="marketing-header">', "</header>")).toBe(
      between(baseline, '<header className="marketing-header">', "</header>"),
    );
  });

  it("orders the problem, workflow, product proof, pricing, FAQ and final CTA", () => {
    const anchors = [
      '<section className="section problem-section">',
      'id="comment"',
      'id="fonctionnalites"',
      'id="tarifs"',
      'id="faq"',
      'className="section landing-cta-section"',
      'className="site-footer"',
    ];
    const positions = anchors.map((anchor) => current.indexOf(anchor));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(current.match(/className="problem-item"/g)).toHaveLength(3);
    expect(current.match(/className="journey-screenshot"/g)).toHaveLength(2);
  });

  it("preserves the register and preview destinations with accurate hero CTAs", () => {
    const currentHrefs = hrefs(current);
    for (const href of hrefs(baseline)) expect(currentHrefs).toContain(href);
    expect(current).toContain('href="/register"');
    expect(current).toContain('href="#apercu"');
    expect(current).toContain("Lancer mon essai gratuit");
    expect(current).toContain("Découvrir comment ça marche");
    expect(current).toContain("100 crédits Studio offerts à l'inscription");
  });

  it("uses accessible product screenshots and clearly labels demonstration data", () => {
    expect(current).toMatch(/DigitalWorkspaceVisual/);
    expect(visual).toMatch(/aria-label=|aria-labelledby=/);
    for (const label of ["Chariow", "Vendeo", "Meta", "Pinterest", "TikTok", "image", "données de démonstration"]) {
      expect(visual.toLowerCase()).toContain(label.toLowerCase());
    }
    expect(visual).not.toContain("performance-visuel-desktop.webp");
    expect(visual).not.toContain("performance-visuel-mobile.webp");
    expect(visual).not.toMatch(/Shopify|actual-studio|vidéo|video|sans repayer|pay again/i);
    expect(current).toMatch(/données de démonstration/);
  });

  it("contains no unsupported no-repayment promise and discloses unavailable video generation", () => {
    const frenchLanding = between(fr, "    landing: {", "    settings: {");
    const englishLanding = between(en, "    landing: {", "    settings: {");
    for (const copy of [current, frenchLanding, englishLanding]) {
      expect(copy).not.toMatch(/sans repayer|aucun nouveau paiement|without paying again|will not be charged again/i);
    }
    expect(frenchLanding).toContain("la génération vidéo n’est pas disponible actuellement");
    expect(englishLanding).toContain("video generation is not currently available");
  });
});
