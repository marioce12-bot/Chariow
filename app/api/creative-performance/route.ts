import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { loadCreativePerformance, parseCreativePeriod } from "@/lib/creative-performance/service";

export async function GET(request: Request) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const params = new URL(request.url).searchParams;
  const storeId = params.get("store_id");
  if (!storeId) return NextResponse.json({ error: "Choisis une boutique.", code: "STORE_REQUIRED" }, { status: 400 });
  const { data: store, error: storeError } = await supabase.from("stores")
    .select("id").eq("id", storeId).eq("user_id", user.id).eq("is_active", true).maybeSingle();
  if (storeError || !store) return NextResponse.json({ error: "Boutique introuvable.", code: "STORE_NOT_FOUND" }, { status: 404 });
  try {
    const period = parseCreativePeriod(params);
    const readOnly = process.env.VERCEL_ENV === "preview" || params.get("read_only") === "1";
    const data = await loadCreativePerformance({ supabase, userId: user.id, storeId, period, persistSnapshots: !readOnly });
    return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Performance visuel est temporairement indisponible.";
    const migrationMissing = /creative_media_(assets|placements|asset_urls)|creative_campaign_metric_snapshots/i.test(message);
    return NextResponse.json({
      error: migrationMissing
        ? "La bibliothèque Performance visuel attend sa migration de base de données. Aucun chiffre n’est affiché en attendant."
        : message,
      code: migrationMissing ? "CREATIVE_LIBRARY_NOT_READY" : "CREATIVE_PERFORMANCE_UNAVAILABLE",
    }, { status: migrationMissing ? 503 : 500, headers: { "Cache-Control": "private, no-store" } });
  }
}
