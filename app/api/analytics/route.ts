import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getChariowSnapshot, normalizeChariowSnapshot } from "@/lib/chariow/analytics";

// Cookie lisible cote navigateur (non httpOnly, sans donnee sensible) : il permet
// d'afficher un message clair quand Chariow est en panne (voir ChariowStatusNotice).
const STATUS_COOKIE = "vendeo_chariow_status";

function withStatus(response: NextResponse, status: "unavailable" | "expired" | null) {
  if (status) response.cookies.set(STATUS_COOKIE, status, { path: "/", maxAge: 15 * 60, sameSite: "lax" });
  else response.cookies.delete(STATUS_COOKIE);
  return response;
}

// Le serveur MCP de Chariow ne repond pas : timeout (20 s), erreur reseau ou erreur 5xx.
function isChariowDown(message: string) {
  return /timeout|timed out|aborted|fetch failed|ECONN|ENOTFOUND|returned 5\d\d/i.test(message);
}

export async function GET(request: Request) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const storeId = new URL(request.url).searchParams.get("store_id");
  const from = new URL(request.url).searchParams.get("from") ?? undefined;
  const to = new URL(request.url).searchParams.get("to") ?? undefined;
  const query = supabase.from("stores").select("id, store_name, mcp_url, access_token_encrypted, connection_status").eq("user_id", user.id).eq("is_active", true);
  const { data: store, error } = await (storeId ? query.eq("id", storeId).maybeSingle() : query.limit(1).maybeSingle());
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!store) return NextResponse.json({ error: "Aucune boutique active" }, { status: 404 });
  try {
    const snapshot = await getChariowSnapshot(store, { from, to });
    const normalized = normalizeChariowSnapshot(snapshot, { from: from ?? "", to: to ?? "" });
    return withStatus(NextResponse.json({ store: { name: normalized.storeName, status: store.connection_status }, snapshot: normalized }), null);
  } catch (analyticsError) {
    const message = analyticsError instanceof Error ? analyticsError.message : String(analyticsError);
    console.error("Chariow analytics error", message);
    if (/returned 401\b/.test(message)) {
      await supabase.from("stores").update({ connection_status: "expired", connection_error: null, last_verified_at: new Date().toISOString() }).eq("id", store.id).eq("user_id", user.id);
      return withStatus(NextResponse.json({ error: "La connexion Chariow a expiré", code: "CHARIOW_EXPIRED" }, { status: 401 }), "expired");
    }
    if (isChariowDown(message)) {
      return withStatus(NextResponse.json({ error: "Chariow ne répond pas pour le moment", code: "CHARIOW_UNAVAILABLE" }, { status: 503 }), "unavailable");
    }
    return withStatus(NextResponse.json({ error: "Les données Chariow sont momentanément indisponibles", code: "CHARIOW_UNAVAILABLE" }, { status: 502 }), "unavailable");
  }
}
