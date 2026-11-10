// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminDashboard } from "@/components/AdminDashboard";

const localeState = vi.hoisted(() => ({ locale: "fr" }));
vi.mock("@/lib/i18n/i18n", async () => {
  const { translate } = await import("@/lib/i18n/translate");
  return {
    useI18n: () => ({
      locale: localeState.locale,
      setLocale: (locale: string) => {
        localeState.locale = locale;
      },
      t: (key: string, vars?: Record<string, string | number>) =>
        translate(localeState.locale as "fr" | "en", key, vars),
    }),
  };
});
const overview = {
  admin: { role: "owner" },
  metrics: {
    users: 27,
    stores: 3,
    subscriptions: 4,
    messages: 9,
    metaAccounts: 2,
    campaignsLaunched: 74,
    campaignsActive: 3,
  },
  business: { active_subscriptions: 4 },
  users: [
    {
      id: "user-1",
      email: "private@example.test",
      full_name: "Private Person",
      created_at: "2025-01-02T00:00:00.000Z",
      subscription: { plan: "starter", status: "active" },
    },
  ],
  stores: [
    {
      id: "store-secret",
      platform: "shop-secret",
      is_active: true,
      connection_status: "connected",
      connected_at: null,
      user_id: "user-1",
      name: "SECRET_SHOP_NAME",
      access_token: "SECRET_STORE_TOKEN",
    },
  ],
  metaAccounts: [
    {
      id: "meta-secret",
      user_id: "user-1",
      is_active: true,
      last_synced_at: "2025-01-02",
      name: "SECRET_META_NAME",
      access_token: "SECRET_META_TOKEN",
    },
  ],
  subscriptions: [],
  audit: [],
  creditPurchases: [],
  creditTransactions: [],
  paymentEvents: [],
};
const usage = {
  signups_24h: 2,
  signups_7d: 8,
  signups_30d: 15,
  signups_total: 27,
  active_users_24h: 5,
  days: 7,
  sessions: 36,
  active_users: 12,
  avg_session_seconds: 180,
  sections: [],
  signups_by_day: [{ day: "2025-01-02", count: 8 }],
};
const json = (body: unknown, status = 200) =>
  Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response);
const usagePayload = { usage };
const referralsPayload = {
  totalReferred: 2,
  referrerCount: 1,
  referrers: [
    {
      userId: "referrer-1",
      email: "alice@example.test",
      fullName: "Alice",
      referralCount: 2,
      referredAccounts: [
        { userId: "friend-1", email: "one@example.test", fullName: "First" },
        { userId: "friend-2", email: "two@example.test", fullName: "Second" },
      ],
    },
  ],
};
let container: HTMLDivElement;
let root: Root;
let fetchMock: ReturnType<typeof vi.fn>;
const eventSources: MockEventSource[] = [];

class MockEventSource {
  private listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
  readonly close = vi.fn();

  constructor(readonly url: string) {
    eventSources.push(this);
  }

  addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    this.listeners.get(type)?.delete(listener);
  }

  emit(type: string, data: string) {
    const event = new MessageEvent(type, { data });
    this.listeners.get(type)?.forEach((listener) => {
      if (typeof listener === "function") listener(event);
      else listener.handleEvent(event);
    });
  }
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  localeState.locale = "fr";
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  fetchMock = vi.fn((input: RequestInfo | URL) =>
    String(input).startsWith("/api/admin/overview")
      ? json(overview)
      : String(input).startsWith("/api/admin/usage")
        ? json(usagePayload)
        : String(input).startsWith("/api/admin/referrals")
          ? json(referralsPayload)
          : json({}),
  );
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  eventSources.length = 0;
  vi.unstubAllGlobals();
});
async function renderDashboard() {
  await act(async () => {
    root.render(<AdminDashboard />);
  });
  await settle();
}

