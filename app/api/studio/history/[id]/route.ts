import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const { id } = await params;
  const admin = createAdminClient();
  const { data: item, error: findError } = await admin.from("studio_generations").select("storage_path").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (findError) return NextResponse.json({ error: findError.message }, { status: 500 });
  if (!item) return NextResponse.json({ error: "Création introuvable." }, { status: 404 });
  if (item.storage_path) await admin.storage.from("studio-media").remove([item.storage_path]);
  const { error } = await admin.from("studio_generations").delete().eq("id", id).eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
