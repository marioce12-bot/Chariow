import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { readAllRows } from "@/lib/admin-reads";
import { classifySubscription, type SubscriptionRow, type SubscriberState } from "@/lib/admin-subscribers";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
const MAX_ITEMS = 1000;

export async function GET() {
  const { admin, response } = await requireAdmin();
  if (!admin) return response ?? NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const service = createAdminClient();
    const now = new Date();
    const rows = await readAllRows<SubscriptionRow>(service, "subscriptions", "id,user_id,plan,status,current_period_start,current_period_end,trial_active,trial_ends_at,created_at");
    const classified = rows.map((row) => ({ row, state: classifySubscription(row, now) }));
    const counts: Record<SubscriberState, number> = { paying: 0, trial: 0, expired: 0, other: 0 };
    for (const { state } of classified) counts[state]++;
    // Abonnés en cours d'abord (fin de période la plus proche en tête), puis le reste.
    const order: Record<SubscriberState, number> = { paying: 0, trial: 1, expired: 2, other: 3 };
    const sorted = classified.sort((a, b) =>
      order[a.state] - order[b.state] ||
      (a.row.current_period_end ?? "9999").localeCompare(b.row.current_period_end ?? "9999"));
    const items = sorted.slice(0, MAX_ITEMS);
    const ids = items.map(({ row }) => row.user_id);
    const users = new Map<string, { full_name: string | null; email: string | null }>();
    for (let i = 0; i < ids.length; i += 200) {
      const { data, error } = await service.from("profiles").select("id,full_name,email").in("id", ids.slice(i, i + 200));
      if (error) throw new Error("admin_read_unavailable");
      for (const row of data ?? []) users.set(row.id, { full_name: row.full_name ?? null, email: row.email ?? null });
    }
    return NextResponse.json({
      subscribers: {
        asOf: now.toISOString(),
        counts: { ...counts, total: rows.length },
        truncated: sorted.length > MAX_ITEMS,
        items: items.map(({ row, state }) => ({
          id: row.id, user_id: row.user_id, plan: row.plan, status: row.status, state,
          current_period_start: row.current_period_start, current_period_end: row.current_period_end,
          trial_ends_at: row.trial_ends_at, user: users.get(row.user_id) ?? null,
        })),
      },
    }, { headers });
  } catch {
    return NextResponse.json({ error: "Subscribers unavailable" }, { status: 503, headers });
  }
}
