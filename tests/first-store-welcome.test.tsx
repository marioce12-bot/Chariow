// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FirstStoreWelcome, OFFICIAL_WHATSAPP_CHANNEL_URL, VENDEO_TOUR_STEPS } from "@/components/dashboard/FirstStoreWelcome";
import type { SubscriptionData } from "@/components/dashboard/shared";
vi.mock("@/lib/i18n/i18n", () => ({ useI18n: () => ({ locale: "fr" }) }));
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  vi.stubGlobal("requestAnimationFrame", (callback: () => void) => { callback(); return 1; });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
const subscription = { trial_active: true, trial_ends_at: "2099-10-30T12:00:00Z" } as SubscriptionData;
async function mount(stage: "welcome" | "tour", onDismiss = vi.fn(), onTryStudio = vi.fn()) {
  await act(async () => root.render(<FirstStoreWelcome stage={stage} subscription={subscription} onTryStudio={onTryStudio} onDismiss={onDismiss} onTourStepChange={vi.fn()} />));
  return { onDismiss, onTryStudio };
}
function button(text: string) { return Array.from(container.querySelectorAll("button")).find(button => button.textContent?.includes(text))!; }
describe("first-store welcome", () => {
  it("confirms the connected store, displays trial benefits, and avoids a restart promise", async () => {
    const { onTryStudio } = await mount("welcome");
    expect(container.textContent).toContain("Félicitations");
    expect(container.textContent).toContain("Ta boutique Chariow est connectée");
    expect(container.textContent).toContain("5 jours d’essai gratuit et 100 crédits Studio te sont offerts");
    expect(container.textContent).toContain("30 octobre 2099");
    expect(container.textContent).toContain("Tes crédits Studio et ton budget publicitaire sont distincts");
    const communityLink = container.querySelector<HTMLAnchorElement>("a.vendeo-welcome-community");
    expect(communityLink?.getAttribute("href")).toBe(OFFICIAL_WHATSAPP_CHANNEL_URL);
    expect(communityLink?.getAttribute("target")).toBe("_blank");
    expect(communityLink?.getAttribute("rel")).toBe("noopener noreferrer");
    await act(async () => button("Essayer le Studio").click()); expect(onTryStudio).toHaveBeenCalledOnce();
    expect(document.activeElement?.getAttribute("role")).toBe("dialog");
  });
  it("does not announce an expired trial as active", async () => {
    await act(async () => root.render(<FirstStoreWelcome stage="welcome" subscription={{ ...subscription, trial_active: false, trial_ends_at: "2020-01-01" }} onTryStudio={vi.fn()} onDismiss={vi.fn()} onTourStepChange={vi.fn()} />));
    expect(container.textContent).toContain("Retrouve l’état actuel de ton essai dans Abonnement");
    expect(container.textContent).toContain("Fin de l’essai :");
  });
  it("supports every tour step, back, completion and Escape", async () => {
    expect(VENDEO_TOUR_STEPS).toHaveLength(14);
    expect(JSON.stringify(VENDEO_TOUR_STEPS)).not.toMatch(/pilotage auto|autopilot/i);
    const { onDismiss } = await mount("tour");
    expect(button("Précédent").disabled).toBe(true);
    expect(container.textContent).toContain("Choisis ta boutique");
    await act(async () => button("Suivant").click());
    expect(container.textContent).toContain("Vue d’ensemble : tes indicateurs clés");
    await act(async () => button("Précédent").click());
    for (let i = 1; i < VENDEO_TOUR_STEPS.length; i++) await act(async () => button("Suivant").click());
    expect(container.textContent).toContain("Paramètres");
    await act(async () => button("C’est parti").click()); expect(onDismiss).toHaveBeenCalledOnce();
    await act(async () => container.querySelector("section")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(onDismiss).toHaveBeenCalledTimes(2);
  });
  it("traps keyboard focus and restores scroll state on unmount", async () => {
    await mount("tour"); const dialog = container.querySelector("section")!;
    await act(async () => dialog.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true })));
    expect(document.activeElement).toBe(container.querySelector("button")); expect(document.body.style.overflow).toBe("hidden");
    await act(async () => root.render(null)); expect(document.body.style.overflow).not.toBe("hidden");
  });
});
