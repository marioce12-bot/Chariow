// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  IntegrationsSection,
  PayoutsSection,
  SubscriptionsSection,
  UsersSection,
} from "@/components/AdminSections";
import type { AdminData, UsageStats } from "@/components/AdminSections";

const localeState = vi.hoisted(() => ({ locale: "fr" }));
vi.mock("@/lib/i18n/i18n", async () => {
  const { translate } = await import("@/lib/i18n/translate");
  return {
    useI18n: () => ({
      locale: localeState.locale,
      setLocale: (locale: string) => { localeState.locale = locale; },
      t: (key: string, vars?: Record<string, string | number>) =>
        translate(localeState.locale as "fr" | "en", key, vars),
    }),
  };
});

const data = {
  admin: { role: "owner" },
  metrics: { users: 1, stores: 1, subscriptions: 1, messages: 0, metaAccounts: 1 },
  business: {},
  users: [{ id: "user-1", email: "owner-test@example.test", full_name: "Compte Test", created_at: "2025-01-02T00:00:00.000Z" }],
  stores: [{ id: "store-1", platform: "shopify", is_active: true, connection_status: "error", connected_at: null, user_id: "user-1", name: "SECRET_SHOP_NAME", access_token: "SECRET_STORE_TOKEN" }],
  metaAccounts: [{ id: "meta-1", user_id: "user-1", is_active: false, last_synced_at: "2025-01-02T00:00:00.000Z", name: "SECRET_META_NAME", access_token: "SECRET_META_TOKEN" }],
  subscriptions: [{ id: "sub-1", user_id: "user-1", plan: "free", status: "canceled", messages_used_this_month: 0, messages_limit: 0 }],
  audit: [], creditPurchases: [], creditTransactions: [], paymentEvents: [], payouts: [],
} as unknown as AdminData;
const usage = null as UsageStats | null;
const jsonResponse = (body: unknown = {}) => Promise.resolve({ ok: true, status: 200, json: async () => body } as Response);
let container: HTMLDivElement;
let root: Root;
let fetchMock: ReturnType<typeof vi.fn>;
let confirmMock: ReturnType<typeof vi.fn>;
async function settle() {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}
async function render(node: React.ReactNode) {
  await act(async () => { root.render(node); });
}
function button(label: string) {
  const result = [...container.querySelectorAll("button")].find((item) => item.textContent?.trim() === label);
  if (!result) throw new Error(`Bouton introuvable: ${label}`);
  return result;
}
function input(label: string) {
  const result = [...document.querySelectorAll("label")].find((item) => item.textContent?.includes(label))?.querySelector("input");
  if (!result) throw new Error(`Champ introuvable: ${label}`);
  return result;
}
async function click(element: HTMLElement) {
  await act(async () => { element.click(); });
}
async function change(element: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  await act(async () => {
    setter?.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
async function submitForm() {
  const form = document.querySelector(".admin-grant-modal form") ?? container.querySelector("form");
  if (!form) throw new Error("Formulaire absent");
  await act(async () => { form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
}
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  localeState.locale = "fr";
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  fetchMock = vi.fn(() => jsonResponse());
  confirmMock = vi.fn(() => true);
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("confirm", confirmMock);
  vi.stubGlobal("crypto", { randomUUID: () => "123e4567-e89b-42d3-a456-426614174000" });
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("actions propriétaires dans les sections admin", () => {
  it("ferme la popup crédits avec Escape et restaure le focus au déclencheur", async () => {
    await render(<UsersSection data={data} usage={usage} />);
    const trigger = button("Attribuer des crédits");
    await click(trigger);
    await act(async () => { await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined))); });
    expect(document.activeElement).toBe(input("Crédits"));
    await act(async () => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(document.body.style.overflow).toBe("");
  });

  it("active un abonnement après confirmation avec le payload starter attendu et annule sans POST", async () => {
    await render(<SubscriptionsSection data={data} />);
    confirmMock.mockReturnValueOnce(false);
    await click(button("Activer"));
    expect(fetchMock).not.toHaveBeenCalled();
    confirmMock.mockReturnValueOnce(true);
    await click(button("Activer"));
    await settle();
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/subscriptions", expect.objectContaining({ method: "POST", body: JSON.stringify({ user_id: "user-1", plan: "starter" }) }));
  });

  it("ouvre le formulaire de crédits, valide le plafond, annule la confirmation sans POST puis attribue le UUID", async () => {
    await render(<UsersSection data={data} usage={usage} />);
    await click(button("Attribuer des crédits"));
    expect(document.querySelector('[role="dialog"][aria-modal="true"]')?.textContent).toContain("Attribuer des crédits");
    await change(input("Crédits"), "100001");
    await submitForm();
    expect(document.body.textContent).toContain("Choisissez entre 1 et 100 000 crédits.");
    expect(fetchMock).not.toHaveBeenCalled();
    await change(input("Crédits"), "100000");
    await change(input("Motif"), "Ajustement approuvé");
    confirmMock.mockReturnValueOnce(false);
    await submitForm();
    expect(fetchMock).not.toHaveBeenCalled();
    confirmMock.mockReturnValueOnce(true);
    await submitForm();
    await settle();
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/credits", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ user_id: "user-1", credits: 100000, reason: "Ajustement approuvé", grant_id: "123e4567-e89b-42d3-a456-426614174000" }),
    }));
  });

  it("n’envoie pas un décaissement refusé, transmet le formulaire intact et rend le bouton réutilisable après erreur réseau", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    await render(<PayoutsSection data={data} onRefresh={vi.fn()} />);
    await change(input("Montant (XOF)"), "2500");
    await change(input("Nom du destinataire"), "Bénéficiaire Test");
    await change(input("Téléphone du destinataire"), "+22960000000");
    await change(input("Mode de paiement"), "mtn_bj");
    confirmMock.mockReturnValueOnce(false);
    await submitForm();
    expect(fetchMock).not.toHaveBeenCalled();
    confirmMock.mockReturnValueOnce(true);
    await submitForm();
    await settle();
    expect(fetchMock).toHaveBeenLastCalledWith("/api/admin/payouts", expect.objectContaining({ method: "POST", body: JSON.stringify({ amount_xof: "2500", recipient_name: "Bénéficiaire Test", recipient_phone: "+22960000000", recipient_method: "mtn_bj", recipient_country: "BJ" }) }));
    expect(container.textContent).toContain("Résultat inconnu après erreur réseau. Vérifiez l’historique avant de réessayer.");
    expect(button("Envoyer le décaissement").disabled).toBe(false);
  });

  it("affiche Meta inactif comme déconnecté et boutique en erreur comme à vérifier sans révéler noms ni tokens", async () => {
    await render(<IntegrationsSection data={data} />);
    expect(container.textContent).toContain("Déconnecté");
    expect(container.textContent).toContain("À vérifier");
    for (const secret of ["SECRET_SHOP_NAME", "SECRET_STORE_TOKEN", "SECRET_META_NAME", "SECRET_META_TOKEN"]) {
      expect(container.textContent).not.toContain(secret);
    }
  });
});
