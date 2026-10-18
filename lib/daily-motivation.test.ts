import { describe, expect, it } from "vitest";
import { DAILY_MOTIVATIONS, getDailyMotivation } from "./daily-motivation";

describe("daily motivation", () => {
  it("keeps the same quote all day, including after a reload", () => {
    expect(getDailyMotivation(new Date(2026, 9, 18, 0, 1))).toBe(getDailyMotivation(new Date(2026, 9, 18, 23, 59)));
  });
  it("changes at the next local calendar day", () => {
    expect(getDailyMotivation(new Date(2026, 9, 18, 23, 59)).id).not.toBe(getDailyMotivation(new Date(2026, 9, 19, 0, 0)).id);
  });
  it("always includes an author, both languages and a verified source", () => {
    for (const quote of DAILY_MOTIVATIONS) {
      expect(quote.author.length).toBeGreaterThan(3);
      expect(quote.fr.length).toBeGreaterThan(15);
      expect(quote.en.length).toBeGreaterThan(15);
      expect(quote.source).toMatch(/^https:\/\/fr\.wikisource\.org\//);
      expect(quote.work).toBeTruthy();
    }
  });
  it("handles an invalid date without displaying an undefined quote", () => {
    expect(getDailyMotivation(new Date("invalid"))).toBe(DAILY_MOTIVATIONS[0]);
  });
});
