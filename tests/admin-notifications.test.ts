import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(), createAdminClient: vi.fn(), writeAdminAudit: vi.fn(),
  sendPushToUsers: vi.fn(),
  results: {} as Record<string, any>, calls: [] as Array<{ table: string; method: string; args: unknown[] }>,
}));
vi.mock("@/lib/admin", () => ({ requireAdmin: mocks.requireAdmin, writeAdminAudit: mocks.writeAdminAudit }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));

vi.mock("@/lib/push/server", () => ({ sendPushToUsers: mocks.sendPushToUsers }));
import { GET as getNotifications, POST, DELETE } from "@/app/api/admin/notifications/route";
import { GET as getUsers } from "@/app/api/admin/users/route";

const uuid = "123e4567-e89b-12d3-a456-426614174000";
const broadcastId = "123e4567-e89b-12d3-a456-426614174001";
const validMessage = { audience: "selected", user_ids: [uuid], title: "Hello", message: "World" };

function setupDb() {
  mocks.createAdminClient.mockImplementation(() => ({ from(table: string) {
    const builder: any = {};
    const result = () => mocks.results[table] ?? { data: [], count: 0, error: null };
    for (const method of ["select", "eq", "order", "limit", "range", "or", "in", "insert", "delete", "maybeSingle"]) {
      builder[method] = (...args: unknown[]) => { mocks.calls.push({ table, method, args }); return builder; };
    }
    builder.then = (resolve: any, reject: any) => Promise.resolve(result()).then(resolve, reject);
    return builder;
  } }));
}
const req = (path: string, body?: unknown) => new Request(`http://localhost${path}`, body === undefined ? undefined : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const call = (table: string, method: string) => mocks.calls.filter((c) => c.table === table && c.method === method);

beforeEach(() => {
  vi.clearAllMocks(); mocks.sendPushToUsers.mockResolvedValue({attempted:1,accepted:1,failed:0,expired:0,unsubscribedUsers:0}); mocks.calls.length = 0; mocks.results = {};
  mocks.requireAdmin.mockResolvedValue({ admin: { id: "admin-1" }, supabase: {}, response: null });
  mocks.writeAdminAudit.mockResolvedValue(undefined); setupDb();
});

describe("admin notifications routes", () => {
  it("returns auth 401/403 responses without touching the database", async () => {
    mocks.requireAdmin.mockResolvedValueOnce({ admin: null, response: Response.json({ error: "unauthenticated" }, { status: 401 }) });
    expect((await getNotifications()).status).toBe(401);
    mocks.requireAdmin.mockResolvedValueOnce({ admin: null, response: Response.json({ error: "forbidden" }, { status: 403 }) });
    expect((await getUsers(req("/api/admin/users"))).status).toBe(403);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it("lists only admin notifications and returns users", async () => {
    mocks.results.user_notifications = { data: [{ id: uuid }], error: null };
    expect((await getNotifications()).status).toBe(200);
    expect(call("user_notifications", "eq")).toContainEqual({ table: "user_notifications", method: "eq", args: ["type", "admin"] });
    mocks.results.profiles = { data: [{ id: uuid }], count: 1, error: null };
    expect(await (await getUsers(req("/api/admin/users?q=ana&page=1"))).json()).toMatchObject({ users: [{ id: uuid }], page: 1, total: 1 });
  });

  it.each([{}, { audience: "nobody" }, { ...validMessage, user_ids: ["bad-uuid"] }, { ...validMessage, user_ids: [] }, { ...validMessage, action_url: "https://evil.example" }, { ...validMessage, action_url: "//evil.example" }, { ...validMessage, action_url: "/foo bar" }])("rejects invalid audience, UUID, or external/internal URL input: %o", async (body) => {
    const response = await POST(req("/api/admin/notifications", body));
    expect(response.status).toBe(400); expect(call("user_notifications", "insert")).toHaveLength(0);
  });

  it("validates audience and selected UUIDs then inserts notifications", async () => {
    mocks.results.profiles = { data: [{ id: uuid }], error: null };
    const response = await POST(req("/api/admin/notifications", validMessage));
    expect(response.status).toBe(200);
    expect(call("user_notifications", "insert")[0].args[0]).toMatchObject([{ user_id: uuid, type: "admin", title: "Hello", body: "World" }]);
  });

  it("returns database errors for list, recipient lookup and insertion", async () => {
    mocks.results.user_notifications = { data: null, error: { message: "read failure" } };
    expect((await getNotifications()).status).toBe(500);
    mocks.results.profiles = { data: null, error: { message: "lookup failure" } };
    expect((await POST(req("/api/admin/notifications", validMessage))).status).toBe(500);
    mocks.results.profiles = { data: [{ id: uuid }], error: null };
    mocks.results.user_notifications = { data: null, error: { message: "insert failure" } };
    expect((await POST(req("/api/admin/notifications", validMessage))).status).toBe(500);
  });

  it("requires a valid notification UUID and returns not found", async () => {
    expect((await DELETE(req("/api/admin/notifications", { id: "invalid" }))).status).toBe(400);
    expect(call("user_notifications", "select")).toHaveLength(0);
    mocks.results.user_notifications = { data: null, error: null };
    expect((await DELETE(req("/api/admin/notifications", { id: uuid }))).status).toBe(404);
  });

  it("deletes one admin-type row unless all_recipients and valid broadcast metadata are supplied", async () => {
    mocks.results.user_notifications = { data: { id: uuid, metadata: { broadcast_id: broadcastId } }, error: null, count: 2 };
    expect((await DELETE(req("/api/admin/notifications", { id: uuid, all_recipients: true }))).status).toBe(200);
    expect(call("user_notifications", "eq").slice(-2)).toEqual([
      { table: "user_notifications", method: "eq", args: ["type", "admin"] },
      { table: "user_notifications", method: "eq", args: ["metadata->>broadcast_id", broadcastId] },
    ]);
    mocks.calls.length = 0;
    mocks.results.user_notifications.data.metadata.broadcast_id = "not-a-uuid";
    await DELETE(req("/api/admin/notifications", { id: uuid, all_recipients: true }));
    expect(call("user_notifications", "eq").slice(-2)).toEqual([
      { table: "user_notifications", method: "eq", args: ["type", "admin"] },
      { table: "user_notifications", method: "eq", args: ["id", uuid] },
    ]);
    mocks.calls.length = 0;
    await DELETE(req("/api/admin/notifications", { id: uuid, all_recipients: false }));
    expect(call("user_notifications", "eq").slice(-2)[1].args).toEqual(["id", uuid]);
  });

  it("returns delete lookup and deletion database errors", async () => {
    mocks.results.user_notifications = { data: null, error: { message: "lookup failure" } };
    expect((await DELETE(req("/api/admin/notifications", { id: uuid }))).status).toBe(500);
    mocks.results.user_notifications = { data: { id: uuid, metadata: {} }, error: null };
    mocks.createAdminClient.mockImplementation(() => ({ from(table: string) {
      const b: any = {}; for (const m of ["select", "eq", "order", "limit", "range", "or", "in", "insert", "delete", "maybeSingle"]) b[m] = (...args: unknown[]) => { mocks.calls.push({ table, method: m, args }); return b; };
      b.then = (resolve: any) => Promise.resolve(mocks.calls.some((c) => c.method === "delete") ? { error: { message: "delete failure" } } : mocks.results[table]).then(resolve);
      return b;
    } }));
    expect((await DELETE(req("/api/admin/notifications", { id: uuid }))).status).toBe(500);
  });
});
