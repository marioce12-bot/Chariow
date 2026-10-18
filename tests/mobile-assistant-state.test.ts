import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("mobile assistant navigation colors", () => {
  it("inherits the common inactive and active colors instead of forcing its own", () => {
    for (const file of ["../app/styles/notifications.css", "../app/dashboard-refinement.css", "../app/mobile-nav.css"]) {
      const css = readFileSync(new URL(file, import.meta.url), "utf8");
      for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        if (match[1].includes(".nav-btn-assistant")) expect(match[2]).not.toMatch(/(?:^|;)\s*color\s*:/);
      }
    }
    const css = readFileSync(new URL("../app/dashboard-refinement.css", import.meta.url), "utf8");
    expect(css).toMatch(/\.mobile-nav\s+\.nav-btn\s*\{\s*color:/);
    expect(css).toMatch(/\.mobile-nav\s+\.nav-btn\.active\s*\{\s*color:/);
  });
});
