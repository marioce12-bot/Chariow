import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToUsers } from "@/lib/push/server";
import { saleNotificationCopy } from "@/lib/chariow/sale-notifications";
import { isConfirmedShopifySaleStatus } from "@/lib/shopify/sales";
const record = (v: unknown): Record<string, any> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, any> : {};
export async function notifyShopifySales(store: { id: string; user_id: string; connected_at?: string | null }, sales: unknown): Promise<void> {
 const minDate = store.connected_at ? Date.parse(store.connected_at) : Date.now(); if (!Number.isFinite(minDate)) return;
 const now = Date.now(), list = Array.isArray(sales) ? sales : []; if (!list.length) return;
 const admin = createAdminClient(); const { data: profile, error: pe } = await admin.from("profiles").select("preferred_locale").eq("id", store.user_id).maybeSingle(); if (pe) throw pe;
 for (const value of list) {
  const sale = record(value), id = String(sale.id ?? sale.chariow_sale_id ?? "").replace(/^shopify:[^:]+:/, ""), date = Date.parse(String(sale.created_at ?? sale.occurred_at ?? ""));
  if (!id || !Number.isFinite(date) || date < minDate || date > now || !isConfirmedShopifySaleStatus(sale.status)) continue;
  const dedupeKey = `shopify-sale:${store.id}:${id}`, copy = saleNotificationCopy({ sale, locale: profile?.preferred_locale });
  const { data: inserted, error: ie } = await admin.from("user_notifications").insert({ user_id: store.user_id, type: "system", title: copy.title, body: copy.body, action_url: "/dashboard", dedupe_key: dedupeKey, metadata: { kind: "shopify_sale", store_id: store.id, dedupe_key: dedupeKey, push_state: "pending", url: "/dashboard" } }).select("id").maybeSingle();
  let notification = inserted as { id: string } | null, state = "pending", savedCopy = copy;
  let metadata: Record<string, any> = { kind: "shopify_sale", store_id: store.id, dedupe_key: dedupeKey, push_state: "pending", url: "/dashboard" };
  if (ie) { if (ie.code !== "23505") throw ie; const { data: existing, error } = await admin.from("user_notifications").select("id,title,body,metadata").eq("user_id", store.user_id).eq("dedupe_key", dedupeKey).maybeSingle(); if (error) throw error; if (!existing) continue; metadata = record(existing.metadata); state = metadata.push_state; if (state !== "pending" && state !== "failed") continue; notification = { id: existing.id }; savedCopy = { title: existing.title, body: existing.body }; }
  if (!notification?.id) continue;
  const claiming = { ...metadata, push_state: "sending" }, { data: claim, error: ce } = await admin.from("user_notifications").update({ metadata: claiming }).eq("id", notification.id).eq("metadata->>push_state", state).select("id").maybeSingle(); if (ce) throw ce; if (!claim?.id) continue;
  let result = "failed"; try { const stats = await sendPushToUsers([store.user_id], { ...savedCopy, url: "/dashboard", tag: dedupeKey }); result = stats.accepted > 0 ? "sent" : stats.unsubscribedUsers > 0 ? "unsubscribed" : "failed"; } catch (err) { await admin.from("user_notifications").update({ metadata: { ...claiming, push_state: "failed" } }).eq("id", notification.id); throw err; }
  const { error } = await admin.from("user_notifications").update({ metadata: { ...claiming, push_state: result } }).eq("id", notification.id); if (error) throw error; if (result === "failed") throw new Error("Shopify sale push delivery failed");
 }
}
