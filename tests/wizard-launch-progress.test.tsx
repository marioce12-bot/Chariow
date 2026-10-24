// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_WIZARD_STATE, type Platform, type WizardState } from "../components/vendeo/wizard/types";
import { Step5Payment } from "../components/vendeo/wizard/Step5Payment";
import { translate } from "@/lib/i18n/translate";
import { ResumeCampaignModal } from "../components/vendeo/wizard/ResumeCampaignModal";

let locale: "fr" | "en" = "fr";
vi.mock("@/lib/i18n/i18n", () => ({
  useI18n: () => ({ locale, t: (key: string, values?: Record<string, string>) => translate(locale, key, values) }),
}));
vi.mock("@/lib/i18n/campaign-errors", () => ({ campaignErrorMessage: (error: string | null) => error ?? "Unknown error" }));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let container: HTMLDivElement;
let root: Root;
let state: WizardState;
let fetchMock: ReturnType<typeof vi.fn>;
const response = (data: unknown, ok = true) => Promise.resolve({ ok, json: () => Promise.resolve(data) });
function renderStep(platform: Platform = "meta", props: Partial<React.ComponentProps<typeof Step5Payment>> = {}, objective?: WizardState["objective"]) {
  state = { ...DEFAULT_WIZARD_STATE, campaignId: "campaign-123", platform, objective: objective ?? (platform === "pinterest" ? "sales" : "traffic") };
  act(() => root.render(<Step5Payment state={state} onLaunched={vi.fn()} onBack={vi.fn()} {...props} />));
}
function button(label: string, scope: ParentNode = container) {
  const found = Array.from(scope.querySelectorAll("button")).find((item) => item.textContent?.includes(label));
  if (!found) throw new Error(`Missing button: ${label}`);
  return found as HTMLButtonElement;
}
async function tick(ms = 0) { await act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); }); }

beforeEach(() => {
  locale = "fr";
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  fetchMock = vi.fn(() => response({}));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.querySelectorAll("body > div").forEach((node) => { if (node !== container) node.remove(); });
  vi.unstubAllGlobals();
});

