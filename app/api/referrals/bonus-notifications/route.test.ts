import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  requireUser: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: mocks.from }) }));

const filters: Array<[string, unknown]> = [];
const transactions = [{ id: "bonus-transaction-1", credits: 150, created_at: "2026-11-07T10:00:00.000Z" }];

function makeQuery(error: { message: string; code?: string } | null = null) {
  const query: Record<string, any> = {};
  query.select = vi.fn(() => query);
  query.eq = vi.fn((column: string, value: unknown) => { filters.push([column, value]); return query; });
  query.order = vi.fn(() => query);
  query.limit = vi.fn(async () => ({ data: error ? null : transactions, error }));
  return query;
}

beforeEach(() => {
  filters.length = 0;
  mocks.from.mockClear();
  mocks.requireUser.mockResolvedValue({ user: { id: "referrer-user" }, response: null });
  mocks.from.mockImplementation(() => makeQuery());
});

describe("GET /api/referrals/bonus-notifications", () => {
  it("returns only completed 150-credit referral bonuses for the signed-in referrer", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({
      transactions: [{ id: "bonus-transaction-1", credits: 150, createdAt: "2026-11-07T10:00:00.000Z" }],
    });
    expect(mocks.from).toHaveBeenCalledWith("credit_transactions");
    expect(filters).toEqual(expect.arrayContaining([
      ["user_id", "referrer-user"],
      ["operation", "referral_signup_bonus"],
      ["status", "completed"],
      ["credits", 150],
    ]));
  });

  it("does not query rewards when no authenticated user is available", async () => {
    const authResponse = new Response(null, { status: 401 });
    mocks.requireUser.mockResolvedValue({ user: null, response: authResponse });
    const response = await GET();
    expect(response).toBe(authResponse);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("does not claim a reward when the confirmation ledger query fails", async () => {
    mocks.from.mockImplementation(() => makeQuery({ message: "database unavailable", code: "DB_DOWN" }));
    const response = await GET();
    expect(response.status).toBe(500);
    expect((await response.json()).transactions).toBeUndefined();
  });
});
