import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/lib/i18n/i18n", () => ({ useI18n: () => ({ locale: "fr" }) }));

import { getSubscriptionExpiredCopy, SubscriptionExpiredNotice } from "./SubscriptionExpiredNotice";

describe("SubscriptionExpiredNotice", () => {
  it("explains that an expired free trial requires activating a subscription", () => {
    const html = renderToStaticMarkup(<SubscriptionExpiredNotice subscription={{ status: "past_due", trial_active: true }} />);
    expect(html).toContain("Ton essai gratuit est terminé");
    const copy = getSubscriptionExpiredCopy("fr", { status: "past_due", trial_active: true });
    expect(copy.dialogTitle).toBe("La période d’essai gratuite est terminée");
    expect(copy.dialogText).toContain("Notifications, Paramètres et Abonnement restent accessibles");
  });

  it("uses subscription-expiry copy for a paid plan", () => {
    const html = renderToStaticMarkup(<SubscriptionExpiredNotice subscription={{ status: "past_due", trial_active: false }} />);
    expect(html).toContain("Ton abonnement Vendeo a expiré");
    expect(html).not.toContain("Ton essai gratuit est terminé");
    expect(getSubscriptionExpiredCopy("fr", { status: "past_due", trial_active: false }).dialogTitle).toBe("Ton abonnement Vendeo a expiré");
  });
});
