import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { buildDiagnosticReports } from "@/lib/meta/diagnostic-server";

export async function GET(request: Request) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;

  const url = new URL(request.url);
  const result = await buildDiagnosticReports(supabase, user, {
    accountId: url.searchParams.get("account_id"),
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to"),
  });
  if ("error" in result) return NextResponse.json({ error: result.error.message }, { status: result.error.status });

  return NextResponse.json({ currency: result.currency, reports: result.reports });
}
