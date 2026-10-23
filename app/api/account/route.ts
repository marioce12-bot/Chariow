import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";

export async function GET() {
  const { user, response, supabase } = await requireUser({ allowUnsubscribed: true, allowPendingAccount: true });
  if (!user) return response;
  const { data, error } = await supabase.rpc("account_retention_status");
  if (error) return NextResponse.json({ error: "Le statut du compte est indisponible." }, { status: 503 });
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE() {
  const { user, response, supabase } = await requireUser({ allowUnsubscribed: true, allowPendingAccount: true });
  if (!user) return response;
  const { data, error } = await supabase.rpc("request_account_deletion");
  if (error) return NextResponse.json({ error: "Impossible de programmer la suppression du compte." }, { status: 503 });
  await supabase.auth.signOut({ scope: "global" });
  return NextResponse.json({ ...data, deletion_scheduled: true }, { headers: { "Cache-Control": "no-store" } });
}
