import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const marketingPath = "components/Marketing.tsx";
const current = readFileSync(marketingPath, "utf8");
const baseline = execFileSync("git", ["show", `origin/main:${marketingPath}`], { encoding: "utf8" });

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

  it("retains every existing href and introduces the requested hero copy and asset", () => {
    const currentHrefs = hrefs(current);
    for (const href of hrefs(baseline)) expect(currentHrefs).toContain(href);

    for (const text of ["Tu vends des ebooks", "Crée tes pubs", "100 crédits de bienvenue"]) {
      expect(current).toContain(text);
    }
    expect(current).toContain("/landing/digital-creator.webp");
  });

  it("keeps the product carousel keyboard- and touch-navigable", () => {
    const carousel = between(current, 'id="apercu"', "<PlatformMarquee");
    const keyboardHandler = between(current, "function demoKey(", "\n  useEffect(");
    for (const key of ['"ArrowLeft"', '"ArrowRight"', '"Home"', '"End"']) {
      expect(keyboardHandler).toContain(key);
    }
    expect(current).toContain("onKeyDown={demoKey}");
    expect(carousel).toContain("onTouchStart=");
    expect(carousel).toContain("onTouchEnd=");
    expect(carousel).toContain("setActiveDemo");
  });
});
