import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  createAdminClient: vi.fn(),
  writeAdminAudit: vi.fn(),
  calls: [] as Array<{ table: string; method: string; args: unknown[] }>,
  results: {} as Record<string, any>,
}));
vi.mock("@/lib/admin", () => ({
  requireAdmin: mocks.requireAdmin,
  writeAdminAudit: mocks.writeAdminAudit,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));
import { GET as getOverview } from "@/app/api/admin/overview/route";
import {
  GET as getPayouts,
  POST as createPayout,
} from "@/app/api/admin/payouts/route";
function builder(table: string) {
  const b: any = {};
  let mutation: "insert" | "update" | null = null;
  const result = () =>
    mocks.results[table] ?? { data: [], count: 0, error: null };
  for (const method of [
    "select",
    "order",
    "limit",
    "eq",
    "insert",
    "update",
    "single",
  ])
    b[method] = (...args: unknown[]) => {
      mocks.calls.push({ table, method, args });
      if (method === "insert" || method === "update") mutation = method;
      return b;
    };
  b.single = () => {
    mocks.calls.push({ table, method: "single", args: [] });
    return Promise.resolve(
      mutation
        ? mutation === "insert"
          ? {
              data: { id: "payout-id", amount_xof: 2000, status: "processing" },
              error: null,
            }
          : {
              data: { id: "payout-id", amount_xof: 2000, status: "completed" },
              error: null,
            }
        : result(),
    );
  };
  b.then = (resolve: any, reject: any) =>
    Promise.resolve(result()).then(resolve, reject);
  return b;
}
function setup() {
  mocks.createAdminClient.mockImplementation(() => ({
    from: (table: string) => builder(table),
    rpc: () => builder("rpc"),
  }));
  mocks.requireAdmin.mockResolvedValue({
    admin: {
      id: "sa-1",
      role: "super_admin",
      email: "private@example.com",
      session: "secret",
    },
    supabase: { from: (table: string) => builder(table) },
    response: null,
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.calls.length = 0;
  mocks.results = {};
  setup();
});
describe("admin API response data minimization", () => {
  it("allowlists all overview sources, preserves safe purchase amounts, normalizes subscriptions, and sorts audit newest first", async () => {
    mocks.results.profiles = {
      data: [
        {
          id: "u1",
          email: "e@example.com",
          full_name: "Name",
          created_at: "2025-01-01",
          updated_at: "private",
          role: "secret",
          subscriptions: [
            { plan: "pro", status: "active", token: "secret" },
            { plan: "other" },
          ],
          password: "secret",
        },
      ],
      count: 1,
    };
    mocks.results.stores = {
      data: [
        {
          id: "s1",
          user_id: "u1",
          platform: "shop",
          is_active: true,
          connection_status: "connected",
          connected_at: "2025-01-01",
          created_at: "2025-01-01",
          store_name: "secret shop",
          credentials: "secret",
        },
      ],
      count: 1,
    };
    mocks.results.meta_ad_accounts = {
      data: [
        {
          id: "m1",
          user_id: "u1",
          is_active: true,
          last_synced_at: null,
          name: "private",
          meta_account_id: "secret",
          access_token: "secret",
        },
      ],
    };
    mocks.results.admin_audit_logs = {
      data: [
        {
          id: "a1",
          action: "admin",
          resource_type: "t",
          created_at: "2025-01-02",
          resource_id: "secret",
          metadata: { token: "secret" },
        },
      ],
    };
    mocks.results.platform_audit_logs = {
      data: [
        {
          id: "p1",
          action: "platform",
          resource_type: "t",
          created_at: "2025-01-03",
          actor_user_id: "secret",
          resource_id: "secret",
          metadata: { token: "secret" },
        },
      ],
    };
    mocks.results.credit_transactions = {
      data: [
        {
          id: "purchase",
          user_id: "u1",
          kind: "purchase",
          credits: 3,
          operation: "purchase",
          status: "complete",
          created_at: "2025-01-01",
          provider_cost: 99,
          external_id: "secret",
          metadata: {
            amount_xof: 4200,
            provider: "admin_grant",
            customer_name: "private",
            token: "secret",
          },
        },
        {
          id: "normal",
          user_id: "u1",
          kind: "purchase",
          credits: 1,
          operation: "purchase",
          status: "complete",
          created_at: "2025-01-01",
          metadata: {
            amount_xof: "2500",
            provider: "super_secret_provider",
            private: "secret",
          },
        },
        {
          id: "debit",
          user_id: "u1",
          kind: "debit",
          credits: 1,
          operation: "generation",
          model: "m",
          status: "complete",
          created_at: "2025-01-01",
          metadata: { prompt: "private", token: "secret" },
          prompt: "secret",
        },
      ],
    };
    mocks.results.payment_events = {
      data: [
        {
          id: "pay",
          user_id: "u1",
          plan: "pro",
          status: "paid",
          created_at: "2025-01-01",
          transaction_id: "secret",
          metadata: { token: "secret" },
          payload: "private",
        },
      ],
    };
    mocks.results.platform_payouts = {
      data: [
        {
          id: "po",
          amount_xof: 5000,
          status: "completed",
          created_at: "2025-01-01",
          recipient_name: "private person",
          recipient_phone: "secret phone",
          recipient_method: "MOMO",
          metadata: { token: "secret" },
        },
      ],
    };
    const response = await getOverview();
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.admin).toEqual({ role: "super_admin" });
    expect(data.users).toEqual([
      {
        id: "u1",
        email: "e@example.com",
        full_name: "Name",
        created_at: "2025-01-01",
        subscription: { plan: "pro", status: "active" },
      },
    ]);
    expect(
      data.creditPurchases.find((row: any) => row.id === "purchase").metadata,
    ).toEqual({ amount_xof: 4200, provider: "admin_grant" });
    expect(
      data.creditPurchases.find((row: any) => row.id === "normal"),
    ).not.toHaveProperty("metadata");
    expect(
      data.creditTransactions.find((row: any) => row.id === "debit"),
    ).toEqual({
      id: "debit",
      user_id: "u1",
      kind: "debit",
      credits: 1,
      operation: "generation",
      model: "m",
      status: "complete",
      created_at: "2025-01-01",
    });
    expect(data.paymentEvents[0]).toEqual({
      id: "pay",
      user_id: "u1",
      plan: "pro",
      status: "paid",
      created_at: "2025-01-01",
    });
    expect(data.payouts[0]).toEqual({
      id: "po",
      amount_xof: 5000,
      recipient_method: "MOMO",
      status: "completed",
      created_at: "2025-01-01",
    });
    expect(data.audit.map((row: any) => row.id)).toEqual(["p1", "a1"]);
    expect(JSON.stringify(data)).not.toMatch(
      /secret|private|recipient_name|recipient_phone|transaction_id|provider_cost/,
    );
    const selected = (table: string) =>
      String(
        mocks.calls.find(
          (call) => call.table === table && call.method === "select",
        )?.args[0],
      );
    expect(
      mocks.calls
        .filter(
          (call) =>
            call.table === "credit_transactions" && call.method === "select",
        )
        .map((call) => String(call.args[0]))
        .some((select) => select.includes("metadata")),
    ).toBe(true);
    expect(
      mocks.calls
        .filter(
          (call) =>
            call.table === "credit_transactions" && call.method === "select",
        )
        .map((call) => String(call.args[0]))
        .find((select) => select.includes("model")),
    ).not.toContain("metadata");
    expect(selected("payment_events")).not.toContain("transaction_id");
    expect(selected("platform_payouts")).toContain("recipient_method");
    expect(selected("platform_payouts")).not.toMatch(/recipient_name|recipient_phone/);
    expect(selected("profiles")).not.toContain("updated_at");
  });
  it("does not expose raw database error details", async () => {
    mocks.results.profiles = {
      data: [],
      error: { message: "database secret token" },
    };
    const response = await getOverview();
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Console unavailable" });
  });
  it("requires admin authorization before reading data", async () => {
    mocks.requireAdmin.mockResolvedValue({
      admin: null,
      response: Response.json({ error: "forbidden" }, { status: 403 }),
    });
    expect((await getOverview()).status).toBe(403);
    expect((await getPayouts()).status).toBe(403);
    expect(
      (
        await createPayout(
          new Request("http://localhost", { method: "POST", body: "{}" }),
        )
      ).status,
    ).toBe(403);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(mocks.requireAdmin).toHaveBeenCalledWith(["super_admin"]);
  });
  it("omits recipient identity from payout listing", async () => {
    mocks.results.platform_payouts = {
      data: [
        {
          id: "p",
          amount_xof: 4,
          recipient_name: "private name",
          recipient_phone: "private phone",
          recipient_method: "MOMO",
          status: "completed",
          created_at: "date",
          metadata: { token: "secret" },
        },
      ],
    };
    const response = await getPayouts();
    const data = await response.json();
    expect(data.payouts).toEqual([
      {
        id: "p",
        amount_xof: 4,
        recipient_method: "MOMO",
        status: "completed",
        created_at: "date",
      },
    ]);
    expect(JSON.stringify(data)).not.toMatch(/private|secret/);
    expect(
      String(
        mocks.calls.find(
          (entry) =>
            entry.table === "platform_payouts" && entry.method === "select",
        )?.args[0],
      ),
    ).not.toMatch(/recipient_name|recipient_phone/);
  });
  it("returns only payout id, status and amount after mutation", async () => {
    process.env.SASPAY_API_KEY = "test";
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            id: "provider-secret",
            status: "completed",
            payload: "secret",
          }),
          { status: 200 },
        ),
      );
    try {
      const response = await createPayout(
        new Request("http://localhost", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            amount_xof: 2000,
            recipient_name: "N",
            recipient_phone: "123",
            recipient_method: "MOMO",
          }),
        }),
      );
      const data = await response.json();
      expect(response.status).toBe(201);
      expect(data.payout).toEqual({
        id: "payout-id",
        status: "completed",
        amount_xof: 2000,
      });
      expect(JSON.stringify(data)).not.toMatch(
        /provider-secret|123|metadata|recipient/,
      );
    } finally {
      fetchSpy.mockRestore();
      delete process.env.SASPAY_API_KEY;
    }
  });
});
