import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const { id } = await params;
  const { error } = await supabase.from("stores").update({
    is_active: false,
    access_token_encrypted: null,
    refresh_token_encrypted: null,
    token_type: null,
    token_expires_at: null,
    connected_scopes: null,
    chariow_store_id: null,
    connection_status: "revoked",
    connection_error: null,
  }).eq("id", id).eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
