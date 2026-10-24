// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DESKTOP_DASHBOARD_TOUR_STEPS,
  MOBILE_DASHBOARD_TOUR_STEPS,
} from "@/components/dashboard/tour-steps";
import type { DashboardTourStep } from "@/components/dashboard/tour-steps";
import { FirstStoreWelcome } from "@/components/dashboard/FirstStoreWelcome";
import { readFileSync } from "node:fs";

vi.mock("@/lib/i18n/i18n", () => ({ useI18n: () => ({ locale: "fr" }) }));

let root: Root | undefined;
let host: HTMLDivElement | undefined;
let transitions: Array<DashboardTourStep | null> = [];
function setViewport(width: number) {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  window.dispatchEvent(new Event("resize"));
}
async function mountGuide() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(createElement(FirstStoreWelcome, {
      stage: "tour",
      subscription: null,
      onStart: () => {},
      onDismiss: () => {},
      onTourStepChange: (step) => transitions.push(step),
    }));
  });
}
async function nextStep() {
  const next = host?.querySelector<HTMLButtonElement>(".vendeo-tour-actions .btn-dark");
  if (!next) throw new Error("Guide next button was not rendered");
  await act(async () => { next.click(); });
}
function title() { return host?.querySelector("#vendeo-welcome-title")?.textContent; }

afterEach(() => {
  root?.unmount();
  host?.remove();
  root = undefined;
  host = undefined;
  transitions = [];
  vi.unstubAllGlobals();
});

beforeEach(() => {
  if (!window.requestAnimationFrame) {
    window.requestAnimationFrame = ((callback: FrameRequestCallback) => window.setTimeout(() => callback(Date.now()), 0)) as typeof window.requestAnimationFrame;
  }
  if (!window.cancelAnimationFrame) {
    window.cancelAnimationFrame = ((handle: number) => window.clearTimeout(handle)) as typeof window.cancelAnimationFrame;
  }
});

describe("responsive Vendeo dashboard guide", () => {
  it("follows the five mobile dock destinations in exact order, then describes the separate Assistant bubble", () => {
    expect(MOBILE_DASHBOARD_TOUR_STEPS.slice(0, 5).map((step) => step.target)).toEqual([
      "Vue d'ensemble", "Pub", "Studio", "Performance visuel", "Performance publicitaire",
    ]);
    expect(MOBILE_DASHBOARD_TOUR_STEPS.slice(0, 5).map((step) => step.activeSection)).toEqual([
      "Vue d'ensemble", "Pub", "Studio", "Performance visuel", "Performance publicitaire",
    ]);
    expect(MOBILE_DASHBOARD_TOUR_STEPS[5]).toMatchObject({ id: "assistant-bubble", target: "Vendeo AI" });
    expect(MOBILE_DASHBOARD_TOUR_STEPS[5].activeSection).toBeUndefined();
  });

  it("opens the actual overflow menu and targets every real mobile menu entry before explaining it", () => {
    const menuSteps = MOBILE_DASHBOARD_TOUR_STEPS.filter((step) => step.menuTarget);
    expect(menuSteps.map((step) => step.menuTarget)).toEqual([
      "Bénéfices nets", "Relances WhatsApp", "Radar marché", "Performance publicitaire", "Rapports", "Paramètres",
    ]);
    for (const step of menuSteps) {
      expect(step.openMobileMenu).toBe(true);
      expect(step.target).toBe(`mobile-menu:${step.menuTarget}`);
      expect(step.activeSection).toBe(step.menuTarget);
    }
    const dashboard = readFileSync(`${process.cwd()}/components/Dashboard.tsx`, "utf8");
    expect(dashboard).toContain("setMoreOpen(Boolean(step.openMobileMenu))");
    expect(dashboard).toContain("guideMenuTarget === section ? \"guide-highlight\" : \"\"");
    expect(dashboard).toContain('onTourStepChange={handleTourStepChange}');
    for (const section of menuSteps.map((step) => step.menuTarget)) {
      expect(dashboard).toContain(`data-onboarding=\"mobile-menu:${section}\"`);
    }
    expect(dashboard).toContain('data-onboarding="mobile-more-trigger"');
    expect(dashboard).not.toContain('if (!target) target = document.querySelector<HTMLElement>(".mobile-more-trigger")');
  });

  it("uses an independent desktop sequence with desktop-specific overview refinements and navigation", () => {
    expect(DESKTOP_DASHBOARD_TOUR_STEPS[0].target).toBe("store");
    expect(DESKTOP_DASHBOARD_TOUR_STEPS.slice(1, 8).map((step) => step.target)).toEqual([
      "Vue d'ensemble", "Bénéfices nets", "Relances WhatsApp", "Vendeo AI", "Studio", "Pub", "Performance visuel",
    ]);
    expect(DESKTOP_DASHBOARD_TOUR_STEPS.find((step) => step.id === "home")?.body).toContain("graphique Meta est moins haut");
    expect(DESKTOP_DASHBOARD_TOUR_STEPS.map((step) => step.target)).toContain("Comptes publicitaires");
    expect(DESKTOP_DASHBOARD_TOUR_STEPS).not.toEqual(MOBILE_DASHBOARD_TOUR_STEPS);
  });

  it("renders the mobile order and reports real section transitions to its parent", async () => {
    setViewport(390);
    await mountGuide();
    expect(title()).toContain("Accueil");
    expect(transitions.at(-1)).toMatchObject({ id: "home", activeSection: "Vue d'ensemble" });

    await nextStep();
    expect(title()).toContain("Pub");
    expect(transitions.at(-1)).toMatchObject({ id: "ads", activeSection: "Pub" });
    await nextStep();
    expect(title()).toContain("Studio");
    await nextStep();
    expect(title()).toContain("Visuels");
    await nextStep();
    expect(title()).toContain("Campagnes");
    await nextStep();
    expect(title()).toContain("Assistant");
    await nextStep();
    expect(title()).toBe("Bénéfices nets");
    expect(transitions.at(-1)).toMatchObject({ openMobileMenu: true, menuTarget: "Bénéfices nets", target: "mobile-menu:Bénéfices nets" });
  });

  it("switches to the desktop tour at desktop widths", async () => {
    setViewport(1024);
    await mountGuide();
    expect(title()).toContain("boutique");
    expect(transitions.at(-1)?.target).toBe("store");
    await nextStep();
    expect(title()).toContain("Vue d’ensemble");
    expect(transitions.at(-1)).toMatchObject({ id: "home", activeSection: "Vue d'ensemble" });
  });

  it("restarts at the first step when the viewport switches between mobile and desktop", async () => {
    setViewport(390);
    await mountGuide();
    await nextStep();
    expect(title()).toContain("Pub");
    await act(async () => { setViewport(1024); });
    expect(title()).toContain("boutique");
    expect(transitions.at(-1)?.target).toBe("store");
    await act(async () => { setViewport(390); });
    expect(title()).toContain("Accueil");
    expect(transitions.at(-1)?.target).toBe("Vue d'ensemble");
  });
});
