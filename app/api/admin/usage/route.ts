import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const { admin, response } = await requireAdmin();
  if (!admin) return response ?? NextResponse.json({ error: "Accès administrateur requis" }, { status: 403 });
  const days = Math.max(1, Math.min(90, Number(new URL(request.url).searchParams.get("days")) || 7));
  const { data, error } = await createAdminClient().rpc("admin_usage_stats", { p_days: days });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ usage: data });
}
