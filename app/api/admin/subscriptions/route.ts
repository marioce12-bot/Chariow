import { NextResponse } from "next/server";
import { requireAdmin, writeAdminAudit } from "@/lib/admin";
import { isPlanId, planMessagesLimit, computePeriodEnd } from "@/lib/plans";

export async function POST(request: Request) {
  const { supabase, admin, response } = await requireAdmin(["super_admin"]);
  if (!admin || !supabase) return response ?? NextResponse.json({ error: "Accès super administrateur requis" }, { status: 403 });
  const body = await request.json().catch(() => null);
  const userId = typeof body?.user_id === "string" ? body.user_id : "";
  const plan = isPlanId(body?.plan) ? body.plan : null;
  if (!userId || !plan) return NextResponse.json({ error: "Utilisateur et plan requis" }, { status: 400 });
  const now = new Date();
  const periodEnd = computePeriodEnd(plan, now);
  const { data: existing, error: findError } = await supabase.from("subscriptions").select("id,plan,status").eq("user_id", userId).maybeSingle();
  if (findError) return NextResponse.json({ error: findError.message }, { status: 500 });
  const payload = { user_id: userId, plan, status: "active", messages_limit: planMessagesLimit(plan), messages_used_this_month: 0, free_messages_used: 0, current_period_start: now.toISOString().slice(0, 10), current_period_end: periodEnd, trial_active: false, updated_at: now.toISOString() };
  const query = existing ? supabase.from("subscriptions").update(payload).eq("user_id", userId) : supabase.from("subscriptions").insert(payload);
  const { error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await writeAdminAudit(supabase, admin.id, "subscription_activated", "subscription", existing?.id ?? userId, { user_id: userId, plan });
  return NextResponse.json({ activated: true, user_id: userId, plan, status: "active" });
}
