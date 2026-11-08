import { describe, expect, it } from "vitest";
import { nextStudioVideoProgress, studioVideoProgressCeiling } from "./video-progress";

function simulate(timeline: Array<[atSeconds: number, serverProgress: number]>, totalSeconds: number) {
  let value = 0;
  let server = 0;
  const shown: number[] = [];
  for (let tick = 0; tick <= totalSeconds * 2; tick++) {
    const seconds = tick / 2;
    for (const [at, progress] of timeline) if (seconds >= at) server = progress;
    value = nextStudioVideoProgress(value, server, 500);
    shown.push(Math.floor(value));
  }
  return shown;
}

describe("Studio video progress", () => {
  it("keeps the displayed value below the next server milestone", () => {
    expect(studioVideoProgressCeiling(0)).toBe(9);
    expect(studioVideoProgressCeiling(10)).toBe(41);
    expect(studioVideoProgressCeiling(58)).toBe(81);
    expect(studioVideoProgressCeiling(94)).toBe(99);
    expect(studioVideoProgressCeiling(Number.NaN)).toBe(9);
  });

  it("starts at 3 %, never goes backwards and never reaches 100 % on its own", () => {
    expect(nextStudioVideoProgress(0, 0, 500)).toBeGreaterThanOrEqual(3);
    expect(nextStudioVideoProgress(70, 10, 500)).toBeGreaterThanOrEqual(70);
    expect(nextStudioVideoProgress(99, 99, 600_000)).toBe(99);
  });

  it("catches up with a more advanced server value without waiting", () => {
    let value = 20;
    for (let tick = 0; tick < 20; tick++) value = nextStudioVideoProgress(value, 58, 500); // ~10 s
    expect(value).toBeGreaterThanOrEqual(58);
    expect(value).toBeLessThan(60);
  });

  it("does not jump after a long pause such as a sleeping tab", () => {
    expect(nextStudioVideoProgress(12, 10, 10 * 60_000)).toBeLessThan(15);
  });

  it("moves continuously across the long waits between server milestones", () => {
    // Serveur : lancement, séquence 1 (10 → 42), séquence 2 (58 → 82), assemblage, puis fin.
    const shown = simulate([[0, 2], [30, 10], [180, 42], [185, 48], [190, 52], [215, 58], [400, 82], [430, 90], [460, 94]], 480);
    for (let i = 1; i < shown.length; i++) expect(shown[i]).toBeGreaterThanOrEqual(shown[i - 1]);
    expect(Math.max(...shown)).toBeLessThanOrEqual(99);

    // Aucune pause de plus de 40 s tant que la barre n'a pas atteint le plafond du palier en cours.
    let lastChange = 0;
    let longestStall = 0;
    for (let i = 1; i < shown.length; i++) {
      const seconds = i / 2;
      if (shown[i] !== shown[i - 1]) { longestStall = Math.max(longestStall, seconds - lastChange); lastChange = seconds; }
    }
    expect(longestStall).toBeLessThanOrEqual(40);

    // Pendant la 2e séquence (serveur bloqué à 58 pendant ~3 min), la barre a bien avancé.
    expect(shown[(215 + 5) * 2]).toBeGreaterThanOrEqual(58);
    expect(shown[395 * 2]).toBeGreaterThanOrEqual(70);
  });
});
