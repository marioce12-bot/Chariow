import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { LaunchProgress } from "@/components/chat/LaunchProgress";
import { I18nProvider } from "@/lib/i18n/i18n";
import { translate } from "@/lib/i18n/translate";
import { estimatedLaunchProgress } from "@/lib/chat/launch-progress";

const source = readFileSync(new URL("../components/ChatView.tsx", import.meta.url), "utf8");

describe("chat campaign submission progress", () => {
  it("starts at zero and increases monotonically without reaching 100 by time alone", () => {
    expect(estimatedLaunchProgress(0)).toBe(0);
    let previous = 0;
    for (const elapsed of [250, 1000, 5000, 12000, 30000, 60000, 600000, Number.MAX_VALUE]) {
      const progress = estimatedLaunchProgress(elapsed);
      expect(progress).toBeGreaterThanOrEqual(previous);
      expect(progress).toBeLessThanOrEqual(95);
      previous = progress;
    }
    expect(estimatedLaunchProgress(-100)).toBe(0);
    expect(estimatedLaunchProgress(NaN)).toBe(0);
  });
  it("renders an accessible estimate while awaiting confirmation", () => {
    const html = renderToStaticMarkup(<I18nProvider><LaunchProgress /></I18nProvider>);
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="0"');
    expect(html).toContain("Progression estimée");
    expect(html).not.toContain('aria-valuenow="100"');
  });
  it("shows 100% only for the confirmed state", () => {
    const html = renderToStaticMarkup(<I18nProvider><LaunchProgress complete /></I18nProvider>);
    expect(html).toContain('aria-valuenow="100"');
    expect(html).toContain("Campagne envoyée");
    expect(html).toContain("Envoi confirmé.");
    expect(html).not.toContain("Progression estimée");
  });
  it("has French and English labels without exposing translation keys", () => {
    for (const locale of ["fr", "en"] as const) {
      for (const key of ["launchSubmitting", "launchSent", "launchConfirmed", "launchProgressEstimated"]) {
        expect(translate(locale, `chat.${key}`)).not.toBe(`chat.${key}`);
      }
    }
  });
  it("Studio reuses the exact campaign component with controlled progress", () => {
    const studio = readFileSync("components/studio/SlideshowStudio.tsx", "utf8");
    expect(studio).toContain('import { LaunchProgress } from "@/components/chat/LaunchProgress"');
    expect(studio).toContain("<LaunchProgress progress={progress}");
    expect(studio).not.toContain("LoaderCircle");
    const html = renderToStaticMarkup(<I18nProvider><LaunchProgress progress={67} label="Génération du visuel 4/5…" subtitle="Visuels sauvegardés" /></I18nProvider>);
    expect(html).toContain('aria-valuenow="67"');
    expect(html).toContain('stroke-dasharray="67 100"');
    expect(html).toContain("67 %");
    expect(html).toContain("Visuels sauvegardés");
    expect(html).toContain('class="chat-launch-progress-ring"');
  });
  it("controlled estimates stay below 100 until the result is confirmed", () => {
    const html = renderToStaticMarkup(<I18nProvider><LaunchProgress progress={100} /></I18nProvider>);
    expect(html).toContain('aria-valuenow="99"');
  });
  it("keeps the existing destination, media and platform payload intact", () => {
    for (const field of ["linkUrl,", "storeId: payload.storeId", "productId: payload.productId", "mediaType: launchMediaKind", "carouselUrls:", "pinterestAdAccountId:", "metaAdAccountId:"]) {
      expect(source).toContain(field);
    }
    expect(source).toContain('fetch("/api/ai/launch-campaign"');
    expect(source.indexOf("if (!response.ok)", source.indexOf("async function confirmLaunch"))).toBeLessThan(source.indexOf("setLaunchComplete(true)"));
  });
  it("prevents duplicate submissions and keeps the popup locked while submitting", () => {
    expect(source).toContain("if (launchInFlightRef.current) return;");
    expect(source).toContain("launchInFlightRef.current = true;");
    expect(source).toContain("launchInFlightRef.current = false;");
    expect(source).toContain('disabled={launching} onClick={() => setLaunchOpen(false)}');
    expect(source).toContain("{launching ? <LaunchProgress complete={launchComplete} /> : null}");
  });
});
