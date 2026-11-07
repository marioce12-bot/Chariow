import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_NOTIFICATIONS = 100;

export async function GET() {
  const { user, response } = await requireUser({ allowUnsubscribed: true });
  if (!user) return response;

  const { data, error } = await createAdminClient()
    .from("credit_transactions")
    .select("id,credits,created_at")
    .eq("user_id", user.id)
    .eq("operation", "referral_signup_bonus")
    .eq("status", "completed")
    .eq("credits", 150)
    .order("created_at", { ascending: false })
    .limit(MAX_NOTIFICATIONS);

  if (error) {
    console.error("referral bonus notification read failed", error.message, error.code);
    return NextResponse.json({ error: "Impossible de vérifier les récompenses de parrainage." }, { status: 500 });
  }

  const transactions = (data ?? [])
    .filter((row) => typeof row.id === "string" && row.credits === 150 && typeof row.created_at === "string")
    .map((row) => ({ id: row.id, credits: row.credits, createdAt: row.created_at }));

  return NextResponse.json({ transactions }, { headers: { "Cache-Control": "no-store" } });
}
