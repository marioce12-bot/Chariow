import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";

export async function POST(request: Request) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;

  const body = await request.json().catch(() => null);
  const storeId = body?.store_id;
  if (typeof storeId !== "string" || !storeId) {
    return NextResponse.json({ error: "store_id requis" }, { status: 400 });
  }

  const now = new Date();
  const { data, error } = await supabase
    .from("stores")
    .update({
      access_token_encrypted: null,
      refresh_token_encrypted: null,
      token_type: null,
      token_expires_at: null,
      connected_scopes: null,
      chariow_store_id: null,
      connection_status: "revoked",
      connection_error: null,
      last_verified_at: now.toISOString(),
    })
    .eq("id", storeId)
    .eq("user_id", user.id)
    .eq("platform", "chariow")
    .select("id, platform, store_name, mcp_url, is_active, connection_status, connection_error, connected_at, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ store: data });
}
