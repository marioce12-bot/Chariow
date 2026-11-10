import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  createAdminClient: vi.fn(),
  from: vi.fn(),
  rows: {} as Record<string, any[]>,
}));

vi.mock("@/lib/admin", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));

import { GET } from "./route";

const USER_ID = "22222222-2222-4222-8222-222222222222";
const ADMIN_PROFILE_ID = "33333333-3333-4333-8333-333333333333";
const ADMIN_ROW_ID = "44444444-4444-4444-8444-444444444444";

function query(table: string) {
  const chain: any = {};
  for (const method of ["select", "eq", "gt", "gte", "order", "range", "contains", "in", "limit"]) {
    chain[method] = vi.fn(() => chain);
  }
  chain.then = (resolve: (value: unknown) => unknown, reject: (cause: unknown) => unknown) =>
    Promise.resolve({ data: mocks.rows[table] ?? [], count: (mocks.rows[table] ?? []).length, error: null }).then(resolve, reject);
  return chain;
}

function request(page = 0) {
  return new Request(`https://vendeo.example/api/admin/users/${USER_ID}/history?page=${page}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAdmin.mockResolvedValue({ admin: { id: ADMIN_ROW_ID, role: "super_admin" }, response: null });
  mocks.createAdminClient.mockReturnValue({ from: mocks.from });
  mocks.from.mockImplementation((table: string) => query(table));
  mocks.rows = {};
});

describe("GET /api/admin/users/[id]/history", () => {
  it.each([401, 403])("denies a non-admin session (%i) before reading account data", async (status) => {
    const { NextResponse } = await import("next/server");
    mocks.requireAdmin.mockResolvedValue({ admin: null, response: NextResponse.json({ error: "denied" }, { status }) });
    const response = await GET(request(), { params: Promise.resolve({ id: USER_ID }) });
    expect(response.status).toBe(status);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(mocks.requireAdmin).toHaveBeenCalledWith(["super_admin", "support"]);
  });

  it("merges real payment, credit and admin-audit records, while returning no payment secrets", async () => {
    mocks.rows.payment_events = [{
      id: "payment-row", transaction_id: "saspay-ref-1", plan: "starter", status: "approved",
      metadata: { amount_xof: 2000, provider_amount: 3.5, provider_currency: "USD", provider: "saspay", card_number: "must-not-leak" },
      created_at: "2026-11-01T12:00:00.000Z",
    }];
    mocks.rows.credit_transactions = [
      { id: "gift-row", kind: "purchase", credits: 100, operation: "admin_grant", external_id: "grant-1", status: "completed", metadata: { provider: "admin_grant", reason: "Support", secret: "must-not-leak" }, created_at: "2026-11-03T12:00:00.000Z" },
      { id: "credit-row", kind: "purchase", credits: 450, operation: "credit_purchase", external_id: "saspay-credit-1", status: "completed", metadata: { amount_xof: 1125, provider_amount: 1125, provider_currency: "XOF", provider: "saspay", cvc: "must-not-leak" }, created_at: "2026-11-02T12:00:00.000Z" },
    ];
    mocks.rows.platform_audit_logs = [{ actor_user_id: ADMIN_PROFILE_ID, metadata: { grant_id: "grant-1", credits: 100 }, created_at: "2026-11-03T12:00:00.000Z" }];
    mocks.rows.admin_audit_logs = [{ id: "activation-row", admin_user_id: ADMIN_ROW_ID, resource_id: "subscription-row", metadata: { user_id: USER_ID, plan: "starter" }, created_at: "2026-11-04T12:00:00.000Z" }];
    mocks.rows.admin_users = [{ id: ADMIN_ROW_ID, user_id: ADMIN_PROFILE_ID }];
    mocks.rows.profiles = [{ id: ADMIN_PROFILE_ID, full_name: "Admin Test", email: "admin@example.test", password: "must-not-leak" }];

    const response = await GET(request(), { params: Promise.resolve({ id: USER_ID }) });
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.events.map((event: any) => event.type)).toEqual([
      "subscription_admin_activation",
      "admin_credit_gift",
      "credit_purchase",
      "subscription_payment",
    ]);
    expect(payload.events[0].author).toEqual({ id: ADMIN_PROFILE_ID, name: "Admin Test", email: "admin@example.test" });
    expect(payload.events[1]).toMatchObject({ type: "admin_credit_gift", credits: 100, note: "Support", author: { name: "Admin Test" }, reference: "grant-1" });
    expect(payload.events[2]).toMatchObject({ amount_xof: 1125, provider_currency: "XOF", reference: "saspay-credit-1" });
    expect(payload.events[3]).toMatchObject({ amount_xof: 2000, provider_amount: 3.5, provider_currency: "USD", plan: "starter" });
    expect(JSON.stringify(payload)).not.toContain("must-not-leak");
    expect(JSON.stringify(payload)).not.toContain("password");
  });

  it("marks legacy credit gifts without a recorded actor as unattributed instead of inventing one", async () => {
    mocks.rows.credit_transactions = [{ id: "old-gift", kind: "purchase", credits: 25, operation: "admin_grant", external_id: "legacy", status: "completed", metadata: { provider: "admin_grant" }, created_at: "2026-10-01T12:00:00.000Z" }];
    mocks.rows.platform_audit_logs = [{ actor_user_id: null, metadata: { grant_id: "legacy" }, created_at: "2026-10-01T12:00:00.000Z" }];
    const response = await GET(request(), { params: Promise.resolve({ id: USER_ID }) });
    const payload = await response.json();
    expect(payload.events).toHaveLength(1);
    expect(payload.events[0].type).toBe("admin_credit_gift");
    expect(payload.events[0].author).toBeNull();
  });

  it("rejects malformed user IDs before accessing the service client", async () => {
    const response = await GET(request(), { params: Promise.resolve({ id: "not-a-uuid" }) });
    expect(response.status).toBe(400);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });
});
