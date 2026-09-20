import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  // Les ecritures passent par le client service-role : RLS n'autorise que la lecture
  // cote utilisateur sur credit_accounts / credit_transactions.
  const admin = createAdminClient();
  const { error: accountError } = await admin.from("credit_accounts").upsert({ user_id: user.id }, { onConflict: "user_id", ignoreDuplicates: true });
  if (accountError) console.error("Studio credit account read error", accountError.message, accountError.code);
  const [{ data: account }, { data: transactions }] = await Promise.all([
    supabase.from("credit_accounts").select("balance,reserved").eq("user_id", user.id).maybeSingle(),
    supabase.from("credit_transactions").select("id,kind,credits,operation,model,status,created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20),
  ]);
  return NextResponse.json({ balance: account?.balance ?? 0, reserved: account?.reserved ?? 0, transactions: transactions ?? [] });
}
