import crypto from "node:crypto";
import webpush from "web-push";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import { createAdminClient } from "@/lib/supabase/admin";

const CONFIG_ID = 1;
const PAGE_SIZE = 500;
const MAX_RECIPIENTS = 5000;
const SEND_DEADLINE_MS = 35_000;
const SEND_TIMEOUT_MS = 5_000;
const ALLOWED_HOSTS = ["fcm.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com"];
const WINDOWS_HOST = ".notify.windows.com";

export type PushPayload = { title: string; body: string; url?: string; tag?: string };
export type PushStats = { attempted: number; accepted: number; failed: number; expired: number; unsubscribedUsers: number };
export type VapidKeys = { publicKey: string; privateKey: string };

export function validatePushEndpoint(raw: unknown): string {
  if (typeof raw !== "string" || raw.length > 2048) throw new Error("Invalid endpoint");
  if (/^https:\/\/[^/]+:443(?:\/|$)/i.test(raw)) throw new Error("Unsupported push endpoint");
  let u: URL;
  try { u = new URL(raw); } catch { throw new Error("Invalid endpoint"); }
  const host = u.hostname.toLowerCase();
  if (u.protocol !== "https:" || u.username || u.password || u.port || u.hash ||
      !(ALLOWED_HOSTS.includes(host) || (host.endsWith(WINDOWS_HOST) && host.length > WINDOWS_HOST.length))) {
    throw new Error("Unsupported push endpoint");
  }
  // Reject IP literals, localhost and non-public DNS-like values.
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || /^\d+(\.\d+){3}$/.test(host) || host.includes(":")) throw new Error("Unsupported push endpoint");
  return u.toString();
}

export function validatePushKeys(keys: unknown): { p256dh: string; auth: string } {
  if (!keys || typeof keys !== "object") throw new Error("Invalid subscription keys");
  const { p256dh, auth } = keys as Record<string, unknown>;
  const valid = (v: unknown, exact: number) => typeof v === "string" && /^[A-Za-z0-9_-]+$/.test(v) && Buffer.from(v, "base64url").length === exact;
  if (!valid(p256dh, 65) || !valid(auth, 16)) throw new Error("Invalid subscription keys");
  return { p256dh: p256dh as string, auth: auth as string };
}

export function validateSubscription(body: unknown) {
  if (!body || typeof body !== "object") throw new Error("Invalid subscription");
  const b = body as Record<string, unknown>;
  const endpoint = validatePushEndpoint(b.endpoint);
  const keys = validatePushKeys(b.keys);
  if (b.expirationTime !== null && b.expirationTime !== undefined && (typeof b.expirationTime !== "number" || !Number.isFinite(b.expirationTime))) throw new Error("Invalid expiration time");
  return { endpoint, keys };
}

export async function getVapidKeys(): Promise<{ publicKey: string }> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("web_push_config").select("public_key,private_key_encrypted").eq("id", CONFIG_ID).maybeSingle();
  if (error) throw new Error("Could not read push configuration");
  if (data) return { publicKey: data.public_key };
  const generated = webpush.generateVAPIDKeys();
  const { data: inserted, error: insertError } = await admin.from("web_push_config").insert({ id: CONFIG_ID, public_key: generated.publicKey, private_key_encrypted: encryptSecret(generated.privateKey) }).select("public_key").maybeSingle();
  if (inserted) return { publicKey: inserted.public_key };
  // Singleton race: only one concurrent insert wins; reload its key.
  const { data: winner, error: rereadError } = await admin.from("web_push_config").select("public_key").eq("id", CONFIG_ID).maybeSingle();
  if (rereadError || !winner) throw new Error("Could not initialize push configuration");
  return { publicKey: winner.public_key };
}

async function loadVapid(): Promise<VapidKeys> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("web_push_config").select("public_key,private_key_encrypted").eq("id", CONFIG_ID).maybeSingle();
  if (error || !data) { await getVapidKeys(); return loadVapid(); }
  return { publicKey: data.public_key, privateKey: decryptSecret(data.private_key_encrypted) };
}

export async function sendPushToUsers(userIds: string[], payload: PushPayload): Promise<PushStats> {
  if (!Array.isArray(userIds) || userIds.length > MAX_RECIPIENTS) throw new Error(`At most ${MAX_RECIPIENTS} recipients are supported per call`);
  if (!payload || typeof payload.title !== "string" || payload.title.length > 180 || typeof payload.body !== "string" || payload.body.length > 2000) throw new Error("Invalid push payload");
  const ids = [...new Set(userIds)];
  const stats: PushStats = { attempted: 0, accepted: 0, failed: 0, expired: 0, unsubscribedUsers: 0 };
  if (!ids.length) return stats;
  const admin = createAdminClient();
  const rows: Array<{ id: string; user_id: string; endpoint: string; subscription_encrypted: string }> = [];
  for (let i = 0; i < ids.length; i += PAGE_SIZE) {
    const batch = ids.slice(i, i + PAGE_SIZE);
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await admin.from("web_push_subscriptions").select("id,user_id,endpoint,subscription_encrypted").in("user_id", batch).range(from, from + PAGE_SIZE - 1);
      if (error) throw new Error("Could not load push subscriptions");
      rows.push(...(data ?? []));
      if (!data || data.length < PAGE_SIZE) break;
    }
  }
  const subscribed = new Set(rows.map(r => r.user_id));
  stats.unsubscribedUsers = ids.filter(id => !subscribed.has(id)).length;
  if (!rows.length) return stats;
  const vapid = await loadVapid();
  const deadline = Date.now() + SEND_DEADLINE_MS;
  let next = 0;
  const workers = Array.from({ length: Math.min(8, rows.length) }, async () => {
    while (true) {
      const index = next++;
      if (index >= rows.length) return;
      const row = rows[index];
      if (Date.now() >= deadline) { stats.failed += rows.length - index; next = rows.length; return; }
      stats.attempted++;
      try {
        const subscription = { endpoint: validatePushEndpoint(row.endpoint), keys: validatePushKeys(decryptSubscription(row.subscription_encrypted)) };
        await webpush.sendNotification(subscription, JSON.stringify(payload), { TTL: 3600, urgency: "normal", timeout: Math.min(SEND_TIMEOUT_MS, Math.max(1, deadline - Date.now())), vapidDetails: { subject: "https://www.vendeo-studio.site", publicKey: vapid.publicKey, privateKey: vapid.privateKey } });
        stats.accepted++;
      } catch (err) {
        const status = (err as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) {
          stats.expired++;
          await admin.from("web_push_subscriptions").delete().eq("id", row.id).eq("user_id", row.user_id);
        } else stats.failed++;
      } finally {
        if (Date.now() >= deadline && next < rows.length) {
          // Remaining devices have not been attempted; count them as failed, never accepted.
          stats.failed += rows.length - next;
          next = rows.length;
        }
      }
    }
  });
  await Promise.all(workers);
  return stats;
}

export function endpointHash(endpoint: string) { return crypto.createHash("sha256").update(endpoint).digest("hex"); }
export function encryptSubscription(keys: { p256dh: string; auth: string }) { return encryptSecret(JSON.stringify(keys)); }
export function decryptSubscription(value: string) { return JSON.parse(decryptSecret(value)) as { p256dh: string; auth: string }; }
