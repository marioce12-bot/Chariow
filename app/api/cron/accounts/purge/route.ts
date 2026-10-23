import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertRetentionIsolation } from "@/lib/account-retention-isolation";
export async function POST(request: Request) {
  if (process.env.VERCEL_ENV !== "preview" || process.env.ACCOUNT_RETENTION_PURGE_ENABLED !== "true") return NextResponse.json({ error: "Purge Preview désactivée" }, { status: 503 });
  const secret = process.env.ACCOUNT_RETENTION_PREVIEW_CRON_SECRET;
  if (!secret || secret.length < 32) return NextResponse.json({ error: "Purge non configurée" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    assertRetentionIsolation();
    const { data, error } = await createAdminClient().rpc("purge_expired_accounts", { p_limit: 100 });
    if (error) throw error;
    return NextResponse.json({ purged: data });
  } catch { return NextResponse.json({ error: "Purge interrompue ; aucun succès présumé." }, { status: 503 }); }
}
