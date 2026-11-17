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

describe("Vendeo subscription activation notice", () => {
  it("does not show a persistent banner or a modal automatically when the plan is expired", async () => {
    await act(async () => root!.render(createElement(SubscriptionExpiredNotice, { subscription: { status: "past_due" } })));
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(host.querySelector('[role="alertdialog"]')).toBeNull();
    expect(host.querySelector(".vendeo-expired-banner")).toBeNull();
  });

  it("opens only after a gated action and routes the user to subscription options, without starting payment", async () => {
    const navigate = vi.fn();
    const paymentFetch = vi.fn();
    vi.stubGlobal("fetch", paymentFetch);
    window.addEventListener(OPEN_SUBSCRIPTION_SECTION_EVENT, navigate);
    await act(async () => root!.render(createElement(SubscriptionExpiredNotice, { subscription: { status: "past_due", trial_active: false } })));

    await act(async () => window.dispatchEvent(new Event(SUBSCRIPTION_EXPIRED_MODAL_EVENT)));
    expect(host.querySelector('[role="alertdialog"]')?.textContent).toContain("Ton abonnement Vendeo a expiré");
    expect(host.querySelector("#vendeo-expired-description")?.textContent).toContain("Tes sections, données, paramètres et menus restent accessibles");
    const action = [...host.querySelectorAll("button")].find((button) => button.textContent?.includes("Voir les options d’abonnement"));
    expect(action).toBeTruthy();
    await act(async () => action!.click());

    expect(navigate).toHaveBeenCalledOnce();
    expect(paymentFetch).not.toHaveBeenCalled();
    expect(host.querySelector('[role="alertdialog"]')).toBeNull();
    window.removeEventListener(OPEN_SUBSCRIPTION_SECTION_EVENT, navigate);
  });

  it("does not describe an active Vendeo subscription as expired", async () => {
    await act(async () => root!.render(createElement(SubscriptionExpiredNotice, { subscription: { status: "active" } })));
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(host.querySelector('[role="alertdialog"]')).toBeNull();
    expect(isVendeoSubscriptionExpired({ status: "active" })).toBe(false);
    expect(isVendeoSubscriptionExpired({ status: "past_due" })).toBe(true);
  });
});
