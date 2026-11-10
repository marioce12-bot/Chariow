import { NextResponse } from "next/server";
import { requireAdmin, writeAdminAudit } from "@/lib/admin";
import { isPlanId, computePeriodEnd } from "@/lib/plans";
import { createAdminClient } from "@/lib/supabase/admin";

const PAGE_SIZE = 500;

async function readCurrentSubscriptions(service: ReturnType<typeof createAdminClient>, trial: boolean, today: string, now: string) {
  const rows: Record<string, any>[] = [];
  for (let offset = 0; offset < 50_000; offset += PAGE_SIZE) {
    let query = service.from("subscriptions").select("user_id,plan,status,trial_active,trial_ends_at,current_period_start,current_period_end,created_at");
    query = trial
      ? query.eq("trial_active", true).gt("trial_ends_at", now)
      : query.eq("status", "active").eq("trial_active", false).gte("current_period_end", today);
    const { data, error } = await query.range(offset, offset + PAGE_SIZE - 1);
    if (error) return { rows, error };
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return { rows, error: null };
  }
  return { rows, error: new Error("active_subscription_read_limit") };
}

export async function GET() {
  const { admin, response } = await requireAdmin(["super_admin", "support"]);
  if (!admin) return response ?? NextResponse.json({ error: "Accès administrateur requis" }, { status: 403 });

  const service = createAdminClient();
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const [paid, trials] = await Promise.all([
    readCurrentSubscriptions(service, false, today, now.toISOString()),
    readCurrentSubscriptions(service, true, today, now.toISOString()),
  ]);
  const error = paid.error ?? trials.error;
  if (error) {
    console.error("Admin active subscriptions unavailable", { code: "code" in error ? error.code : "read_failed" });
    return NextResponse.json({ error: "Abonnements en cours indisponibles." }, { status: 500 });
  }

  const rows = [...paid.rows, ...trials.rows];
  const userIds = [...new Set(rows.map((row) => row.user_id).filter((id) => typeof id === "string"))];
  const profiles: Record<string, any>[] = [];
  for (let offset = 0; offset < userIds.length; offset += PAGE_SIZE) {
    const { data, error: profileError } = await service
      .from("profiles")
      .select("id,email,full_name")
      .in("id", userIds.slice(offset, offset + PAGE_SIZE));
    if (profileError) {
      console.error("Admin active subscription profiles unavailable", { code: profileError.code ?? "unknown" });
      return NextResponse.json({ error: "Abonnements en cours indisponibles." }, { status: 500 });
    }
    profiles.push(...(data ?? []));
  }
  const profilesById = new Map(profiles.map((profile) => [profile.id, profile]));
  rows.sort((a, b) => {
    const aEnd = a.trial_active ? a.trial_ends_at : a.current_period_end;
    const bEnd = b.trial_active ? b.trial_ends_at : b.current_period_end;
    return new Date(aEnd ?? 0).getTime() - new Date(bEnd ?? 0).getTime();
  });
  return NextResponse.json({
    subscriptions: rows.map((row) => {
      const profile = profilesById.get(row.user_id);
      return {
        user_id: row.user_id,
        plan: row.plan,
        status: row.status,
        trial_active: row.trial_active,
        trial_ends_at: row.trial_ends_at,
        current_period_start: row.current_period_start,
        current_period_end: row.current_period_end,
        created_at: row.created_at,
        user: { id: row.user_id, email: profile?.email ?? null, full_name: profile?.full_name ?? null },
      };
    }),
    total: rows.length,
  });
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
