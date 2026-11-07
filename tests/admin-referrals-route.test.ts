import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  createAdminClient: vi.fn(),
}));
vi.mock("@/lib/admin", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));

import { GET } from "@/app/api/admin/referrals/route";

type Referral = {
  referrer_user_id: string;
  referred_user_id: string;
  created_at: string;
};
type Profile = { id: string; email: string | null; full_name: string | null };

function createDatabase({
  referrals = [],
  profiles = [],
  referralError = null,
}: {
  referrals?: Referral[];
  profiles?: Profile[];
  referralError?: Error | null;
} = {}) {
  const ranges: Array<[number, number]> = [];
  const profileBatches: string[][] = [];
  const selected: Array<[string, unknown]> = [];
  const from = vi.fn((table: string) => {
    if (table === "referrals") {
      const builder = {
        select: vi.fn((columns: string, options?: unknown) => {
          selected.push([columns, options]);
          return builder;
        }),
        order: vi.fn(() => builder),
        range: vi.fn(async (start: number, end: number) => {
          ranges.push([start, end]);
          return {
            data: referralError ? null : referrals.slice(start, end + 1),
            count: referrals.length,
            error: referralError,
          };
        }),
      };
      return builder;
    }

    if (table === "profiles") {
      const builder = {
        select: vi.fn((columns: string) => {
          selected.push([columns, undefined]);
          return builder;
        }),
        in: vi.fn(async (_column: string, ids: string[]) => {
          profileBatches.push(ids);
          return {
            data: profiles.filter((profile) => ids.includes(profile.id)),
            error: null,
          };
        }),
      };
      return builder;
    }

    throw new Error(`Unexpected table read: ${table}`);
  });

  return {
    database: { from },
    from,
    ranges,
    profileBatches,
    selected,
  };
}

beforeEach(() => vi.clearAllMocks());

describe("admin referrals route", () => {
  it("authorizes before creating the service client or reading referral data", async () => {
    mocks.requireAdmin.mockResolvedValue({
      admin: null,
      response: Response.json({ error: "denied" }, { status: 401 }),
    });

    const response = await GET();

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it("returns existing referral relationships grouped by referrer with private no-store headers", async () => {
    mocks.requireAdmin.mockResolvedValue({ admin: { role: "super_admin" } });
    const database = createDatabase({
      referrals: [
        {
          referrer_user_id: "referrer-a",
          referred_user_id: "referred-1",
          created_at: "2026-11-07T10:00:00.000Z",
        },
        {
          referrer_user_id: "referrer-a",
          referred_user_id: "referred-2",
          created_at: "2026-11-06T10:00:00.000Z",
        },
        {
          referrer_user_id: "referrer-b",
          referred_user_id: "referred-3",
          created_at: "2026-11-05T10:00:00.000Z",
        },
      ],
      profiles: [
        { id: "referrer-a", email: "alice@example.test", full_name: "Alice" },
        { id: "referred-1", email: "one@example.test", full_name: "First" },
        { id: "referred-2", email: "two@example.test", full_name: null },
        { id: "referred-3", email: null, full_name: "Third" },
      ],
    });
    mocks.createAdminClient.mockReturnValue(database.database);

    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(payload.totalReferred).toBe(3);
    expect(payload.referrerCount).toBe(2);
    expect(payload.referrers).toEqual([
      {
        userId: "referrer-a",
        email: "alice@example.test",
        fullName: "Alice",
        referralCount: 2,
        referredAccounts: [
          {
            userId: "referred-1",
            email: "one@example.test",
            fullName: "First",
          },
          {
            userId: "referred-2",
            email: "two@example.test",
            fullName: null,
          },
        ],
      },
      {
        userId: "referrer-b",
        email: null,
        fullName: null,
        referralCount: 1,
        referredAccounts: [
          { userId: "referred-3", email: null, fullName: "Third" },
        ],
      },
    ]);
    expect(database.from.mock.calls.map(([table]) => table)).toEqual([
      "referrals",
      "profiles",
    ]);
    expect(database.selected).toContainEqual([
      "referrer_user_id,referred_user_id,created_at",
      { count: "exact" },
    ]);
    expect(database.selected).toContainEqual(["id,email,full_name", undefined]);
  });

  it("paginates referral rows and profile reads instead of truncating long lists", async () => {
    mocks.requireAdmin.mockResolvedValue({ admin: { role: "super_admin" } });
    const referrals = Array.from({ length: 501 }, (_, index) => ({
      referrer_user_id: "referrer",
      referred_user_id: `referred-${index}`,
      created_at: new Date(Date.UTC(2026, 10, 7, 10, 0, index)).toISOString(),
    }));
    const profiles = [
      { id: "referrer", email: "owner@example.test", full_name: "Owner" },
      ...referrals.map((row) => ({
        id: row.referred_user_id,
        email: `${row.referred_user_id}@example.test`,
        full_name: null,
      })),
    ];
    const database = createDatabase({ referrals, profiles });
    mocks.createAdminClient.mockReturnValue(database.database);

    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.totalReferred).toBe(501);
    expect(payload.referrers[0].referralCount).toBe(501);
    expect(payload.referrers[0].referredAccounts).toHaveLength(501);
    expect(database.ranges).toEqual([
      [0, 499],
      [500, 999],
    ]);
    expect(database.profileBatches.map((batch) => batch.length)).toEqual([
      250,
      250,
      2,
    ]);
  });

  it("returns a generic unavailable response without exposing database errors", async () => {
    mocks.requireAdmin.mockResolvedValue({ admin: { role: "super_admin" } });
    const database = createDatabase({ referralError: new Error("private database details") });
    mocks.createAdminClient.mockReturnValue(database.database);
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await GET();
    const body = await response.text();

    expect(response.status).toBe(503);
    expect(body).not.toContain("private database details");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    log.mockRestore();
  });
});
