// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { OPEN_SUBSCRIPTION_SECTION_EVENT, SUBSCRIPTION_EXPIRED_MODAL_EVENT, isVendeoSubscriptionExpired } from "@/lib/subscription/ui";

vi.mock("@/lib/i18n/i18n", () => ({ useI18n: () => ({ locale: "fr" }) }));

import { SubscriptionExpiredNotice } from "@/components/SubscriptionExpiredNotice";

let root: Root | undefined;
let host: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  host.remove();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("Vendeo subscription expiry notice", () => {
  it("shows a clear persistent banner but does not open a modal automatically", async () => {
    await act(async () => root!.render(createElement(SubscriptionExpiredNotice, { subscription: { status: "past_due" } })));

    expect(host.querySelector('[role="alert"]')?.textContent).toContain("Ton abonnement Vendeo a expiré");
    expect(host.querySelector('[role="alertdialog"]')).toBeNull();
  });

  it("opens on a gated-action event and launches the payment checkout from its CTA", async () => {
    const navigate = vi.fn();
    const paymentFetch = vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "gateway unavailable" }) });
    vi.stubGlobal("fetch", paymentFetch);
    window.addEventListener(OPEN_SUBSCRIPTION_SECTION_EVENT, navigate);
    await act(async () => root!.render(createElement(SubscriptionExpiredNotice, { subscription: { status: "past_due" } })));

    await act(async () => window.dispatchEvent(new Event(SUBSCRIPTION_EXPIRED_MODAL_EVENT)));
    expect(host.querySelector('[role="alertdialog"]')?.textContent).toContain("Ton abonnement Vendeo a expiré");
    expect(host.querySelector("#vendeo-expired-description")?.textContent).toBe("Réactive ton abonnement pour retrouver l’accès aux sections métier. Notifications, Paramètres et Abonnement restent accessibles.");
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("l’Assistant, aux publicités et au Studio");
    const action = [...host.querySelectorAll("button")].find((button) => button.textContent?.includes("Continuer vers le paiement"));
    expect(action).toBeTruthy();
    await act(async () => {
      action!.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(paymentFetch).toHaveBeenCalledOnce();
    expect(paymentFetch).toHaveBeenCalledWith("/api/subscription/checkout", expect.objectContaining({ method: "POST" }));
    expect(navigate).not.toHaveBeenCalled();
    expect(host.querySelector('[role="alertdialog"]')).not.toBeNull();
    expect(host.querySelector(".vendeo-expired-error")?.textContent).toBe("Le paiement n’a pas pu démarrer. Vérifie ta connexion puis réessaie.");
    window.removeEventListener(OPEN_SUBSCRIPTION_SECTION_EVENT, navigate);
  });

  it("does not describe an active Vendeo subscription as expired", async () => {
    await act(async () => root!.render(createElement(SubscriptionExpiredNotice, { subscription: { status: "active" } })));
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(isVendeoSubscriptionExpired({ status: "active" })).toBe(false);
    expect(isVendeoSubscriptionExpired({ status: "past_due" })).toBe(true);
  });
});
