import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { shouldToggleMobileNav } from "./useMobileNavVisibility";

describe("mobile dashboard navigation visibility", () => {
  it("does not toggle for small movements and toggles after the directional threshold", () => {
    expect(shouldToggleMobileNav(13, true)).toBe(false);
    expect(shouldToggleMobileNav(14, true)).toBe(true);
    expect(shouldToggleMobileNav(-13, false)).toBe(false);
    expect(shouldToggleMobileNav(-14, false)).toBe(true);
  });

  it("does not toggle in the opposite direction", () => {
    expect(shouldToggleMobileNav(-40, true)).toBe(false);
    expect(shouldToggleMobileNav(40, false)).toBe(false);
  });

  it("observes viewport scrolling rather than nested popup/list scroll containers", () => {
    const hook = readFileSync(new URL("./useMobileNavVisibility.ts", import.meta.url), "utf8");
    expect(hook).toContain('window.addEventListener("scroll", onScroll, { passive: true })');
    expect(hook).toContain('window.matchMedia("(max-width: 760px)")');
    expect(hook).toContain("if (y <= TOP_RESET)");
    expect(hook).toContain('closest(".mobile-nav")');
  });
});
