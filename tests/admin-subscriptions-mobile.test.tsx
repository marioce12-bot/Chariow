import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { translate } from "@/lib/i18n/translate";
const { JSDOM } = require("jsdom") as { JSDOM: new (html: string) => { window: { document: Document } } };

let locale: "fr" | "en" = "fr";
vi.mock("@/lib/i18n/i18n", () => ({
  useI18n: () => ({ locale, t: (key: string, vars?: Record<string, string | number>) => translate(locale, key, vars) }),
}));

import { SubscriptionsSection } from "@/components/AdminSections";
import type { AdminData } from "@/lib/admin-dashboard-types";

const accountLabels = { fr: "Compte", en: "Account" };
const planLabels = { fr: "Offre", en: "Plan" };
const dateLabels = { fr: "Fin de période", en: "Period ends" };
const actionLabels = { fr: "Actions", en: "Actions" };
const statusLabels = { fr: "Statut", en: "Status" };

function dataFor(statuses: string[]): AdminData {
  return {
    admin: { role: "admin" },
    metrics: { users: 0, stores: 0, subscriptions: statuses.length, messages: 0, metaAccounts: 0 },
    business: {},
    users: statuses.map((_, i) => ({
      id: `user-${i}`, email: `person-${i}@example.test`, full_name: `Account ${i}`, created_at: "2025-01-01",
    })),
    stores: [],
    subscriptions: statuses.map((status, i) => ({
      id: `sub-${i}`, user_id: `user-${i}`, plan: `Plan ${i}`, status,
      messages_used_this_month: 0, messages_limit: 100,
      ...(i === 0 ? {} : { current_period_end: "2025-02-03T12:00:00.000Z" }),
    })),
    metaAccounts: [], audit: [], creditPurchases: [], creditTransactions: [], paymentEvents: [],
  } as AdminData;
}

function renderSubscriptions(lang: "fr" | "en", statuses = ["active", "trialing", "canceled", "past_due", "incomplete"]) {
  locale = lang;
  return renderToStaticMarkup(createElement(SubscriptionsSection, { data: dataFor(statuses) }));
}

afterEach(() => vi.restoreAllMocks());

describe("SubscriptionsSection — rendu SSR mobile", () => {
  it.each(["fr", "en"] as const)("localise et regroupe les données par abonnement (%s)", (lang) => {
    const html = renderSubscriptions(lang);
    const doc = new JSDOM(html).window.document;
    const root = doc.querySelector("section.admin-subscriptions");
    expect(root).not.toBeNull();
    const rows = [...root!.querySelectorAll(".admin-row:not(.admin-row-head)")];
    expect(rows).toHaveLength(5);
    expect(rows[0].classList.contains("admin-row-head")).toBe(false);
    expect(root!.querySelector(".admin-row-head")?.textContent).toContain(accountLabels[lang]);
    expect(root!.querySelector(".admin-row-head")?.textContent).toContain(planLabels[lang]);
    expect(root!.querySelector(".admin-row-head")?.textContent).toContain(statusLabels[lang]);
    expect(root!.querySelector(".admin-row-head")?.textContent).toContain(dateLabels[lang]);
    expect(root!.querySelector(".admin-row-head")?.textContent).toContain(actionLabels[lang]);

    const expectedStatuses = ["active", "trialing", "canceled", "past_due", "incomplete"];
    rows.forEach((row, i) => {
      expect(row.querySelector(".admin-subscription-account")?.textContent).toBe(`Account ${i}`);
      expect(row.querySelector(".admin-subscription-plan")?.textContent).toBe(`Plan ${i}`);
      expect(row.querySelector(".admin-subscription-status")?.textContent).toBeTruthy();
      expect(row.querySelector(".admin-subscription-state")?.textContent).toBeTruthy();
      expect(row.querySelector(`.admin-subscription-state.${expectedStatuses[i]}`)).not.toBeNull();
      expect(row.querySelector(".admin-subscription-date")?.getAttribute("data-label")).toBe(dateLabels[lang]);
      expect(row.querySelector(".admin-subscription-actions")?.getAttribute("data-label")).toBe(actionLabels[lang]);
      expect(row.querySelector(".admin-subscription-account")?.getAttribute("data-label")).toBe(accountLabels[lang]);
      expect(row.querySelector(".admin-subscription-plan")?.getAttribute("data-label")).toBe(planLabels[lang]);
      expect(row.querySelector(".admin-subscription-status")?.getAttribute("data-label")).toBe(statusLabels[lang]);
      expect(row.querySelector(".admin-subscription-actions button") !== null).toBe(expectedStatuses[i] !== "active");
    });
    expect(rows[0].querySelector(".admin-subscription-date")?.textContent?.trim()).toBe("—");
    expect(rows[1].querySelector(".admin-subscription-date")?.textContent).not.toBe("—");
  });

  it.each(["fr", "en"] as const)("conserve un nom très long et la date absente (%s)", (lang) => {
    const longName = `A very long customer account name ${"with many descriptive words ".repeat(24)}`;
    const data = dataFor(["canceled"]);
    data.users[0].full_name = longName;
    locale = lang;
    const html = renderToStaticMarkup(createElement(SubscriptionsSection, { data }));
    const doc = new JSDOM(html).window.document;
    const row = doc.querySelector(".admin-subscriptions .admin-row:not(.admin-row-head)")!;
    expect(row.querySelector(".admin-subscription-account")?.textContent).toBe(longName);
    expect(row.querySelector(".admin-subscription-date")?.textContent?.trim()).toBe("—");
  });

  it("ne déclenche aucun appel réseau au rendu", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    renderSubscriptions("fr");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
