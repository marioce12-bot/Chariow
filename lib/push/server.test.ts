import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ config: null as any, subscriptions: [] as any[], deletes: [] as any[] }));
const push = vi.hoisted(() => ({ sendNotification: vi.fn(), setVapidDetails: vi.fn(), generateVAPIDKeys: vi.fn(() => ({ publicKey: "public", privateKey: "private" })) }));
vi.mock("web-push", () => ({ default: push }));
vi.mock("@/lib/crypto", () => ({ encryptSecret: (v: string) => `enc:${v}`, decryptSecret: (v: string) => v.startsWith("enc:") ? v.slice(4) : "{}" }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: (table: string) => ({ select: () => ({ eq: (_k: string, _v: unknown) => ({ maybeSingle: async () => ({ data: table === "web_push_config" ? db.config : null, error: null }) }), in: (_key: string, ids: string[]) => ({ range: async (start: number, end: number) => ({ data: db.subscriptions.filter(r => ids.includes(r.user_id)).slice(start, end + 1), error: null }) }) }), insert: (values: any) => ({ select: () => ({ maybeSingle: async () => { if (table === "web_push_config") db.config = values; else db.subscriptions.push({ id: `id-${db.subscriptions.length}`, ...values }); return { data: values, error: null }; } }) }), delete: () => ({ eq: (key: string, val: unknown) => ({ eq: async (key2: string, val2: unknown) => { db.deletes.push([key, val, key2, val2]); return { error: null }; } }) }) }) }) }));

import { decryptSubscription, encryptSubscription, sendPushToUsers, validatePushEndpoint, validatePushKeys, validateSubscription } from "./server";

const keys = { p256dh: Buffer.alloc(65, 3).toString("base64url"), auth: Buffer.alloc(16, 4).toString("base64url") };

describe("web push validation", () => {
  it("accepts public supported push service HTTPS URLs", () => {
    expect(validatePushEndpoint("https://fcm.googleapis.com/fcm/send/abc")).toContain("https://fcm.googleapis.com/");
    expect(validatePushEndpoint("https://abc.notify.windows.com/wpush/v2/a")).toContain("notify.windows.com");
  });
  it.each(["http://fcm.googleapis.com/a", "https://fcm.googleapis.com.evil.test/a", "https://user@fcm.googleapis.com/a", "https://localhost/a", "https://updates.push.services.mozilla.com:443/a", "https://127.0.0.1/a"]) ("rejects unsafe endpoint %s", value => expect(() => validatePushEndpoint(value)).toThrow());
  it("checks exact key byte lengths and subscription structure", () => {
    expect(validatePushKeys(keys)).toEqual(keys);
    expect(() => validatePushKeys({ ...keys, auth: "bad" })).toThrow();
    expect(validateSubscription({ endpoint: "https://web.push.apple.com/a", keys })).toEqual({ endpoint: "https://web.push.apple.com/a", keys });
  });
});

describe("sendPushToUsers", () => {
  beforeEach(() => { db.config = { public_key: "public", private_key_encrypted: "enc:private" }; db.subscriptions = []; db.deletes = []; push.sendNotification.mockReset(); });
  it("reports accepted and unsubscribed distinctly; never calls a real push service", async () => {
    const sub = { p256dh: keys.p256dh, auth: keys.auth };
    db.subscriptions = [{ id: "s1", user_id: "u1", endpoint: "https://fcm.googleapis.com/e", subscription_encrypted: `enc:${JSON.stringify(sub)}` }];
    push.sendNotification.mockResolvedValue({ statusCode: 201 });
    const stats = await sendPushToUsers(["u1", "u2"], { title: "Hi", body: "Body" });
    expect(stats).toEqual({ attempted: 1, accepted: 1, failed: 0, expired: 0, unsubscribedUsers: 1 });
    expect(push.sendNotification).toHaveBeenCalledTimes(1);
    expect(push.sendNotification.mock.calls[0][0]).toEqual({endpoint:"https://fcm.googleapis.com/e", keys});
    expect(push.sendNotification.mock.calls[0][2]).toMatchObject({ TTL: 3600, urgency: "normal" });
  });
  it("counts ordinary failure and removes an expired endpoint", async () => {
    const serialized = `enc:${JSON.stringify({ p256dh: keys.p256dh, auth: keys.auth })}`;
    db.subscriptions = [{ id: "expired", user_id: "u1", endpoint: "https://fcm.googleapis.com/a", subscription_encrypted: serialized }, { id: "failed", user_id: "u2", endpoint: "https://fcm.googleapis.com/b", subscription_encrypted: serialized }];
    push.sendNotification.mockRejectedValueOnce({ statusCode: 410 }).mockRejectedValueOnce({ statusCode: 503 });
    const stats = await sendPushToUsers(["u1", "u2"], { title: "Hi", body: "Body" });
    expect(stats).toEqual({ attempted: 2, accepted: 0, failed: 1, expired: 1, unsubscribedUsers: 0 });
    expect(db.deletes).toContainEqual(["id", "expired", "user_id", "u1"]);
  });
});
