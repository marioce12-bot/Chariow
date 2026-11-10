import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  createAdminClient: vi.fn(),
  from: vi.fn(),
  activeFilterSeen: false,
}));

vi.mock("@/lib/admin", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));

import { GET } from "./route";

const USER_A = "22222222-2222-4222-8222-222222222222";
const USER_B = "33333333-3333-4333-8333-333333333333";

function makeQuery(table: string) {
  const filters: Record<string, unknown> = {};
  const chain: any = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn((column: string, value: unknown) => {
    filters[column] = value;
    if (column === "status" && value === "active") mocks.activeFilterSeen = true;
    return chain;
  });
  chain.not = vi.fn(() => chain);
  chain.range = vi.fn(() => chain);
  chain.in = vi.fn(() => chain);
  chain.then = (resolve: (value: unknown) => unknown, reject: (cause: unknown) => unknown) => {
    let data: any[] = [];
    if (table === "ad_campaigns") {
      const campaigns = [
        { user_id: USER_A, status: "active" },
        { user_id: USER_A, status: "active" },
        { user_id: USER_B, status: "active" },
        { user_id: USER_A, status: "completed" },
        { user_id: USER_B, status: "draft" },
      ];
      data = campaigns.filter((row) => row.status === filters.status).map(({ user_id }) => ({ user_id }));
    }
    if (table === "profiles") {
      data = [
        { id: USER_A, email: "a@example.test", full_name: "Account A" },
        { id: USER_B, email: "b@example.test", full_name: "Account B" },
      ];
    }
    return Promise.resolve({ data, error: null }).then(resolve, reject);
  };
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.activeFilterSeen = false;
  mocks.requireAdmin.mockResolvedValue({ admin: { id: "admin", role: "super_admin" }, response: null });
  mocks.createAdminClient.mockReturnValue({ from: mocks.from });
  mocks.from.mockImplementation((table: string) => makeQuery(table));
});

describe("GET /api/admin/campaigns/active-accounts", () => {
  it("requires an authorized admin before using the service client", async () => {
    const { NextResponse } = await import("next/server");
    mocks.requireAdmin.mockResolvedValue({ admin: null, response: NextResponse.json({ error: "denied" }, { status: 403 }) });
    const response = await GET();
    expect(response.status).toBe(403);
    expect(mocks.requireAdmin).toHaveBeenCalledWith(["super_admin", "support"]);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it("counts only exact active campaigns and groups the exact total by account", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(mocks.activeFilterSeen).toBe(true);
    expect(payload.total).toBe(2);
    expect(payload.accounts).toEqual([
      { id: USER_A, email: "a@example.test", full_name: "Account A", active_campaigns_count: 2 },
      { id: USER_B, email: "b@example.test", full_name: "Account B", active_campaigns_count: 1 },
    ]);
    expect(JSON.stringify(payload)).not.toContain("completed");
    expect(JSON.stringify(payload)).not.toContain("draft");
  });
});
