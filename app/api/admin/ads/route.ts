import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveRevenuePeriod } from "@/lib/admin-revenue-period";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  const { admin, response } = await requireAdmin();
  if (!admin) return response ?? NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const asOf = new Date();
  const period = resolveRevenuePeriod(new URL(request.url).searchParams, asOf);
  if (!period) return NextResponse.json({ error: "Invalid period" }, { status: 400, headers });
  const { data, error } = await createAdminClient().rpc("admin_ads_metrics", { p_start: period.startAt, p_end: period.endAt });
  if (error || !data || typeof data !== "object") {
    console.error("admin_ads_metrics failed", { code: error?.code ?? "unknown" });
    return NextResponse.json({ error: "Ads metrics unavailable" }, { status: 503, headers });
  }
  return NextResponse.json({
    ads: { ...data, period: { preset: period.preset, start: period.start, end: period.end, timeZone: period.timeZone, startAt: period.startAt, endAt: period.endAt }, asOf: asOf.toISOString() },
  }, { headers });
}
