import { createAdminClient } from "@/lib/supabase/admin";
import { chariowSaleRows } from "./sales-rows";
import { isConfirmedChariowSaleStatus } from "./sales";
import { sendPushToUsers } from "@/lib/push/server";

export const SALE_NOTIFICATIONS_START_AT = "2026-10-21T23:22:30.000Z";

type Locale = "fr" | "en";
type SaleCopyInput = { sale: unknown; locale?: string | null };

function record(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}
function localeFor(value: unknown): Locale {
  return typeof value === "string" && value.toLowerCase().startsWith("en") ? "en" : "fr";
}
function saleAmount(sale: Record<string, any>, locale: Locale): string | null {
  const amount = sale.amount;
  const row = record(amount);
  let raw = row.value ?? amount;
  const currency = row.currency ?? sale.currency;
  if (raw == null || typeof raw === "boolean" || (typeof raw === "string" && !raw.trim()) || !currency) return null;
  if (typeof raw === "string") raw = Number(raw);
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
  try {
    return new Intl.NumberFormat(locale === "fr" ? "fr-FR" : "en-US", { style: "currency", currency: String(currency) }).format(raw);
  } catch {
    return null;
  }
}

/** Pure localized notification content, independently usable in unit tests. */
export function saleNotificationCopy({ sale: input, locale }: SaleCopyInput): { title: string; body: string } {
  const sale = record(input);
  const lang = localeFor(locale);
  const product = (String(record(sale.product).name ?? record(sale.product).title ?? sale.product_name ?? (lang === "fr" ? "un produit" : "a product")).trim() || (lang === "fr" ? "un produit" : "a product")).slice(0, 160);
  const amount = saleAmount(sale, lang);
  let body = lang === "fr" ? `Nouvelle vente : ${product}${amount ? ` — ${amount}` : ""}.` : `New sale: ${product}${amount ? ` — ${amount}` : ""}.`;
  if (body.length > 999) body = `${body.slice(0, 996)}…`;
  return { title: lang === "fr" ? "🎉 oh, le génie 🤑" : "🎉 Oh, you genius 🤑", body };
}

function saleDate(sale: Record<string, any>): number | null {
  const primary = [sale.paid_at, sale.completed_at, sale.settled_at].find((value) => value != null && String(value).trim() !== "");
  const raw = primary ?? sale.created_at ?? sale.createdAt;
  if (raw == null || String(raw).trim() === "") return null;
  const parsed = Date.parse(String(raw));
  return Number.isFinite(parsed) ? parsed : null;
}
function saleId(sale: Record<string, any>): string {
  const id = sale.id ?? sale.sale_id ?? sale.order_id;
  return id == null ? "" : String(id).trim();
}

export async function notifyChariowSales(
  store: { id: string; user_id: string; store_name?: string; connected_at?: string | null },
  sales: unknown,
): Promise<void> {
  const now = Date.now();
  const lowerBound = Math.max(Date.parse(SALE_NOTIFICATIONS_START_AT), store.connected_at ? Date.parse(store.connected_at) : -Infinity);
  if (!Number.isFinite(lowerBound)) return;
  const admin = createAdminClient();
  const { data: profile, error: profileError } = await admin.from("profiles").select("preferred_locale").eq("id", store.user_id).maybeSingle();
  if (profileError) throw profileError;
  const locale = localeFor(profile?.preferred_locale);

  for (const raw of chariowSaleRows(store.id, sales)) {
    const sale = record(raw.raw_payload);
    if (!isConfirmedChariowSaleStatus(sale.status)) continue;
    const id = saleId(sale);
    const date = saleDate(sale);
    if (!id || date == null || date < lowerBound || date > now) continue;
    const dedupeKey = `chariow-sale:${store.id}:${id}`;
    const generated = saleNotificationCopy({ sale, locale });
    const { title, body } = generated;
    const { data: inserted, error: insertError } = await admin.from("user_notifications").insert({
      user_id: store.user_id,
      type: "system",
      title,
      body,
      action_url: "/dashboard",
      metadata: { kind: "chariow_sale", dedupe_key: dedupeKey, push_state: "pending", url: "/dashboard" },
      dedupe_key: dedupeKey,
    }).select("id").maybeSingle();

    let notification = inserted as { id: string } | null;
    let observedState = "pending";
    let persistedCopy = generated;
    let persistedMetadata: Record<string, any> = { kind: "chariow_sale", dedupe_key: dedupeKey, push_state: "pending", url: "/dashboard" };
    if (insertError) {
      if (insertError.code !== "23505") throw insertError;
      const { data: existing, error: existingError } = await admin.from("user_notifications")
        .select("id,title,body,metadata").eq("user_id", store.user_id).eq("dedupe_key", dedupeKey).maybeSingle();
      if (existingError) throw existingError;
      if (!existing) continue;
      persistedMetadata = record(existing.metadata);
      observedState = persistedMetadata.push_state;
      if (observedState !== "pending" && observedState !== "failed") continue;
      notification = { id: existing.id };
      persistedCopy = { title: existing.title, body: existing.body };
    }
    if (!notification?.id) continue;

    // Claim only the exact observed retryable state. A competing worker wins this transition once.
    const metadata = { ...persistedMetadata, push_state: "sending" };
    const { data: claim, error: claimError } = await admin.from("user_notifications")
      .update({ metadata })
      .eq("id", notification.id).eq("metadata->>push_state", observedState).select("id").maybeSingle();
    if (claimError) throw claimError;
    if (!claim?.id) continue;

    let pushState = "failed";
    try {
      const stats = await sendPushToUsers([store.user_id], { ...persistedCopy, url: "/dashboard", tag: dedupeKey });
      pushState = stats.accepted > 0 ? "sent" : stats.unsubscribedUsers > 0 ? "unsubscribed" : "failed";
    } catch (error) {
      try {
        const failedMetadata = { ...metadata, push_state: "failed" };
        const { error: updateError } = await admin.from("user_notifications").update({ metadata: failedMetadata }).eq("id", notification.id);
        if (updateError) throw updateError;
      } catch { /* Preserve the original transport failure. */ }
      throw error;
    }
    const finalMetadata = { ...metadata, push_state: pushState };
    const { error: updateError } = await admin.from("user_notifications").update({ metadata: finalMetadata }).eq("id", notification.id);
    if (updateError) throw updateError;
    // Transport failures are returned as statistics by sendPushToUsers, not
    // necessarily exceptions. Let the webhook request a provider retry too.
    if (pushState === "failed") throw new Error("Sale push delivery failed; notification preserved for retry");
  }
}
