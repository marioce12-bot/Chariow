import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  rpc: vi.fn(),
  sendEmail: vi.fn(),
  suppression: vi.fn(),
  from: vi.fn(),
}));

vi.mock("@/lib/admin", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: mocks.from, rpc: mocks.rpc }) }));
vi.mock("@/lib/transactional-credit-offer", () => ({
  isValidOfferEmail: (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()),
  normalizeSuppressionEmail: (email: string) => email.trim().toLowerCase(),
  readTransactionalSuppressionList: mocks.suppression,
  sendCreditOfferConfirmation: mocks.sendEmail,
}));

import { GET, POST } from "./route";

const confirmation = "CONFIRM_VENDEO_NOVEMBER_CREDIT_OFFER";
let profiles: Array<{ id: string; email: string; created_at: string }>;
let subscriptions: Array<{ user_id: string; status: string; trial_active: boolean; trial_ends_at: string | null; current_period_end: string | null }>;
let dispatches: any[];
let rpcCalls: Array<{ userId: string; amount: number }>;
let upserts: any[][];
let updates: Array<{ values: any; filters: Record<string, unknown> }>;

function mockService() {
  mocks.from.mockImplementation((table: string) => {
    let mode: "read" | "upsert" | "update" = "read";
    let values: any;
    const filters: Record<string, unknown> = {};
    const ordering: Array<{ key: string; ascending: boolean }> = [];
    let start = 0;
    let end = Number.MAX_SAFE_INTEGER;
    const query: any = {};
    for (const method of ["select", "order", "range"]) {
      query[method] = vi.fn((...args: any[]) => {
        if (method === "range") [start, end] = args;
        if (method === "order") ordering.push({ key: args[0], ascending: args[1]?.ascending !== false });
        return query;
      });
    }
    query.eq = vi.fn((key: string, value: unknown) => { filters[key] = value; return query; });
    query.is = vi.fn((key: string, value: unknown) => { filters[key] = value; return query; });
    query.upsert = vi.fn((rows: any[]) => { mode = "upsert"; values = rows; return query; });
    query.update = vi.fn((row: any) => { mode = "update"; values = row; updates.push({ values: row, filters }); return query; });
    query.maybeSingle = vi.fn(async () => {
      const row = dispatches.find((item) => Object.entries(filters).every(([key, value]) => item[key] === value));
      if (row && values) Object.assign(row, values);
      return { data: row ? { user_id: row.user_id } : null, error: null };
    });
    query.then = (resolve: (value: unknown) => unknown, reject?: (error: unknown) => unknown) => {
      try {
        if (mode === "upsert") {
          upserts.push(values);
          for (const item of values) if (!dispatches.some((d) => d.user_id === item.user_id)) dispatches.push({ ...item, credit_status: "pending", email_status: "pending", email_attempted_at: null });
          return Promise.resolve({ error: null }).then(resolve, reject);
        }
        if (mode === "update") {
          for (const item of dispatches) if (Object.entries(filters).every(([key, value]) => item[key] === value)) Object.assign(item, values);
          return Promise.resolve({ error: null }).then(resolve, reject);
        }
        const rows = table === "profiles" ? profiles.slice() : table === "subscriptions" ? subscriptions.slice() : dispatches.filter((item) => !filters.campaign_id || item.campaign_id === filters.campaign_id);
        rows.sort((left: any, right: any) => {
          for (const order of ordering) {
            const comparison = String(left[order.key] ?? "").localeCompare(String(right[order.key] ?? ""));
            if (comparison) return order.ascending ? comparison : -comparison;
          }
          return 0;
        });
        return Promise.resolve({ data: rows.slice(start, end + 1), error: null }).then(resolve, reject);
      } catch (error) { return Promise.reject(error).then(resolve, reject); }
    };
    return query;
  });
  mocks.rpc.mockImplementation(async (_name: string, args: any) => {
    rpcCalls.push({ userId: args.target_user_id, amount: args.amount });
    return { data: { ok: true }, error: null };
  });
}

function request(expectedEligibleCount: number, expectedBatchCount: number) {
  return new Request("http://localhost/api/admin/credits/offer", {
    method: "POST",
    body: JSON.stringify({ action: "credits", batch: "first", confirmation, expectedEligibleCount, expectedBatchCount }),
  });
}

function setup(count: number) {
  profiles = Array.from({ length: count }, (_, index) => ({
    id: `user-${String(index).padStart(3, "0")}`,
    email: `user${index}@example.test`,
    // Equal timestamps exercise the deterministic id tiebreaker.
    created_at: `2026-01-${String(Math.floor(index / 20) + 1).padStart(2, "0")}T00:00:00.000Z`,
  })).reverse();
  subscriptions = [];
  dispatches = [];
  rpcCalls = [];
  upserts = [];
  updates = [];
  mocks.requireAdmin.mockResolvedValue({ admin: { id: "admin" }, response: null });
  mocks.suppression.mockResolvedValue({ ok: true, blockedEmails: new Set(), count: 0 });
  mocks.sendEmail.mockResolvedValue({ status: "accepted", messageId: "mock-message" });
  mockService();
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Network forbidden in route test"); }));
});

