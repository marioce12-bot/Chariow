import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  createAdminClient: vi.fn(),
  from: vi.fn(),
}));

vi.mock("@/lib/admin", () => ({ requireAdmin: mocks.requireAdmin, writeAdminAudit: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));

import { GET } from "./route";

const PAID_USER = "22222222-2222-4222-8222-222222222222";
const TRIAL_USER = "33333333-3333-4333-8333-333333333333";

function makeQuery(table: string) {
  const filters: Record<string, unknown> = {};
  const chain: any = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn((column: string, value: unknown) => { filters[column] = value; return chain; });
  chain.gt = vi.fn((column: string, value: unknown) => { filters[`gt:${column}`] = value; return chain; });
  chain.gte = vi.fn((column: string, value: unknown) => { filters[`gte:${column}`] = value; return chain; });
  chain.range = vi.fn(() => chain);
  chain.in = vi.fn(() => chain);
  chain.then = (resolve: (value: unknown) => unknown, reject: (cause: unknown) => unknown) => {
    let data: any[] = [];
    if (table === "subscriptions" && filters.trial_active === true) {
      data = [{ user_id: TRIAL_USER, plan: "starter", status: "trialing", trial_active: true, trial_ends_at: "2026-11-15T12:00:00.000Z", current_period_end: null, created_at: "2026-11-01T00:00:00.000Z" }];
    } else if (table === "subscriptions" && filters.status === "active" && filters.trial_active === false) {
      data = [{ user_id: PAID_USER, plan: "starter", status: "active", trial_active: false, trial_ends_at: null, current_period_end: "2026-11-30", created_at: "2026-10-20T00:00:00.000Z" }];
    } else if (table === "profiles") {
      data = [
        { id: PAID_USER, email: "paid@example.test", full_name: "Paid Account" },
        { id: TRIAL_USER, email: "trial@example.test", full_name: "Trial Account" },
      ];
    }
    return Promise.resolve({ data, error: null }).then(resolve, reject);
  };
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAdmin.mockResolvedValue({ admin: { id: "admin", role: "super_admin" }, response: null });
  mocks.createAdminClient.mockReturnValue({ from: mocks.from });
  mocks.from.mockImplementation((table: string) => makeQuery(table));
});

describe("GET /api/admin/subscriptions", () => {
  it("requires a support or super-admin role before using the service client", async () => {
    const { NextResponse } = await import("next/server");
    mocks.requireAdmin.mockResolvedValue({ admin: null, response: NextResponse.json({ error: "denied" }, { status: 403 }) });
    const response = await GET();
    expect(response.status).toBe(403);
    expect(mocks.requireAdmin).toHaveBeenCalledWith(["super_admin", "support"]);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it("returns active paid subscriptions and valid trials in separate lists", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.paid_subscriptions).toEqual([
      expect.objectContaining({ user_id: PAID_USER, trial_active: false, user: { id: PAID_USER, email: "paid@example.test", full_name: "Paid Account" } }),
    ]);
    expect(payload.trial_subscriptions).toEqual([
      expect.objectContaining({ user_id: TRIAL_USER, trial_active: true, user: { id: TRIAL_USER, email: "trial@example.test", full_name: "Trial Account" } }),
    ]);
  });

  it("never includes a trial account in the active paid-subscription list", async () => {
    const response = await GET();
    const payload = await response.json();
    expect(payload.paid_subscriptions.every((item: any) => item.trial_active === false)).toBe(true);
    expect(payload.paid_subscriptions.some((item: any) => item.user_id === TRIAL_USER)).toBe(false);
    expect(payload.trial_subscriptions.some((item: any) => item.user_id === TRIAL_USER)).toBe(true);
  });
});