describe("tableau de bord propriétaire", () => {
  it("charge les données Overview et Usage une seule fois et n’expose aucune donnée boutique/Meta privée", async () => {
    await renderDashboard();
    expect(
      fetchMock.mock.calls.filter(
        ([url]) => String(url) === "/api/admin/overview",
      ),
    ).toHaveLength(1);
    expect(
      fetchMock.mock.calls.filter(([url]) =>
        String(url).startsWith("/api/admin/usage"),
      ),
    ).toHaveLength(1);
    expect(container.textContent).toContain("27");
    expect(container.textContent).toContain("12");
    expect(container.textContent).not.toMatch(
      /SECRET_SHOP_NAME|shop-secret|SECRET_STORE_TOKEN|SECRET_META_NAME|SECRET_META_TOKEN|meta-secret/,
    );
  });

  it("conserve le polling de secours de 60 secondes jusqu’au test Realtime en production", async () => {
    const interval = vi.spyOn(window, "setInterval");
    try {
      await renderDashboard();
      expect(interval).toHaveBeenCalledWith(expect.any(Function), 60_000);
    } finally {
      interval.mockRestore();
    }
  });

  it("actualise les données ciblées après un signal SSE allowlisté", async () => {
    vi.stubGlobal("EventSource", MockEventSource as unknown as typeof EventSource);
    await renderDashboard();
    expect(eventSources).toHaveLength(1);
    expect(eventSources[0].url).toBe("/api/admin/events");
    const overviewCount = () => fetchMock.mock.calls.filter(([url]) => String(url) === "/api/admin/overview").length;
    const usageCount = () => fetchMock.mock.calls.filter(([url]) => String(url).startsWith("/api/admin/usage")).length;
    expect(overviewCount()).toBe(1);
    expect(usageCount()).toBe(1);

    await act(async () => {
      eventSources[0].emit("admin-data-changed", JSON.stringify({ scope: "signup" }));
      await new Promise((resolve) => setTimeout(resolve, 300));
    });

    expect(overviewCount()).toBe(2);
    expect(usageCount()).toBe(2);
    expect(window.location.pathname).not.toBe("/admin/login");
  });

  it("n’invente pas d’utilisateurs actifs si Usage répond en erreur", async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL) =>
      String(input).startsWith("/api/admin/usage")
        ? json({}, 503)
        : json(overview),
    );
    await renderDashboard();
    expect(container.textContent).toContain("Utilisateurs actifs");
    expect(container.querySelector(".admin-kpi-grid")?.textContent).toContain(
      "—",
    );
    expect(container.textContent).not.toContain("0 utilisateurs actifs");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "indisponibles",
    );
  });

  it("affiche — si la lecture des compteurs campagne échoue", async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL) =>
      String(input).startsWith("/api/admin/overview")
        ? json({ ...overview, metrics: { ...overview.metrics, campaignsLaunched: null, campaignsActive: null } })
        : json(usagePayload),
    );
    await renderDashboard();
    const launched = [...container.querySelectorAll(".admin-kpi")].find((card) => card.textContent?.includes("Campagnes lancées (total)"));
    const activeCampaigns = [...container.querySelectorAll(".admin-kpi")].find((card) => card.textContent?.includes("Campagnes actives"));
    expect(launched?.textContent).toContain("—");
    expect(activeCampaigns?.textContent).toContain("—");
  });

  it("affiche l’échec Overview et permet de réessayer sans rester en chargement", async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL) =>
      String(input) === "/api/admin/overview"
        ? json({}, 500)
        : json(usagePayload),
    );
    await renderDashboard();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "actualisée",
    );
    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      "Console indisponible",
    );
    fetchMock.mockImplementation((input: RequestInfo | URL) =>
      String(input) === "/api/admin/overview"
        ? json(overview)
        : json(usagePayload),
    );
    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('[role="alert"] button')!
        .click();
    });
    await settle();
    expect(container.textContent).toContain("Comptes inscrits");
    expect(container.querySelector('[role="status"]')).toBeNull();
  });

  it("actualise Overview et Usage quand on demande un refresh", async () => {
    await renderDashboard();
    await act(async () => {
      container.querySelector<HTMLButtonElement>(".admin-refresh")!.click();
    });
    await settle();
    expect(
      fetchMock.mock.calls.filter(
        ([url]) => String(url) === "/api/admin/overview",
      ),
    ).toHaveLength(2);
    expect(
      fetchMock.mock.calls.filter(([url]) =>
        String(url).startsWith("/api/admin/usage"),
      ),
    ).toHaveLength(2);
  });

  it("rafraîchit l’aperçu et les revenus au retour sur l’onglet admin", async () => {
    const visibility = Object.getOwnPropertyDescriptor(document, "visibilityState");
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    try {
      await renderDashboard();
      await act(async () => {
        window.dispatchEvent(new Event("focus"));
      });
      await settle();
      expect(fetchMock.mock.calls.filter(([url]) => String(url) === "/api/admin/overview")).toHaveLength(2);
      expect(fetchMock.mock.calls.filter(([url]) => String(url).startsWith("/api/admin/revenue"))).toHaveLength(2);
    } finally {
      if (visibility) Object.defineProperty(document, "visibilityState", visibility);
    }
  });

  it("la recherche rapide ouvre la section comptes", async () => {
    await renderDashboard();
    await act(async () => {
      container
        .querySelector<HTMLButtonElement>(".owner-search-shortcut")!
        .click();
    });
    expect(container.querySelector("h1")?.textContent).toBe(
      "Comptes utilisateurs",
    );
    expect(container.textContent).toContain("Private Person");
  });

  it("ouvre Parrainage et affiche les comptes parrainés avec leur parrain", async () => {
    await renderDashboard();
    await act(async () => {
      const referralButton = Array.from(
        container.querySelectorAll<HTMLButtonElement>(
          ".admin-nav-group button",
        ),
      ).find((button) => button.textContent?.trim() === "Parrainage");
      referralButton?.click();
    });
    await settle();

    expect(container.querySelector("h1")?.textContent).toBe("Parrainage");
    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).startsWith("/api/admin/referrals"),
      ),
    ).toBe(true);
    expect(container.textContent).toContain("Comptes parrainés");
    expect(container.textContent).toContain("Alice");
    expect(container.textContent).toContain("one@example.test");
    expect(container.textContent).toContain("Second");
  });

  it("demande la déconnexion par POST à l’API serveur", async () => {
    await renderDashboard();
    await act(async () => {
      container.querySelector<HTMLButtonElement>(".admin-logout")!.click();
    });
    await settle();
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/password-logout", {
      method: "POST",
    });
  });
});
