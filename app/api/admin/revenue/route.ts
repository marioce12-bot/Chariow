import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { readRevenue } from "@/lib/admin-revenue";
import { resolveRevenuePeriod } from "@/lib/admin-revenue-period";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const { admin, response } = await requireAdmin();
  if (!admin) return response ?? NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const params = new URL(request.url).searchParams;
  const asOf = new Date();
  const period = resolveRevenuePeriod(params, asOf);
  if (!period) return NextResponse.json({ error: "Invalid revenue period" }, { status: 400, headers: { "Cache-Control": "private, no-store" } });
  try {
    const revenue = await readRevenue(createAdminClient(), asOf.toISOString(), params.size ? period : undefined);
    return NextResponse.json({ revenue }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Revenue unavailable" }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
}
