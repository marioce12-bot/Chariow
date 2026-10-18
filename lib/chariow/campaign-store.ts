import type { SupabaseClient } from "@supabase/supabase-js";

/** Never attach a product campaign to an arbitrary first connected store. */
export async function resolveChatCampaignStore(supabase: SupabaseClient, userId: string, requestedId?: string) {
  let query = supabase.from("stores").select("id")
    .eq("user_id", userId).eq("platform", "chariow")
    .eq("is_active", true).eq("connection_status", "connected");
  if (requestedId) query = query.eq("id", requestedId);
  const { data, error } = await query.limit(2);
  if (error || !data?.length) return { ok: false as const, code: "STORE_NOT_FOUND" };
  if (data.length !== 1) return { ok: false as const, code: "STORE_SELECTION_REQUIRED" };
  return { ok: true as const, store: { id: String(data[0].id) } };
}
