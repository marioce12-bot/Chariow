import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchCelebrationSales } from "@/lib/chariow/celebration";

export async function POST() {
  try {
    const auth = await requireUser();
    if (!auth.user) return auth.response;
    const admin = createAdminClient();
    const { data: stores, error } = await admin.from("stores").select("id,user_id,mcp_url,access_token_encrypted").eq("user_id", auth.user.id).eq("platform", "chariow").eq("is_active", true).eq("connection_status", "connected");
    if (error || !stores) return NextResponse.json({ celebrate: false });
    let count = 0;
    for (const store of stores) {
      try {
        const observedAt = new Date();
        const { data: baseline, error: baselineError } = await admin.from("chariow_celebration_baselines").select("baseline_at").eq("store_id", store.id).maybeSingle();
        if (baselineError) continue;
        const from = baseline?.baseline_at ? new Date(baseline.baseline_at).toISOString().slice(0, 10) : observedAt.toISOString().slice(0, 10);
        const candidates = await fetchCelebrationSales(store, { from });
        const { data, error: rpcError } = await admin.rpc("consume_chariow_celebration_sales", { p_user_id: auth.user.id, p_store_id: store.id, p_candidates: candidates, p_observed_at: observedAt.toISOString() });
        if (!rpcError && typeof data === "number") count += data;
        else if (!rpcError && data && typeof data === "object" && "count" in data) count += Number((data as {count: number}).count) || 0;
      } catch { /* celebration must never block the application */ }
    }
    return NextResponse.json({ celebrate: count > 0, count });
  } catch {
    return NextResponse.json({ celebrate: false });
  }
}
