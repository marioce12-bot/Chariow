"use client";

import { useEffect } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/browser";
import type { NavigationCache } from "./NavigationDataCache";

/** Postgres Changes applies sales_events RLS; never subscribe to raw webhook payloads. */
export function subscribeChariowSales(client: SupabaseClient, storeId: string, userId: string, onSale: () => void) {
  let active = true;
  const seen = new Set<string>();
  const channel = client.channel(`sales-events:${storeId}`)
    .on("postgres_changes", {
      event: "INSERT",
      schema: "public",
      table: "sales_events",
      filter: `store_id=eq.${storeId}`,
    }, (payload) => {
      if (!active) return;
      const event = payload.new as { event_id?: unknown; store_id?: unknown; user_id?: unknown };
      // Defense in depth: RLS and the server-owned user/store IDs remain authoritative.
      if (event.store_id !== storeId || event.user_id !== userId || typeof event.event_id !== "string" || !event.event_id) return;
      if (seen.has(event.event_id)) return;
      seen.add(event.event_id);
      if (seen.size > 200) seen.delete(seen.values().next().value!);
      onSale();
    })
    .subscribe();
  return () => {
    active = false;
    void Promise.resolve(client.removeChannel(channel)).catch(() => {});
  };
}

export function useChariowSalesRealtime(storeId: string | null, userId: string | null, cache: NavigationCache) {
  useEffect(() => {
    if (!storeId || !userId) return;
    return subscribeChariowSales(createClient(), storeId, userId, () => {
      // One mounted analytics reader refetches; hidden/unfocused readers wait for foreground return.
      cache.invalidateAnalyticsStore(storeId);
    });
  }, [cache, storeId, userId]);
}
