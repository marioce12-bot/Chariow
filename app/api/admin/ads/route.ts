import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveRevenuePeriod } from "@/lib/admin-revenue-period";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const { admin, response } = await requireAdmin();
  if (!admin) return response ?? NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const period = resolveRevenuePeriod(new URL(request.url).searchParams, new Date());
  if (!period) return NextResponse.json({ error: "Invalid period" }, { status: 400, headers: { "Cache-Control": "private, no-store" } });
  const { data, error } = await createAdminClient().rpc("admin_ads_stats", { p_start: period.startAt, p_end: period.endAt });
  if (error || !data) return NextResponse.json({ error: "Ad statistics unavailable" }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  return NextResponse.json({ ads: data, period }, { headers: { "Cache-Control": "private, no-store" } });
}
