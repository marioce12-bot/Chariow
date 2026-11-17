// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SUBSCRIPTION_EXPIRED_MODAL_EVENT } from "@/lib/subscription/ui";

vi.mock("@/lib/i18n/i18n", () => ({ useI18n: () => ({ locale: "fr" }) }));

import { getSubscriptionExpiredCopy, SubscriptionExpiredNotice } from "./SubscriptionExpiredNotice";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
afterEach(() => { act(() => root?.unmount()); container?.remove(); });

describe("SubscriptionExpiredNotice", () => {
  it("does not show a banner or block the workspace merely because a subscription is inactive", () => {
    const html = renderToStaticMarkup(<SubscriptionExpiredNotice subscription={{ status: "past_due", trial_active: false }} />);
    expect(html).toBe("");
    expect(html).not.toContain("vendeo-expired-banner");
  });

  it("shows a clear activation dialog only after an action reports a subscription requirement", () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() => root.render(<SubscriptionExpiredNotice subscription={null} />));
    expect(container.querySelector('[role="alertdialog"]')).toBeNull();
    act(() => window.dispatchEvent(new Event(SUBSCRIPTION_EXPIRED_MODAL_EVENT)));
    expect(container.querySelector('[role="alertdialog"]')?.textContent).toContain("Cette action nécessite un abonnement actif");
    expect(container.textContent).toContain("Voir les options d’abonnement");
    expect(container.querySelector(".vendeo-expired-banner")).toBeNull();
  });

  it("uses accurate wording for trial, expired-plan, and no-plan cases", () => {
    const trial = getSubscriptionExpiredCopy("fr", { status: "past_due", trial_active: true });
    const paid = getSubscriptionExpiredCopy("fr", { status: "past_due", trial_active: false });
    const missing = getSubscriptionExpiredCopy("fr", null);
    expect(trial.dialogTitle).toBe("La période d’essai gratuite est terminée");
    expect(trial.dialogText).toContain("Cette action nécessite un abonnement actif");
    expect(paid.dialogTitle).toBe("Ton abonnement Vendeo a expiré");
    expect(missing.dialogTitle).toBe("Cette action nécessite un abonnement actif");
  });
});
