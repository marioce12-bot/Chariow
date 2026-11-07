import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  requireUser: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc: mocks.rpc }) }));

const rewardId = "11111111-1111-4111-8111-111111111111";

function post(body: unknown) {
  return POST(new Request("https://vendeo.example/api/referrals/activate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }));
}

beforeEach(() => {
  mocks.requireUser.mockResolvedValue({ user: { id: "authenticated-owner" }, response: null });
  mocks.rpc.mockReset();
});

describe("POST /api/referrals/activate", () => {
  it("uses the authenticated user and safely reports a repeated activation", async () => {
    mocks.rpc.mockResolvedValue({
      data: { ok: true, duplicate: true, reward_id: rewardId, milestone_count: 25, starts_on: "2026-11-08", ends_on: "2026-12-08" },
      error: null,
    });

    const response = await post({ rewardId, userId: "attacker-selected-user" });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, duplicate: true, reward: { id: rewardId, milestoneCount: 25 } });
    expect(mocks.rpc).toHaveBeenCalledWith("activate_referral_subscription_reward", {
      target_user_id: "authenticated-owner",
      target_reward_id: rewardId,
    });
  });

  it("rejects malformed reward ids before calling the database", async () => {
    const response = await post({ rewardId: "not-a-uuid" });
    expect(response.status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("does not consume a different reward when the requested right is unavailable", async () => {
    mocks.rpc.mockResolvedValue({ data: { ok: false, code: "reward_not_found" }, error: null });
    const response = await post({ rewardId });
    expect(response.status).toBe(404);
    expect((await response.json()).error).toContain("Aucun abonnement offert");
  });
});
