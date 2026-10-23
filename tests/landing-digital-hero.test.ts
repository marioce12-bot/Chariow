import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const marketingPath = "components/Marketing.tsx";
const current = readFileSync(marketingPath, "utf8");
const baseline = execFileSync("git", ["show", `origin/main:${marketingPath}`], { encoding: "utf8" });
const visual = readFileSync("components/DigitalWorkspaceVisual.tsx", "utf8");

function between(source: string, start: string, end: string) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  if (from < 0 || to < 0) throw new Error(`Missing source boundary: ${start} / ${end}`);
  return source.slice(from, to);
}

function hrefs(source: string) {
  return [...source.matchAll(/\bhref\s*=\s*["']([^"']+)["']/g)].map((match) => match[1]);
}

describe("digital creator landing hero regression contract", () => {
  it("keeps the header and navigation byte-for-byte identical to origin/main", () => {
    expect(between(current, '<header className="marketing-header">', "</header>")).toBe(
      between(baseline, '<header className="marketing-header">', "</header>"),
    );
  });

  it("preserves every section from problem-section through the footer", () => {
    expect(between(current, '<section className="section problem-section">', "</main>")).toBe(
      between(baseline, '<section className="section problem-section">', "</main>"),
    );
  });

  it("preserves all existing destinations and uses the requested hero CTAs", () => {
    const currentHrefs = hrefs(current);
    for (const href of hrefs(baseline)) expect(currentHrefs).toContain(href);
    expect(current).toContain('href="/register"');
    expect(current).toContain('href="#apercu"');
    expect(current).toContain("Lancer mon essai gratuit");
    expect(current).toContain("Découvrir comment ça marche");
  });

  it("uses static, accessible artwork with both storefront brands and fictional-example labeling", () => {
    const artwork = current.includes("creator-stage") ? current : visual;
    expect(current).toMatch(/DigitalWorkspaceVisual|creator-stage/);
    expect(artwork).toMatch(/aria-label=|aria-labelledby=/);
    for (const label of ["Chariow", "Shopify", "image", "video", "commande"]) {
      expect(artwork.toLowerCase()).toContain(label.toLowerCase());
    }
    expect(artwork).toMatch(/exemple|demo|démo|fictif/i);
    expect(artwork).not.toMatch(/garanti|garantie|guaranteed/i);
  });
});
