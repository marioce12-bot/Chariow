import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("mobile assistant navigation colors", () => {
  it("keeps unrelated legacy styles from overriding navigation state colors", () => {
    for (const file of ["../app/styles/notifications.css", "../app/dashboard-refinement.css"]) {
      const css = readFileSync(new URL(file, import.meta.url), "utf8");
      for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        if (match[1].includes(".nav-btn-assistant")) expect(match[2]).not.toMatch(/(?:^|;)\s*color\s*:/);
      }
    }
    const css = readFileSync(new URL("../app/dashboard-refinement.css", import.meta.url), "utf8");
    expect(css).toMatch(/\.mobile-nav\s+\.nav-btn\s*\{\s*color:/);
    expect(css).toMatch(/\.mobile-nav\s+\.nav-btn\.active\s*\{\s*color:/);
  });

  it("uses the selected gradient circle while keeping the active Assistant label distinct", () => {
    const css = readFileSync(new URL("../app/mobile-nav.css", import.meta.url), "utf8");
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
    const icon = rules.find((rule) => rule[1].trim() === ".dashboard-platform .mobile-nav .nav-btn-assistant svg")?.[2];
    const label = rules.find((rule) => rule[1].trim() === ".dashboard-platform .mobile-nav .nav-btn-assistant span")?.[2];
    const activeLabel = rules.find((rule) => rule[1].trim() === ".dashboard-platform .mobile-nav .nav-btn-assistant.active span")?.[2];
    expect(icon).toContain("linear-gradient(");
    expect(icon).toContain("stroke: #fff");
    expect(label).toContain("color: #53627c");
    expect(activeLabel).toContain("color: #5944dc");
  });
});
