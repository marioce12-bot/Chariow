import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getChariowGeography } from "@/lib/chariow/geography";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
function validDate(value: string) { return DATE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)) && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value; }
export async function GET(request: Request) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const params = new URL(request.url).searchParams;
  const storeId = params.get("store_id");
  if (!storeId) return NextResponse.json({ error: "Choisis une boutique.", code: "STORE_REQUIRED" }, { status: 400 });
  const today = new Date().toISOString().slice(0, 10);
  const defaultFrom = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
  const from = params.get("from") ?? defaultFrom;
  const to = params.get("to") ?? today;
  if (!validDate(from) || !validDate(to) || from > to) return NextResponse.json({ error: "Période invalide.", code: "INVALID_PERIOD" }, { status: 400 });
  const { data: store, error } = await supabase.from("stores")
    .select("id,platform,mcp_url,access_token_encrypted,connection_status")
    .eq("id", storeId).eq("user_id", user.id).eq("is_active", true).maybeSingle();
  if (error) return NextResponse.json({ error: "Impossible de vérifier la boutique.", code: "STORE_CHECK_FAILED" }, { status: 500 });
  if (!store) return NextResponse.json({ error: "Boutique introuvable.", code: "STORE_NOT_FOUND" }, { status: 404 });
  if (store.platform !== "chariow" || store.connection_status !== "connected" || !store.mcp_url) {
    return NextResponse.json({ error: "La boutique Chariow n’est pas connectée.", code: "STORE_NOT_CONNECTED" }, { status: 409 });
  }
  try {
    const analytics = await getChariowGeography(store, { from, to });
    return NextResponse.json(analytics, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Les analytics géographiques Chariow sont temporairement indisponibles.", code: "GEOGRAPHY_UNAVAILABLE" }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
}
