import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  createAdminClient: vi.fn(),
  encryptSubscription: vi.fn(),
  endpointHash: vi.fn(),
  getVapidKeys: vi.fn(),
  validatePushEndpoint: vi.fn((value: unknown) => {
    if (typeof value !== "string" || !value.startsWith("https://")) throw new Error("Invalid endpoint");
    return value;
  }),
  validateSubscription: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  maybeSingle: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  eq: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock("@/lib/push/server", () => ({
  endpointHash: mocks.endpointHash,
  encryptSubscription: mocks.encryptSubscription,
  getVapidKeys: mocks.getVapidKeys,
  validatePushEndpoint: mocks.validatePushEndpoint,
  validateSubscription: mocks.validateSubscription,
}));

import { DELETE, GET, POST } from "@/app/api/push/subscription/route";

const user = { id: "user-123" };
const endpoint = "https://fcm.googleapis.com/fcm/send/test-subscription";
const keys = { p256dh: "valid-p256dh", auth: "valid-auth" };
const parsedSubscription = { endpoint, keys };

function request(method: string, body?: unknown, origin = "http://localhost") {
  return new NextRequest("http://localhost/api/push/subscription", {
    method,
    headers: { origin, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ user, response: Response.json({ error: "Unauthorized" }, { status: 401 }) });
  mocks.endpointHash.mockReturnValue("hashed-endpoint");
  mocks.encryptSubscription.mockReturnValue("encrypted-subscription");
  mocks.validatePushEndpoint.mockImplementation((value: unknown) => {
    if (typeof value !== "string" || !value.startsWith("https://")) throw new Error("Invalid endpoint");
    return value;
  });
  mocks.validateSubscription.mockImplementation((value: any) => {
    if (!value || value.endpoint !== endpoint || !value.keys) throw new Error("Invalid subscription");
    return parsedSubscription;
  });
  mocks.eq.mockReturnThis();
  mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
  mocks.insert.mockResolvedValue({ error: null });
  mocks.update.mockResolvedValue({ error: null });
  mocks.delete.mockResolvedValue({ error: null });
  mocks.delete.mockReturnValue({ eq: mocks.eq });
  mocks.select.mockReturnValue({ eq: mocks.eq, maybeSingle: mocks.maybeSingle });
  mocks.from.mockReturnValue({
    select: mocks.select,
    insert: mocks.insert,
    update: mocks.update,
    delete: mocks.delete,
  });
  mocks.createAdminClient.mockReturnValue({ from: mocks.from });
});

describe("/api/push/subscription", () => {
  it.each([
    ["GET", () => GET()],
    ["POST", () => POST(request("POST", { endpoint, keys }))],
    ["DELETE", () => DELETE(request("DELETE", { endpoint }))],
  ])("requires authentication for %s", async (_method, invoke) => {
    mocks.requireUser.mockResolvedValue({ user: null, response: Response.json({ error: "Unauthorized" }, { status: 401 }) });
    expect((await invoke()).status).toBe(401);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it("rejects an external Origin on POST and DELETE", async () => {
    expect((await POST(request("POST", { endpoint, keys }, "https://attacker.example"))).status).toBe(403);
    expect((await DELETE(request("DELETE", { endpoint }, "https://attacker.example"))).status).toBe(403);
    expect(mocks.requireUser).not.toHaveBeenCalled();
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it("returns VAPID keys for an authenticated GET", async () => {
    mocks.getVapidKeys.mockResolvedValue({ publicKey: "public-vapid-key" });
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ publicKey: "public-vapid-key" });
    expect(mocks.getVapidKeys).toHaveBeenCalledOnce();
  });

  it("stores a valid browser subscription under the authenticated user's id", async () => {
    const response = await POST(request("POST", { endpoint, keys }));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ saved: true });
    expect(mocks.validateSubscription).toHaveBeenCalledWith({ endpoint, keys });
    expect(mocks.encryptSubscription).toHaveBeenCalledWith(keys);
    expect(mocks.from).toHaveBeenCalledWith("web_push_subscriptions");
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({
      user_id: user.id,
      endpoint_hash: "hashed-endpoint",
      endpoint,
      subscription_encrypted: "encrypted-subscription",
      last_seen_at: expect.any(String),
    }));
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("returns 409 without updating when the endpoint belongs to another user", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { id: "existing-row", user_id: "other-user" }, error: null });
    const response = await POST(request("POST", { endpoint, keys }));
    expect(response.status).toBe(409);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("deletes using only the endpoint supplied by browser.ts, scoped by hash and user", async () => {
    const response = await DELETE(request("DELETE", { endpoint }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ removed: true });
    expect(mocks.validatePushEndpoint).toHaveBeenCalledWith(endpoint);
    expect(mocks.delete).toHaveBeenCalledOnce();
    expect(mocks.eq).toHaveBeenNthCalledWith(1, "endpoint_hash", "hashed-endpoint");
    expect(mocks.eq).toHaveBeenNthCalledWith(2, "user_id", user.id);
  });

  it("rejects a private/unsupported endpoint with 400", async () => {
    mocks.validatePushEndpoint.mockImplementation(() => { throw new Error("Unsupported push endpoint"); });
    const response = await DELETE(request("DELETE", { endpoint: "https://127.0.0.1/private" }));
    expect(response.status).toBe(400);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });
});
