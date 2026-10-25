// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { translate } from "@/lib/i18n/translate";
const i18n = vi.hoisted(() => ({ locale: "fr" as "fr" | "en", setLocale: vi.fn() }));
vi.mock("@/lib/i18n/i18n", () => ({ useI18n: () => ({ locale: i18n.locale, setLocale: i18n.setLocale, t: (key: string, vars?: Record<string, string | number>) => translate(i18n.locale, key, vars) }) }));
import { MobileSettingsView } from "@/components/dashboard/sections";

let container: HTMLDivElement;
let root: Root;
const navigate = vi.fn();
const signOut = vi.fn();
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  i18n.locale = "fr"; vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ accounts: [], feedback: [] })));
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
async function mount(focus?: Parameters<typeof MobileSettingsView>[0]["focus"]) {
  await act(async () => root.render(<MobileSettingsView onNavigate={navigate} onSignOut={signOut} plan="starter" focus={focus} />));
}
function button(text: string) {
  const result = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((candidate) => candidate.textContent?.includes(text));
  if (!result) throw new Error(`Button not found: ${text}`);
  return result;
}

 describe("settings navigation", () => {
  it("opens feedback from the app settings list and keeps the return path", async () => {
    await mount();
    expect(fetch).not.toHaveBeenCalled();
    await act(async () => button(translate("fr", "sweep3.text293")).click());
    expect(container.querySelectorAll("[data-settings-panel]")).toHaveLength(1);
    expect(container.querySelector("#feedback-message")).toBeTruthy();
    expect(fetch).toHaveBeenCalledWith("/api/feedback", { cache: "no-store" });
    expect(navigate).not.toHaveBeenCalled();
    expect(container.querySelector(".settings-detail-back")).toBeTruthy();
  });

  it("opens appearance and language from their grouped rows and preserves both language actions", async () => {
    await mount();
    await act(async () => button(translate("fr", "settings.appearance")).click());
    expect(container.querySelector("[data-settings-panel=appearance]")).toBeTruthy();
    await act(async () => button(translate("fr", "settings.backToSettings")).click());
    await act(async () => button(translate("fr", "settings.language.title")).click());
    expect(container.querySelector("[data-settings-panel=language]")).toBeTruthy();
    await act(async () => button(translate("fr", "settings.language.english")).click());
    expect(i18n.setLocale).toHaveBeenCalledWith("en");
    i18n.locale = "en";
    await mount("language");
    expect(container.querySelector("[role=region]")?.textContent).toContain(translate("en", "settings.language.subtitle"));
    await act(async () => button(translate("en", "settings.language.french")).click());
    expect(i18n.setLocale).toHaveBeenCalledWith("fr");
  });

  it("filters the settings list by search text", async () => {
    await mount();
    const input = container.querySelector<HTMLInputElement>('input[type="search"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, "language");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(container.querySelectorAll(".settings-option-row")).toHaveLength(1);
    expect(container.querySelector(".settings-option-row")?.textContent).toContain(translate("fr", "settings.language.title"));
  });

  it("keeps stores, subscription, legal links, sign out and delete confirmation", async () => {
    await mount("accounts");
    await act(async () => button(translate("fr", "settings.myStores")).click());
    expect(navigate).toHaveBeenCalledWith("Mes boutiques");
    await act(async () => button(translate("fr", "settings.subscription")).click());
    expect(navigate).toHaveBeenCalledWith("Abonnement");
    await mount("about");
    expect(Array.from(container.querySelectorAll('[role="region"] a')).map(a => a.getAttribute("href"))).toEqual(["/about", "/terms", "/privacy"]);
    await mount("session");
    await act(async () => button(translate("fr", "settings.signout")).click());
    expect(signOut).toHaveBeenCalledOnce();
    await act(async () => button(translate("fr", "settings.deleteAccount")).click());
    expect(container.querySelector('[role="dialog"]')).toBeTruthy();
    expect(fetch).not.toHaveBeenCalledWith("/api/account", expect.anything());
  });

  it("opens connected accounts directly and allows disconnection", async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ accounts: [{ id: "connected" }] }));
    await mount("channels");
    expect(container.querySelector("[data-settings-panel=channels]")).toBeTruthy();
    expect(fetch).toHaveBeenCalledWith("/api/integrations/meta/accounts");
    vi.mocked(fetch).mockImplementation(async () => Response.json({}));
    await act(async () => button(translate("fr", "settings.disconnect")).click());
    expect(fetch).toHaveBeenCalledWith("/api/integrations/meta/disconnect", { method: "POST" });
  });

  it("updates the selected detail when the dashboard entry changes", async () => {
    await mount("channels");
    await mount("feedback");
    expect(container.querySelector("[data-settings-panel=feedback]")).toBeTruthy();
    await mount();
    expect(container.querySelector('[data-mobile-settings-section="index"]')).toBeTruthy();
    expect(container.querySelector(".settings-index")).toBeTruthy();
  });

  it("routes notifications from the app settings group", async () => {
    await mount();
    await act(async () => button(translate("fr", "notifications.title")).click());
    expect(navigate).toHaveBeenCalledWith("Notifications");
  });
});
