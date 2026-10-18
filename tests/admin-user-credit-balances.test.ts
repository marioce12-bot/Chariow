import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  createAdminClient: vi.fn(),
  accountQuery: vi.fn(),
}));
vi.mock("@/lib/admin", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));
import { GET } from "@/app/api/admin/overview/route";

const profiles = [
  { id: "u-zero", email: "a@example.test", full_name: "A", created_at: "2025-01-01", subscriptions: [] },
  { id: "u-missing", email: "b@example.test", full_name: "B", created_at: "2025-01-02", subscriptions: [] },
];
function chain(result: any): any {
  const q: any = {};
  for (const method of ["select", "order", "limit", "eq", "in"]) q[method] = vi.fn(() => q);
  q.then = (resolve: (value: any) => unknown) => Promise.resolve(result).then(resolve);
  return q;
}
function setup(balanceResult: { data: Array<{ user_id: string; balance: number; reserved: number }> | null; error: { code: string; message: string } | null } = { data: [{ user_id: "u-zero", balance: 0, reserved: 0 }], error: null }) {
  const tableClient = { from: vi.fn((table: string) => chain({
    data: table === "profiles" ? profiles : [], count: table === "profiles" ? 2 : 0, error: null,
  })), rpc: vi.fn().mockResolvedValue({ data: {}, error: null }) };
  mocks.requireAdmin.mockResolvedValue({ admin: { role: "super_admin" }, response: null, supabase: tableClient });
  mocks.accountQuery.mockReturnValue(chain(balanceResult));
  mocks.createAdminClient.mockReturnValue({
    from: vi.fn((table: string) => table === "credit_accounts" ? mocks.accountQuery() : chain({ data: [], error: null })),
    rpc: vi.fn().mockResolvedValue({ data: {}, error: null }),
  });
  return tableClient;
}
beforeEach(() => vi.clearAllMocks());

describe("admin overview Studio credit balances", () => {
  it("requires admin and performs no privileged balance read for unauthorized callers", async () => {
    mocks.requireAdmin.mockResolvedValue({ admin: null, response: new Response("denied", { status: 403 }) });
    const response = await GET();
    expect(response.status).toBe(403);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it("reads only account user_id, balance and reserved for listed users; preserves zero and omits absent accounts", async () => {
    setup();
    const response = await GET();
    const json = await response.json();
    expect(mocks.accountQuery).toHaveBeenCalledTimes(1);
    const query = mocks.accountQuery.mock.results[0].value;
    expect(query.select).toHaveBeenCalledWith("user_id,balance,reserved");
    expect(query.in).toHaveBeenCalledWith("user_id", ["u-zero", "u-missing"]);
    expect(json.users[0].credit_balance).toBe(0);
    expect(Object.hasOwn(json.users[1], "credit_balance")).toBe(false);
    expect(json.users.map((user: any) => Object.keys(user))).toEqual([
      ["id", "email", "full_name", "created_at", "credit_balance"],
      ["id", "email", "full_name", "created_at"],
    ]);
  });

  it("subtracts credits reserved by pending generations, and withholds inconsistent accounts", async () => {
    setup({ data: [{ user_id: "u-zero", balance: 500, reserved: 125 }, { user_id: "u-missing", balance: 50, reserved: 60 }], error: null });
    const json = await (await GET()).json();
    expect(json.users[0].credit_balance).toBe(375);
    expect(json.users[0]).not.toHaveProperty("reserved");
    expect(json.users[0]).not.toHaveProperty("balance");
    expect(json.users[1]).not.toHaveProperty("credit_balance");
  });

  it("omits balances when the account query is inaccessible rather than reporting zero", async () => {
    setup({ data: null, error: { code: "42501", message: "denied" } });
    const response = await GET();
    const json = await response.json();
    expect(json.users.every((user: any) => !Object.hasOwn(user, "credit_balance"))).toBe(true);
  });
});