describe("POST /api/admin/credits/offer", () => {
  it("exclut les abonnements actifs et essais ambigus avant le choix déterministe des 200", async () => {
    setup(202);
    subscriptions = [
      { user_id: "user-000", status: "active", trial_active: false, trial_ends_at: "2020-01-01T00:00:00Z", current_period_end: "2099-01-01" },
      { user_id: "user-001", status: "past_due", trial_active: false, trial_ends_at: "2020-01-01T00:00:00Z", current_period_end: "2020-01-01" },
    ];
    const preview = await GET();
    expect((await preview.json()).counts).toMatchObject({ eligible_accounts: 200, paid_or_ambiguous_accounts_excluded: 2 });
    const response = await POST(request(200, 200));
    expect(response.status).toBe(200);
    expect(upserts[0]).toHaveLength(200);
    expect(upserts[0].some((row) => ["user-000", "user-001"].includes(row.user_id))).toBe(false);
    expect(upserts[0][0].user_id).toBe("user-002");
  });

  it("refuse toute mutation si les exclusions ramènent l’audience sous 200", async () => {
    setup(200);
    subscriptions = [{ user_id: "user-000", status: "active", trial_active: false, trial_ends_at: null, current_period_end: "2099-01-01" }];
    const response = await POST(request(199, 199));
    expect(response.status).toBe(409);
    expect(upserts).toHaveLength(0);
    expect(rpcCalls).toHaveLength(0);
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("refuse le premier lot si moins de 200 comptes sont admissibles, sans écriture ni RPC ni email", async () => {
    setup(199);
    const response = await POST(request(199, 199));
    expect(response.status).toBe(409);
    expect(upserts).toHaveLength(0);
    expect(rpcCalls).toHaveLength(0);
    expect(updates).toHaveLength(0);
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("fige les 200 premiers par created_at puis id et ne traite que trois destinataires", async () => {
    setup(205);
    const response = await POST(request(205, 200));
    expect(response.status).toBe(200);
    expect(upserts).toHaveLength(1);
    expect(upserts[0]).toHaveLength(200);
    expect(upserts[0].map((row) => row.user_id)).toEqual(profiles.slice().sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)).slice(0, 200).map((row) => row.id));
    expect((await response.json()).processed_this_invocation).toBe(3);
    expect(rpcCalls).toHaveLength(3);
    expect(rpcCalls.every((call) => call.amount === 100)).toBe(true);
    expect(mocks.sendEmail).toHaveBeenCalledTimes(3);
  });

  it("n’attribue pas les crédits et n’envoie pas si le RPC échoue", async () => {
    setup(200);
    mocks.rpc.mockImplementation(async (_name: string, args: any) => {
      rpcCalls.push({ userId: args.target_user_id, amount: args.amount });
      return { data: null, error: { code: "grant_failed" } };
    });
    const response = await POST(request(200, 200));
    expect(response.status).toBe(200);
    expect(rpcCalls).toHaveLength(3);
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(dispatches.filter((row) => row.credit_status === "granted")).toHaveLength(0);
    expect(dispatches.filter((row) => row.credit_status === "failed")).toHaveLength(3);
  });

  it("ne renvoie pas un email incertain pendant la reprise du lot suivant", async () => {
    setup(200);
    mocks.sendEmail.mockResolvedValue({ status: "unknown", code: "network_unknown" });

    const firstResponse = await POST(request(200, 200));
    expect(firstResponse.status).toBe(200);
    expect((await firstResponse.json()).processed_this_invocation).toBe(3);
    const firstRecipients = mocks.sendEmail.mock.calls.map(([email]) => email);
    expect(firstRecipients).toHaveLength(3);
    expect(dispatches.filter((row) => row.email_status === "unknown" && row.email_attempted_at !== null)).toHaveLength(3);

    const secondResponse = await POST(request(200, 200));
    expect(secondResponse.status).toBe(200);
    expect((await secondResponse.json()).processed_this_invocation).toBe(3);
    const allRecipients = mocks.sendEmail.mock.calls.map(([email]) => email);
    expect(allRecipients).toHaveLength(6);
    expect(new Set(allRecipients).size).toBe(6);
    expect(allRecipients.slice(0, 3)).toEqual(firstRecipients);
    expect(rpcCalls).toHaveLength(6);
  });

});
