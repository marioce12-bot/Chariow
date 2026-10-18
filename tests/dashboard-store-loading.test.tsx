import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { I18nProvider } from "@/lib/i18n/i18n";
import { translate } from "@/lib/i18n/translate";
import { DashboardSkeleton, SkeletonRows } from "@/components/dashboard/Skeleton";

const dashboard = readFileSync(new URL("../components/Dashboard.tsx", import.meta.url), "utf8");

describe("store loading skeletons", () => {
  it("renders accessible placeholders instead of fake numbers", () => {
    const html = renderToStaticMarkup(<I18nProvider><DashboardSkeleton /></I18nProvider>);
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('role="status"');
    expect(html).toContain('class="sk"');
    expect(html).not.toContain("0 USD");
  });

  it("lets lists describe what is loading", () => {
    const html = renderToStaticMarkup(<I18nProvider><SkeletonRows count={4} label={translate("fr", "sweep3.text173")} /></I18nProvider>);
    expect(html).toContain(`aria-label="${translate("fr", "sweep3.text173")}"`);
    expect(html.match(/class="sk-row"/g)).toHaveLength(4);
  });

  it("hides the previous snapshot immediately and aborts obsolete requests", () => {
    expect(dashboard).toContain("analyticsStoreId !== activeStoreId");
    expect(dashboard).toContain("snapshotView && storeDataLoading");
    expect(dashboard).toContain("signal: controller.signal");
    expect(dashboard).toContain("if (controller.signal.aborted) return;");
    expect(dashboard).toContain("return () => controller.abort()");
    expect(dashboard).toContain("setAnalytics(nextAnalytics)");
    expect(dashboard).not.toContain("nextAnalytics ?? cached?.analytics ?? analytics");
  });

  it("keeps reduced-motion users free of shimmer animations", () => {
    const css = readFileSync(new URL("../app/dashboard-skeleton.css", import.meta.url), "utf8");
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(css).toContain("animation: none");
  });

  it("uses skeletons for the route fallback and recovery data", () => {
    const page = readFileSync(new URL("../app/dashboard/page.tsx", import.meta.url), "utf8");
    const recovery = readFileSync(new URL("../components/dashboard/RecoveryPanel.tsx", import.meta.url), "utf8");
    expect(page).toContain("fallback={<DashboardSkeleton />}");
    expect(recovery).toContain('<SkeletonRows count={4} label={t("sweep3.text173")} />');
    expect(translate("fr", "sweep3.text173")).toBe("Chargement des relances");
  });
});
