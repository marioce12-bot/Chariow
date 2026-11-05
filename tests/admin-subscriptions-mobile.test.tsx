import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { translate } from "@/lib/i18n/translate";
const { JSDOM } = require("jsdom") as { JSDOM: new (html: string) => { window: { document: Document } } };
let locale: "fr" | "en" = "fr";
vi.mock("@/lib/i18n/i18n", () => ({ useI18n: () => ({ locale, t: (key: string, vars?: Record<string, string | number>) => translate(locale, key, vars) }) }));
import { SubscriptionsSection } from "@/components/AdminSections";
import type { AdminData } from "@/lib/admin-dashboard-types";
const data: AdminData = { admin: { role: "admin" }, metrics: { users: 0, stores: 0, subscriptions: 0, messages: 0, metaAccounts: 0, connectedUsersWithStore: 0, connectedUsersWithAdAccount: 0, connectedStores: 0, connectedAdAccounts: 0 }, business: {}, users: [], stores: [], subscriptions: [], metaAccounts: [], audit: [], creditPurchases: [], creditTransactions: [], paymentEvents: [] };
function renderSubscriptions(lang: "fr" | "en") { locale = lang; return renderToStaticMarkup(createElement(SubscriptionsSection, { data })); }
afterEach(() => vi.restoreAllMocks());
describe("SubscriptionsSection — chargement par GET", () => {
  it.each(["fr", "en"] as const)("affiche les KPI et contrôles localisés avant la réponse API (%s)", lang => {
    const html = renderSubscriptions(lang); const doc = new JSDOM(html).window.document; const root = doc.querySelector("section.admin-subscriptions");
    expect(root).not.toBeNull();
    expect(root!.textContent).toContain(lang === "en" ? "Current paid" : "Payants en cours");
    expect(root!.textContent).toContain(lang === "en" ? "Revenue period" : "Période des revenus");
    expect(root!.querySelectorAll(".admin-row:not(.admin-row-head)")).toHaveLength(0);
    expect(root!.querySelector('[role="status"]')?.textContent).toContain(lang === "en" ? "Loading subscriptions" : "Chargement des abonnements");
  });
  it("ne déclenche aucun appel réseau pendant le rendu serveur", () => { const fetchSpy = vi.spyOn(globalThis, "fetch"); renderSubscriptions("fr"); expect(fetchSpy).not.toHaveBeenCalled(); });
});
