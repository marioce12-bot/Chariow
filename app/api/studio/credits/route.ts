import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";

export async function GET() {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const [{ data: account }, { data: transactions }] = await Promise.all([
    supabase.from("credit_accounts").select("balance,reserved").eq("user_id", user.id).maybeSingle(),
    supabase.from("credit_transactions").select("id,kind,credits,operation,model,status,created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20),
  ]);
  return NextResponse.json({ balance: account?.balance ?? 0, reserved: account?.reserved ?? 0, transactions: transactions ?? [] });
}
