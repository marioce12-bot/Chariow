import { NextResponse } from "next/server";
import { requireAdmin, writeAdminAudit } from "@/lib/admin";
import { isPlanId, computePeriodEnd } from "@/lib/plans";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveRevenuePeriod } from "@/lib/admin-revenue-period";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const cacheHeaders = { "Cache-Control": "private, no-store" };
  const { admin, response } = await requireAdmin();
  if (!admin) return response ?? NextResponse.json({ error: "Forbidden" }, { status: 403, headers: cacheHeaders });

  const params = new URL(request.url).searchParams;
  const filter = params.get("filter") ?? "all";
  if (!["paid", "trial", "expired", "all"].includes(filter)) {
    return NextResponse.json({ error: "Invalid subscription filter" }, { status: 400, headers: cacheHeaders });
  }
  const now = new Date();
  const period = resolveRevenuePeriod(params, now);
  if (!period) return NextResponse.json({ error: "Invalid revenue period" }, { status: 400, headers: cacheHeaders });

  try {
    const service = createAdminClient();
    const subscriptions: Record<string, any>[] = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await service.from("subscriptions")
        .select("id,user_id,plan,status,trial_active,trial_ends_at,current_period_start,current_period_end,created_at,updated_at")
        .order("created_at", { ascending: false }).range(offset, offset + 999);
      if (error) throw error;
      subscriptions.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }

    const userIds = [...new Set(subscriptions.map((subscription) => subscription.user_id).filter(Boolean))] as string[];
    const profiles: Record<string, any> = {};
    for (let i = 0; i < userIds.length; i += 500) {
      const { data, error } = await service.from("profiles").select("id,full_name,email,avatar_url").in("id", userIds.slice(i, i + 500));
      if (error) throw error;
      for (const profile of data ?? []) profiles[profile.id] = profile;
    }

    const lastPayment: Record<string, string> = {};
    const periodUsers = new Set<string>();
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await service.from("payment_events").select("user_id,created_at").eq("status", "approved").not("plan", "is", null).order("created_at", { ascending: false }).range(offset, offset + 999);
      if (error) throw error;
      for (const payment of data ?? []) {
        if (!payment.user_id) continue;
        if (!lastPayment[payment.user_id]) lastPayment[payment.user_id] = payment.created_at;
        const timestamp = new Date(payment.created_at).getTime();
        if ((!period.startAt || timestamp >= new Date(period.startAt).getTime()) && timestamp <= new Date(period.endAt).getTime()) periodUsers.add(payment.user_id);
      }
      if (!data || data.length < 1000) break;
    }

    const today = now.toISOString().slice(0, 10);
    const counts = { paid: 0, trial: 0, expired: 0 };
    const result = subscriptions.map((subscription) => {
      const paid = subscription.status === "active" && subscription.trial_active === false && Boolean(subscription.current_period_end) && String(subscription.current_period_end).slice(0, 10) >= today;
      const trial = subscription.status === "trialing" && subscription.trial_active === true && Boolean(subscription.trial_ends_at) && new Date(subscription.trial_ends_at).getTime() > now.getTime();
      const classification = paid ? "paid" : trial ? "trial" : "expired";
      counts[classification]++;
      const expiry = trial ? subscription.trial_ends_at : subscription.current_period_end;
      const days_left = expiry ? Math.max(0, Math.ceil((new Date(expiry).getTime() - now.getTime()) / 86400000)) : 0;
      return { ...subscription, profile: profiles[subscription.user_id] ?? null, classification, days_left, last_payment_at: lastPayment[subscription.user_id] ?? null };
    }).filter((subscription) => filter === "all" || subscription.classification === filter);

    return NextResponse.json({ subscriptions: result, counts, newSubscriptionPayments: periodUsers.size, period }, { headers: cacheHeaders });
  } catch {
    return NextResponse.json({ error: "Subscriptions unavailable" }, { status: 503, headers: cacheHeaders });
  }
}

export async function POST(request: Request) {
  const { supabase, admin, response } = await requireAdmin(["super_admin"]);
  if (!admin || !supabase) return response ?? NextResponse.json({ error: "Accès super administrateur requis" }, { status: 403 });
  const body = await request.json().catch(() => null);
  const userId = typeof body?.user_id === "string" ? body.user_id : "";
  // Un seul plan existe désormais ("starter" = Vendeo, 2 000 XOF/mois).
  const plan = isPlanId(body?.plan) ? body.plan : "starter";
  if (!userId) return NextResponse.json({ error: "Utilisateur requis" }, { status: 400 });
  const now = new Date();
  const periodEnd = computePeriodEnd(plan, now);
  const { data: existing, error: findError } = await supabase.from("subscriptions").select("id,plan,status").eq("user_id", userId).maybeSingle();
  if (findError) return NextResponse.json({ error: findError.message }, { status: 500 });
  // Plus de quota de messages IA : on ne fixe plus messages_limit, l'accès est
  // illimité tant que l'abonnement est actif (voir consume_message_quota).
  const payload = { user_id: userId, plan, status: "active", messages_used_this_month: 0, free_messages_used: 0, current_period_start: now.toISOString().slice(0, 10), current_period_end: periodEnd, trial_active: false, updated_at: now.toISOString() };
  const query = existing ? supabase.from("subscriptions").update(payload).eq("user_id", userId) : supabase.from("subscriptions").insert(payload);
  const { error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await writeAdminAudit(supabase, admin.id, "subscription_activated", "subscription", existing?.id ?? userId, { user_id: userId, plan });
  return NextResponse.json({ activated: true, user_id: userId, plan, status: "active" });
}
