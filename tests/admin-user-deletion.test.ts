import { beforeEach, describe, expect, it, vi } from "vitest";

const USER_ID = "123e4567-e89b-42d3-a456-426614174000";
const ACTOR_ID = "223e4567-e89b-42d3-a456-426614174000";
const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  createAdminClient: vi.fn(),
  writeAdminAudit: vi.fn(),
  profileResult: { data: null as any, error: null as any },
  adminResult: { data: null as any, error: null as any },
  deleteError: null as any,
  calls: [] as Array<{ table: string; method: string; args: unknown[] }>,
  deleteUser: vi.fn(),
}));

vi.mock("@/lib/admin", () => ({
  requireAdmin: mocks.requireAdmin,
  writeAdminAudit: mocks.writeAdminAudit,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));

import { DELETE } from "@/app/api/admin/users/[id]/route";

function makeBuilder(table: string) {
  const builder: any = {};
  for (const method of ["select", "eq"]) {
    builder[method] = (...args: unknown[]) => {
      mocks.calls.push({ table, method, args });
      return builder;
    };
  }
  builder.maybeSingle = () => {
    mocks.calls.push({ table, method: "maybeSingle", args: [] });
    return Promise.resolve(table === "profiles" ? mocks.profileResult : mocks.adminResult);
  };
  return builder;
}

function request(body: unknown) {
  return new Request(`http://localhost/api/admin/users/${USER_ID}`, {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function call(body: unknown = { confirmation: "target@example.test" }) {
  return DELETE(request(body), { params: Promise.resolve({ id: USER_ID }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.calls.length = 0;
  mocks.profileResult = {
    data: { id: USER_ID, email: "target@example.test" },
    error: null,
  };
  mocks.adminResult = { data: null, error: null };
  mocks.deleteError = null;
  mocks.deleteUser.mockImplementation(async () => ({ error: mocks.deleteError }));
  mocks.createAdminClient.mockImplementation(() => ({
    from: (table: string) => makeBuilder(table),
    auth: { admin: { deleteUser: mocks.deleteUser } },
  }));
  mocks.requireAdmin.mockResolvedValue({
    admin: { id: "admin-row-id", role: "super_admin" },
    user: { id: ACTOR_ID },
    supabase: { session: "current-admin" },
    response: null,
  });
});

describe("DELETE /api/admin/users/[id]", () => {
  it("deletes a non-admin account only after the exact email is confirmed and audits it", async () => {
    const response = await call();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ deleted: true, user_id: USER_ID });
    expect(mocks.requireAdmin).toHaveBeenCalledWith(["super_admin"]);
    expect(mocks.deleteUser).toHaveBeenCalledWith(USER_ID);
    expect(mocks.writeAdminAudit).toHaveBeenCalledWith(
      { session: "current-admin" },
      "admin-row-id",
      "user_account_deleted",
      "profile",
      USER_ID,
    );
  });

  it("rejects a mismatched confirmation without deleting the account", async () => {
    const response = await call({ confirmation: "someone-else@example.test" });
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("confirmation_mismatch");
    expect(mocks.deleteUser).not.toHaveBeenCalled();
  });

  it("protects every administrator account", async () => {
    mocks.adminResult = { data: { user_id: USER_ID }, error: null };
    const response = await call();
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("admin_account_protected");
    expect(mocks.deleteUser).not.toHaveBeenCalled();
  });

  it("prevents an administrator from deleting their own account", async () => {
    mocks.requireAdmin.mockResolvedValue({
      admin: { id: "admin-row-id", role: "super_admin" },
      user: { id: USER_ID },
      supabase: {},
      response: null,
    });
    const response = await call();
    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe("self_delete_forbidden");
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it("requires a named super-admin session and fails closed when a related row blocks deletion", async () => {
    mocks.deleteError = { code: "23503" };
    const response = await call();
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("dependency_conflict");
    expect(mocks.writeAdminAudit).not.toHaveBeenCalled();
  });

  it("returns the authorization response without using the service-role client", async () => {
    mocks.requireAdmin.mockResolvedValue({
      admin: null,
      user: null,
      supabase: {},
      response: Response.json({ error: "forbidden" }, { status: 403 }),
    });
    const response = await call();
    expect(response.status).toBe(403);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });
});
