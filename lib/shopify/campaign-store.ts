import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveChatCampaignStore as resolveChariowCampaignStore } from "@/lib/chariow/campaign-store";
/** Preserve the Chariow resolver; allow explicitly selected connected Shopify stores too. */
export async function resolveCommerceCampaignStore(supabase: SupabaseClient, userId: string, requestedId?: string) {
  if (requestedId) {
    const { data, error } = await supabase.from("stores").select("id,platform,is_active,connection_status").eq("id", requestedId).eq("user_id", userId).limit(1);
    if (error) return { ok: false as const, code: "STORE_NOT_FOUND" };
    const store = data?.[0];
    if (store?.platform === "shopify") {
      if (!store.is_active || store.connection_status !== "connected") return { ok: false as const, code: "STORE_NOT_FOUND" };
      return { ok: true as const, store: { id: String(store.id) } };
    }
  }
  return resolveChariowCampaignStore(supabase, userId, requestedId);
}
