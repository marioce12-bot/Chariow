// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { COOKIE_CONSENT_STORAGE_KEY } from "@/lib/legal/cookie-consent";
import { disableMetaPixels, enableMetaPixel } from "@/lib/legal/meta-pixels";

vi.mock("@/lib/i18n/i18n", () => ({ useI18n: () => ({ locale: "fr", t: (key: string) => key }) }));
vi.mock("@/lib/legal/meta-pixels", () => ({ enableMetaPixel: vi.fn(), disableMetaPixels: vi.fn() }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: any) => createElement("a", props, children) }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  localStorage.clear();
  vi.clearAllMocks();
  vi.resetModules();
});

function mount(Component: typeof import("./CookieConsentManager").CookieConsentManager) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root.render(createElement(Component)));
}

describe("global cookie consent banner", () => {
  it("keeps the site pixel off before choice and when optional tracking is rejected", async () => {
    const { CookieConsentManager } = await import("./CookieConsentManager");
    mount(CookieConsentManager);
    expect(container.textContent).toContain("Vos choix de confidentialité");
    expect(enableMetaPixel).not.toHaveBeenCalled();
    const reject = [...container.querySelectorAll("button")].find((button) => button.textContent === "Tout refuser")!;
    act(() => reject.click());
    expect(enableMetaPixel).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY)!).marketing).toBe(false);
    expect(container.querySelector(".cookie-consent-banner")).toBeNull();
  });

  it("loads the site pixel only after the visitor explicitly allows optional trackers", async () => {
    const { CookieConsentManager } = await import("./CookieConsentManager");
    mount(CookieConsentManager);
    expect(enableMetaPixel).not.toHaveBeenCalled();
    const accept = [...container.querySelectorAll("button")].find((button) => button.textContent === "Tout accepter")!;
    act(() => accept.click());
    expect(enableMetaPixel).toHaveBeenCalledWith("1096494316523399");
    expect(container.querySelector(".cookie-consent-banner")).toBeNull();
  });
});
