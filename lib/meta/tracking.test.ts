import { describe, expect, it } from "vitest";
import { stripVendeoCampaignTracking, withVendeoCampaignTracking } from "./tracking";

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

describe("stripVendeoCampaignTracking", () => {
  it("retire le utm_campaign de la campagne d'origine et garde le reste", () => {
    const tracked = withVendeoCampaignTracking("https://shop.example/buy?ref=abc", "orig-1");
    const url = new URL(stripVendeoCampaignTracking(tracked, "orig-1"));
    expect(url.searchParams.has("utm_campaign")).toBe(false);
    expect(url.searchParams.get("ref")).toBe("abc");
    expect(url.searchParams.get("utm_source")).toBe("vendeo");
  });

  it("permet à la copie d'être suivie sous son propre identifiant", () => {
    const tracked = withVendeoCampaignTracking("https://shop.example/buy", "orig-1");
    const copy = new URL(withVendeoCampaignTracking(stripVendeoCampaignTracking(tracked, "orig-1"), "copy-2"));
    expect(copy.searchParams.get("utm_campaign")).toBe("copy-2");
  });

  it("conserve un utm_campaign saisi par l'utilisateur", () => {
    const link = "https://shop.example/?utm_campaign=summer";
    expect(stripVendeoCampaignTracking(link, "orig-1")).toBe(link);
  });

  it("renvoie le lien inchangé s'il n'a aucun suivi ou s'il est invalide", () => {
    expect(stripVendeoCampaignTracking("https://shop.example", "orig-1")).toBe("https://shop.example");
    expect(stripVendeoCampaignTracking("/checkout", "orig-1")).toBe("/checkout");
  });
});
