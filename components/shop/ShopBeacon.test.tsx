// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ShopBeacon } from "./ShopBeacon";
import { saveCookieConsent } from "@/lib/legal/cookie-consent";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  document.cookie = "vendeo_visitor_id=; Max-Age=0; path=/";
  localStorage.clear();
  sessionStorage.clear();
  vi.unstubAllGlobals();
});

describe("public shop visit measurement", () => {
  it("does not create a visitor identifier or send a visit until optional consent", () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchSpy);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() => root.render(createElement(ShopBeacon, { slug: "sample-shop" })));
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(document.cookie).not.toContain("vendeo_visitor_id=");

    act(() => saveCookieConsent(true));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0][0])).toBe("/api/shop/track");
    expect(String(fetchSpy.mock.calls[0][1].body)).toContain('"slug":"sample-shop"');
    expect(document.cookie).toContain("vendeo_visitor_id=");
  });
});
