import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const { admin, response } = await requireAdmin();
  if (!admin) return response ?? NextResponse.json({ error: "Accès administrateur requis" }, { status: 403 });

  const rawDays = new URL(request.url).searchParams.get("days");
  const parsedDays = rawDays === null ? 7 : Number(rawDays);
  if (!Number.isInteger(parsedDays) || parsedDays < 1 || parsedDays > 90) {
    return NextResponse.json({ error: "Paramètre days invalide (1–90)" }, { status: 400 });
  }
  const { data, error } = await createAdminClient().rpc("admin_usage_stats", { p_days: parsedDays });
  if (error) {
    console.error("admin_usage_stats failed", { code: error.code, message: error.message });
    return NextResponse.json({ error: "Impossible de charger les statistiques d'usage" }, { status: 500 });
  }
  return NextResponse.json({ usage: data });
}
