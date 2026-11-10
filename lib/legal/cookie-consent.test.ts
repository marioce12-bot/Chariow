// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { COOKIE_CONSENT_STORAGE_KEY, hasMarketingConsent, readCookieConsent, saveCookieConsent } from "./cookie-consent";

afterEach(() => {
  localStorage.clear();
  document.cookie = "vendeo_visitor_id=; Max-Age=0; path=/";
  document.cookie = "_fbp=; Max-Age=0; path=/";
  document.cookie = "_fbc=; Max-Age=0; path=/";
});

describe("optional tracking consent", () => {
  it("keeps marketing tracking off until an explicit choice is saved", () => {
    expect(readCookieConsent()).toBeNull();
    expect(hasMarketingConsent()).toBe(false);
    saveCookieConsent(false);
    expect(hasMarketingConsent()).toBe(false);
    expect(localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY)).toContain('"marketing":false');
  });

  it("stores an affirmative choice separately and can later withdraw it", () => {
    saveCookieConsent(true);
    expect(hasMarketingConsent()).toBe(true);
    saveCookieConsent(false);
    expect(hasMarketingConsent()).toBe(false);
    expect(document.cookie).not.toContain("vendeo_visitor_id=");
  });
});
