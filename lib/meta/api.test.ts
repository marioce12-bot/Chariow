import { afterEach, describe, expect, it, vi } from "vitest";
import { actionValue, fetchMetaInsights } from "./api";

describe("actionValue", () => {
  it("retient uniquement le premier type d'achat prioritaire présent", () => {
    const actions = [
      { action_type: "offsite_conversion.fb_pixel_purchase", value: "8" },
      { action_type: "purchase", value: "10" },
      { action_type: "omni_purchase", value: "12" },
    ];
    expect(actionValue(actions, ["purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase"])).toBe(10);
  });

  it("utilise le type de repli non nul sans additionner les valeurs", () => {
    const actions = [
      { action_type: "purchase", value: "0" },
      { action_type: "omni_purchase", value: "3" },
      { action_type: "offsite_conversion.fb_pixel_purchase", value: "5" },
    ];
    expect(actionValue(actions, ["purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase"])).toBe(3);
  });
});

afterEach(() => vi.restoreAllMocks());

describe("fetchMetaInsights counters", () => {
  it("counts Graph pages while logging only the page counter", async () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    fetch
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [{ id: "insight-1" }],
        paging: { next: "https://graph.facebook.com/v23.0/page2" },
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ id: "insight-2" }] })));

    const rows = await fetchMetaInsights("act_1", "test-access-token", "2026-10-01", "2026-10-02", "campaign");

    expect(rows).toHaveLength(2);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(info).toHaveBeenCalledWith("Meta Graph page counters", { graphPages: 2 });
    const counterLog = info.mock.calls.find(([message]) => message === "Meta Graph page counters");
    expect(counterLog).toEqual(["Meta Graph page counters", { graphPages: 2 }]);
    expect(JSON.stringify(counterLog)).not.toContain("test-access-token");
    expect(JSON.stringify(counterLog)).not.toContain("act_1");
  });
});
