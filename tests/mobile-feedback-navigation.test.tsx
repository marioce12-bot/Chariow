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
async function tab(id: string) {
  await act(async () => (container.querySelector(`#settings-tab-${id}`) as HTMLButtonElement).click());
}
function button(text: string) {
  return Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tabpanel"] button')).find((b) => b.textContent?.includes(text))!;
}

describe("settings navigation", () => {
  it("opens feedback inside its own tab, not as a card before preferences", async () => {
    await mount("preferences");
    expect(fetch).not.toHaveBeenCalled();
    await tab("feedback");
    expect(container.querySelectorAll("[data-settings-panel]")).toHaveLength(1);
    expect(container.querySelector("#feedback-message")).toBeTruthy();
    expect(fetch).toHaveBeenCalledWith("/api/feedback", { cache: "no-store" });
    expect(navigate).not.toHaveBeenCalled();
    expect(container.querySelector(".mobile-settings-return")).toBeNull();
  });

  it("separates appearance and language, and preserves both language actions", async () => {
    await mount();
    expect(container.querySelector("[data-settings-panel=appearance]")).toBeTruthy();
    await tab("language");
    expect(container.querySelector("[data-settings-panel=appearance]")).toBeNull();
    await act(async () => button(translate("fr", "settings.language.english")).click());
    expect(i18n.setLocale).toHaveBeenCalledWith("en");
    i18n.locale = "en";
    await mount();
    expect(container.querySelector("[role=tabpanel]")?.textContent).toContain(translate("en", "settings.language.subtitle"));
    await act(async () => button(translate("en", "settings.language.french")).click());
    expect(i18n.setLocale).toHaveBeenCalledWith("fr");
  });

  it("supports arrow keys, Home and End with roving focus", async () => {
    await mount();
    const first = container.querySelector<HTMLButtonElement>("#settings-tab-appearance")!;
    await act(async () => first.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
    expect(document.activeElement?.id).toBe("settings-tab-language");
    expect(container.querySelector("[role=tabpanel]")?.id).toBe("settings-panel-language");
    await act(async () => document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true })));
    expect(document.activeElement?.id).toBe("settings-tab-session");
    await act(async () => document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true })));
    expect(document.activeElement?.id).toBe("settings-tab-appearance");
  });

  it("keeps stores, subscription, legal links, sign out and delete confirmation", async () => {
    await mount("accounts");
    await act(async () => button(translate("fr", "settings.myStores")).click());
    expect(navigate).toHaveBeenCalledWith("Mes boutiques");
    await act(async () => button(translate("fr", "settings.subscription")).click());
    expect(navigate).toHaveBeenCalledWith("Abonnement");
    await tab("about");
    expect(Array.from(container.querySelectorAll("[role=tabpanel] a")).map(a => a.getAttribute("href"))).toEqual(["/about", "/terms", "/privacy"]);
    await tab("session");
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

  it("updates the selected panel when dashboard entry changes", async () => {
    await mount("channels");
    await mount("feedback");
    expect(container.querySelector('[role=tab][aria-selected=true]')?.id).toBe("settings-tab-feedback");
    await mount();
    expect(container.querySelector('[role=tab][aria-selected=true]')?.id).toBe("settings-tab-appearance");
  });
});
