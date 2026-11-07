import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  requireUser: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: mocks.from, rpc: mocks.rpc }) }));

const code = "A1B2C3D4E5F607182930ABCD";
const referredUserId = "22222222-2222-4222-8222-222222222222";
const queryCalls: Array<{ table: string; selected: unknown }> = [];

function queryFor(table: string) {
  const selected: { value?: unknown } = {};
  const query: Record<string, any> = {};
  query.select = vi.fn((value: unknown) => { selected.value = value; queryCalls.push({ table, selected: value }); return query; });
  query.eq = vi.fn(() => query);
  query.order = vi.fn(() => query);
  query.range = vi.fn(async () => ({ data: [{ id: "referral-1", referred_user_id: referredUserId, created_at: "2026-11-07T10:00:00.000Z" }], count: 1, error: null }));
  query.limit = vi.fn(async () => ({ data: [{ id: "reward-1", milestone_count: 25, created_at: "2026-11-07T10:00:00.000Z", activated_at: null, starts_on: null, ends_on: null }], error: null }));
  query.maybeSingle = vi.fn(async () => ({ data: { code }, error: null }));
  query.in = vi.fn(async () => ({ data: [{ id: referredUserId, full_name: "Aïcha K.", email: "private@example.test" }], error: null }));
  if (table === "referrals") query.range = vi.fn(async () => ({ data: [{ id: "referral-1", referred_user_id: referredUserId, created_at: "2026-11-07T10:00:00.000Z" }], count: 1, error: null }));
  if (table === "referral_subscription_rewards") query.limit = vi.fn(async () => ({ data: [{ id: "reward-1", milestone_count: 25, created_at: "2026-11-07T10:00:00.000Z", activated_at: null, starts_on: null, ends_on: null }], error: null }));
  return query;
}

beforeEach(() => {
  queryCalls.length = 0;
  mocks.requireUser.mockResolvedValue({ user: { id: "authenticated-owner" }, response: null });
  mocks.from.mockImplementation((table: string) => queryFor(table));
});

describe("GET /api/referrals", () => {
  it("returns the caller's link and progress without exposing referred users' emails", async () => {
    const response = await GET(new Request("https://attacker.example/api/referrals"));
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.referralLink).toBe(`https://www.vendeo-studio.site/register?ref=${code}`);
    expect(payload.totalReferrals).toBe(1);
    expect(payload.referralCredits).toBe(150);
    expect(payload.referrals[0]).toMatchObject({ displayName: "Aïcha", number: 1 });
    expect(JSON.stringify(payload)).not.toContain("private@example.test");
    expect(queryCalls).toContainEqual({ table: "profiles", selected: "id,full_name" });
  });
});
