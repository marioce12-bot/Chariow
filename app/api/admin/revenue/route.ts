import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { readRevenue } from "@/lib/admin-revenue";
export const dynamic = "force-dynamic";
export async function GET() {
  const { admin, response } = await requireAdmin();
  if (!admin) return response ?? NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const revenue = await readRevenue(createAdminClient());
    return NextResponse.json({ revenue }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Revenue unavailable" }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
}
