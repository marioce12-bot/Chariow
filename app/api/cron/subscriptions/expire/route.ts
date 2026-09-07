import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

function authorized(request: Request) { const secret = process.env.CRON_SECRET; return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`); }

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase.from("subscriptions").update({ status: "past_due", updated_at: new Date().toISOString() }).eq("status", "active").eq("trial_active", false).lt("current_period_end", today).select("user_id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Essais de 7 jours arrivés à échéance : bascule en 'past_due' pour déclencher
  // la pop-up d'activation d'abonnement côté frontend, même sans nouvelle tentative de message.
  const { data: expiredTrials, error: trialError } = await supabase.rpc("expire_trials");
  if (trialError) return NextResponse.json({ error: trialError.message }, { status: 500 });

  return NextResponse.json({ expired: data?.length ?? 0, expired_trials: expiredTrials ?? 0 });
}
