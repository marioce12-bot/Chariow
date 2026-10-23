import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
export async function POST() {
  const { user, response, supabase } = await requireUser({ allowUnsubscribed: true, allowPendingAccount: true });
  if (!user) return response;
  if (!user.email_confirmed_at) return NextResponse.json({ error: "Vérifiez votre adresse e-mail avant de restaurer le compte." }, { status: 403 });
  const { data, error } = await supabase.rpc("restore_account");
  if (error) return NextResponse.json({ error: "Restauration impossible : le délai a expiré ou la vérification est insuffisante." }, { status: 409 });
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}
