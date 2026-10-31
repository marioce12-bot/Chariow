import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { META_PIXEL_ID, trackMetaPageView } from "@/lib/meta/site-pixel";

describe("site Meta Pixel", () => {
  let dom: JSDOM;

  beforeEach(() => {
    dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", {
      url: "https://www.vendeo-studio.site/",
    });
    vi.stubGlobal("window", dom.window);
    vi.stubGlobal("document", dom.window.document);
  });

  afterEach(() => {
    dom.window.close();
    vi.unstubAllGlobals();
  });

  it("initializes the supplied pixel once and deduplicates PageViews per route", () => {
    trackMetaPageView("/");
    trackMetaPageView("/");
    trackMetaPageView("/about");

    expect(window.fbq?.queue).toEqual([
      ["init", META_PIXEL_ID],
      ["track", "PageView"],
      ["track", "PageView"],
    ]);
    expect(document.querySelectorAll('script[src="https://connect.facebook.net/en_US/fbevents.js"]')).toHaveLength(1);
  });
});
