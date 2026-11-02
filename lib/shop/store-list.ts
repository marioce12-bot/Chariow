import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { userStoreListTag } from "./cache";

const ACTIVE_STORE_COLUMNS = "id, platform, store_name, logo_url, image, mcp_url, is_active, connection_status, connection_error, connected_at, created_at";

/** Call only after requireUser; the user ID is part of the cache key and the database predicate. */
export function getCachedActiveStores(userId: string) {
  const load = unstable_cache(async () => {
    const { data, error } = await createAdminClient()
      .from("stores")
      .select(ACTIVE_STORE_COLUMNS)
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("created_at", { ascending: false });
    if (error) throw new Error("Impossible de charger les boutiques");
    return data ?? [];
  }, ["active-stores-v1", userId], {
    revalidate: 60,
    tags: [userStoreListTag(userId)],
  });
  return load();
}
