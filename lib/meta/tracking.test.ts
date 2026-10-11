import { describe, expect, it } from "vitest";
import { withVendeoCampaignTracking } from "./tracking";

describe("withVendeoCampaignTracking", () => {
  it("adds source, medium and the Vendeo campaign id while preserving other query params", () => {
    const url = new URL(withVendeoCampaignTracking("https://shop.example/buy?ref=abc", "vendeo-1"));
    expect(url.searchParams.get("ref")).toBe("abc");
    expect(url.searchParams.get("utm_source")).toBe("vendeo");
    expect(url.searchParams.get("utm_medium")).toBe("paid_social");
    expect(url.searchParams.get("utm_campaign")).toBe("vendeo-1");
  });

  it("does not overwrite explicit campaign UTMs", () => {
    const url = new URL(withVendeoCampaignTracking("https://shop.example/?utm_source=partner&utm_campaign=summer", "vendeo-2"));
    expect(url.searchParams.get("utm_source")).toBe("partner");
    expect(url.searchParams.get("utm_campaign")).toBe("summer");
    expect(url.searchParams.get("utm_medium")).toBe("paid_social");
  });

  it("rejects an invalid destination instead of silently losing tracking", () => {
    expect(() => withVendeoCampaignTracking("/checkout", "vendeo-3")).toThrow();
  });
});
