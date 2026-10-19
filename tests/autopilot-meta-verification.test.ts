import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/crypto", () => ({ decryptSecret: () => "private-test-token" }));
import { checkAutopilotLiveStatus } from "@/lib/autopilot-live-status";
import { isAutopilotLive } from "@/lib/autopilot-eligibility";

const campaign = { id: "local-c", status: "active", platform: "meta", external_campaign_id: "c", external_adset_id: "s", external_ad_id: "a", meta_ad_account_id: "account" };
function database() {
  const chain: any = {};
  chain.select = () => chain; chain.eq = () => chain;
  chain.maybeSingle = async () => ({ data: { meta_account_id: "123", access_token_encrypted: "encrypted", is_active: true } });
  return { from: () => chain };
}
function platform(overrides: Record<string, any> = {}, status = 200) {
  const records: Record<string, any> = { act_123: { id: "act_123", account_status: 1 }, c: { id: "c", effective_status: "ACTIVE", status: "ACTIVE" }, s: { id: "s", effective_status: "ACTIVE", status: "ACTIVE" }, a: { id: "a", effective_status: "ACTIVE", status: "ACTIVE", created_time: "2026-01-01T00:00:00Z", updated_time: "2026-01-01T00:00:00Z" }, insights: { data: [{ impressions: "1" }] }, ...overrides };
  vi.stubGlobal("fetch", vi.fn(async (url: URL, options: RequestInit) => {
    expect(options.method).toBe("GET"); expect(options.cache).toBe("no-store");
    return { ok: status === 200, status, json: async () => records[url.pathname.split("/").pop()!] };
  }));
}
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("fresh Meta proof", () => {
  it("automatically returns an eligible proof only when all four objects are active", async () => {
    platform();
    const proof = await checkAutopilotLiveStatus(database(), "u", campaign);
    expect(isAutopilotLive(proof)).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(5);
  });
  it("does not unlock on ACTIVE approval before the first impression", async () => {
    platform({ insights: { data: [] } });
    const proof = await checkAutopilotLiveStatus(database(), "u", campaign);
    expect(proof.state).toBe("unknown"); expect(isAutopilotLive(proof)).toBe(false);
    expect(proof.reason).not.toContain("Préparation");
  });
  it("does not reuse old impressions after a same-day edit", async () => {
    platform({ a: { id: "a", effective_status: "ACTIVE", created_time: "2026-01-01T00:00:00Z", updated_time: "2026-01-01T00:10:00Z" }, insights: { data: [{ impressions: "100" }] } });
    expect(isAutopilotLive(await checkAutopilotLiveStatus(database(), "u", campaign))).toBe(false);
  });
  it("keeps the two-impression regression ineligible until fresh growth on the same revision", async () => {
    const row = { ...campaign, meta_delivery_observation: { ad_id: "a", revision: "2026-01-01T00:10:00.000Z", baseline_impressions: 2, confirmed: false } };
    const a = { id: "a", effective_status: "ACTIVE", created_time: "2026-01-01T00:00:00Z", updated_time: "2026-01-01T00:10:00Z" };
    platform({ a, insights: { data: [{ impressions: "2" }] } });
    expect(isAutopilotLive(await checkAutopilotLiveStatus(database(), "u", row))).toBe(false);
    platform({ a, insights: { data: [{ impressions: "3" }] } });
    expect(isAutopilotLive(await checkAutopilotLiveStatus(database(), "u", row))).toBe(true);
  });
  it.each(["c", "s", "a"])("rejects inactive %s even if local campaign says active", async (id) => {
    platform({ [id]: { id, status: "ACTIVE", effective_status: "PAUSED" } });
    expect((await checkAutopilotLiveStatus(database(), "u", campaign)).state).toBe("inactive");
  });
  it.each([
    { act_123: { id: "act_123", account_status: 2 } },
    { c: { id: "wrong", effective_status: "ACTIVE" } },
    { a: { id: "a", status: "ACTIVE" } },
    { s: { id: "s", effective_status: "ACTIVE", end_time: "2000-01-01T00:00:00Z" } },
    { s: { id: "s", effective_status: "ACTIVE", start_time: "2999-01-01T00:00:00Z" } },
  ])("never enables on incomplete, inactive, mismatched or out-of-period proof", async (overrides) => {
    platform(overrides);
    expect(isAutopilotLive(await checkAutopilotLiveStatus(database(), "u", campaign))).toBe(false);
  });
  it("reports revoked credentials distinctly and logs no credentials or provider message", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = { error: { code: 190, error_subcode: 460, message: "sensitive provider text" } };
    platform({ act_123: error, c: error, s: error, a: error }, 401);
    const proof = await checkAutopilotLiveStatus(database(), "u", campaign);
    expect(proof.state).toBe("unknown"); expect(proof.reasonCode).toBe("TOKEN_EXPIRED");
    expect(isAutopilotLive(proof)).toBe(false);
    const log = JSON.stringify(warn.mock.calls);
    expect(log).toContain("TOKEN_EXPIRED");
    expect(log).not.toContain("private-test-token"); expect(log).not.toContain("sensitive provider text"); expect(log).not.toContain("access_token");
  });
  it("does not mislabel a non-auth API failure as expired credentials", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = { error: { code: 100 } };
    platform({ act_123: error, c: error, s: error, a: error }, 400);
    const proof = await checkAutopilotLiveStatus(database(), "u", campaign);
    expect(proof.state).toBe("unknown"); expect(proof.reasonCode).toBe("VERIFICATION_FAILED");
  });
});