describe("wizard launch progress", () => {
  it("shows the explicit launch label without launching on render", () => {
    renderStep("meta", { launchLabel: "Lancer maintenant" });
    expect(button("Lancer maintenant")).toBeDefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["fr", "meta", "Meta", "Envoi à Meta…"],
    ["en", "tiktok", "TikTok", "Sending to TikTok…"],
    ["fr", "pinterest", "Pinterest", "Envoi à Pinterest…"],
  ] as const)("shows estimated numeric progress in %s for %s", async (language, platform, expectedPlatform, expectedLabel) => {
    locale = language;
    let resolveFetch!: (value: unknown) => void;
    fetchMock.mockImplementation(() => new Promise((resolve) => { resolveFetch = resolve; }));
    renderStep(platform);
    act(() => button(language === "en" ? "Launch campaign" : "Lancer la campagne").click());
    const busy = container.querySelector('[aria-busy="true"]');
    expect(busy).not.toBeNull();
    expect(busy?.textContent).toContain(expectedLabel);
    const progress = container.querySelector('[role="progressbar"]');
    expect(progress).not.toBeNull();
    expect(progress?.getAttribute("aria-label")).toContain(expectedPlatform);
    expect(progress?.getAttribute("aria-valuenow")).toBe("0");
    expect(container.textContent).toContain("0 %");
    const back = Array.from(container.querySelectorAll("button")).find((item) => item.textContent?.includes(language === "en" ? "Back" : "Retour"));
    expect(back?.disabled).toBe(true);
    await tick(300);
    expect(Number(container.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow"))).toBeGreaterThan(0);
    expect(container.textContent).toMatch(/\b[1-9]\d?\s*%/);
    await act(async () => { resolveFetch({ ok: true, json: async () => ({}) }); });
  });

  it("prevents two clicks in the same React tick from producing duplicate POSTs", async () => {
    let resolveFetch!: (value: unknown) => void;
    fetchMock.mockImplementation(() => new Promise((resolve) => { resolveFetch = resolve; }));
    renderStep("meta");
    const launch = button("Lancer la campagne");
    act(() => { launch.click(); launch.click(); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/ad-campaigns/campaign-123/launch", expect.objectContaining({ method: "POST" }));
    await act(async () => { resolveFetch({ ok: true, json: async () => ({}) }); });
  });

  it("calls onLaunched only after the successful response resolves", async () => {
    let resolveFetch!: (value: unknown) => void;
    const onLaunched = vi.fn();
    fetchMock.mockImplementation(() => new Promise((resolve) => { resolveFetch = resolve; }));
    renderStep("meta", { onLaunched });
    act(() => button("Lancer la campagne").click());
    expect(onLaunched).not.toHaveBeenCalled();
    await act(async () => { resolveFetch({ ok: true, json: async () => ({}) }); });
    expect(container.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow")).toBe("100");
    expect(onLaunched).toHaveBeenCalledOnce();
    expect(onLaunched).toHaveBeenCalledWith("campaign-123");
  });

  it("shows a real launch error and allows retry", async () => {
    fetchMock.mockImplementationOnce(() => response({ error: "Real API failure" }, false)).mockImplementationOnce(() => response({}));
    renderStep("meta");
    act(() => button("Lancer la campagne").click());
    await tick();
    expect(container.textContent).toContain("Real API failure");
    expect(container.querySelector('[role="progressbar"]')).toBeNull();
    expect(container.textContent).not.toContain("100 %");
    act(() => button("Réessayer").click());
    await tick();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("Campagne envoyée à Meta");
    expect(container.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow")).toBe("100");
  });

  it("preserves Pinterest tag-required guidance and requires explicit Traffic fallback confirmation", async () => {
    fetchMock.mockImplementationOnce(() => response({ code: "PINTEREST_TAG_REQUIRED", error: "WEB_CONVERSION requires matched conversions" }, false));
    renderStep("pinterest");
    act(() => button("Lancer la campagne").click());
    await tick();
    expect(container.textContent).toContain("Pinterest Tag");
    expect(container.textContent).toMatch(/Trafic|Traffic/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string).confirm_traffic_fallback).toBe(false);
    await act(async () => { button("Oui, lancer en Trafic").click(); await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body as string).confirm_traffic_fallback).toBe(true);
  });

  it("stops a Meta Sales launch without a pixel and requires a separate Traffic confirmation", async () => {
    fetchMock.mockImplementationOnce(() => response({ code: "META_PIXEL_REQUIRED_FOR_SALES", error: "No Meta pixel found", fallback_available: true }, false))
      .mockImplementationOnce(() => response({ objective_fallback: true }));
    renderStep("meta", { launchLabel: "Lancer maintenant" }, "sales");

    act(() => button("Lancer maintenant").click());
    await tick();

    expect(container.textContent).toContain("Aucune campagne n’a été envoyée");
    expect(button("Confirmer le lancement en Trafic")).toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string).confirm_traffic_fallback).toBe(false);

    await act(async () => { button("Confirmer le lancement en Trafic").click(); await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body as string).confirm_traffic_fallback).toBe(true);
    expect(container.textContent).toContain("Campagne envoyée à Meta");
  });

  it("keeps ResumeCampaignModal open and its close callback blocked during an in-flight launch", async () => {
    locale = "en";
    let resolveFetch!: (value: unknown) => void;
    fetchMock.mockImplementation(() => new Promise((resolve) => { resolveFetch = resolve; }));
    const onClose = vi.fn();
    act(() => root.render(<ResumeCampaignModal campaignId="campaign-123" platform="meta" initialStatus="paused" onClose={onClose} onCorrection={vi.fn()} onLaunched={vi.fn()} />));
    await tick();
    expect(document.body.textContent).toContain("Launch campaign");
    act(() => button("Launch campaign", document.body).click());
    act(() => button("Close", document.body).click());
    expect(onClose).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Sending to Meta…");
    await act(async () => { resolveFetch({ ok: true, json: async () => ({}) }); });
  });
});
