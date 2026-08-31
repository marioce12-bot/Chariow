import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function DELETE() {
  const { user, response } = await requireUser();
  if (!user) return response;

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    console.error("Account deletion failed", error.message);
    return NextResponse.json({ error: "Impossible de supprimer le compte pour le moment." }, { status: 500 });
  }

  return NextResponse.json({ deleted: true });
}
