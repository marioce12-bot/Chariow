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

    expect(host.querySelector('[role="alert"]')?.textContent).toContain("Abonnement Vendeo expiré");
    expect(host.querySelector('[role="alertdialog"]')).toBeNull();
  });

  it("opens on a gated-action event and routes its CTA to the Subscription section", async () => {
    const navigate = vi.fn();
    window.addEventListener(OPEN_SUBSCRIPTION_SECTION_EVENT, navigate);
    await act(async () => root!.render(createElement(SubscriptionExpiredNotice, { subscription: { status: "past_due" } })));

    await act(async () => window.dispatchEvent(new Event(SUBSCRIPTION_EXPIRED_MODAL_EVENT)));
    expect(host.querySelector('[role="alertdialog"]')?.textContent).toContain("Ton abonnement Vendeo a expiré");
    const action = [...host.querySelectorAll("button")].find((button) => button.textContent?.includes("Aller à Abonnement"));
    expect(action).toBeTruthy();
    await act(async () => action!.click());

    expect(navigate).toHaveBeenCalledOnce();
    expect(host.querySelector('[role="alertdialog"]')).toBeNull();
    window.removeEventListener(OPEN_SUBSCRIPTION_SECTION_EVENT, navigate);
  });

  it("does not describe an active Vendeo subscription as expired", async () => {
    await act(async () => root!.render(createElement(SubscriptionExpiredNotice, { subscription: { status: "active" } })));
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(isVendeoSubscriptionExpired({ status: "active" })).toBe(false);
    expect(isVendeoSubscriptionExpired({ status: "past_due" })).toBe(true);
  });
});
