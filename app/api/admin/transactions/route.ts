import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveRevenuePeriod } from "@/lib/admin-revenue-period";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 50;
const SCAN_SIZE = 1000;
const MAX_SCAN_PAGES = 100;
const VALID_STATUSES = new Set([
  "all", "approved", "completed", "pending", "failed", "cancelled",
  "canceled", "declined", "rejected", "refunded",
]);
const NO_STORE = { "Cache-Control": "private, no-store" };

type TransactionRow = {
  id: string;
  kind: "subscription" | "credits";
  user_id: string | null;
  email: string | null;
  full_name: string | null;
  amount_xof: number | null;
  credits: number | null;
  provider: string | null;
  status: string;
  is_admin_grant: boolean;
  created_at: string;
};

async function readAll(query: any): Promise<any[]> {
  const rows: any[] = [];
  for (let page = 0; page < MAX_SCAN_PAGES; page++) {
    const { data, error } = await query.range(page * SCAN_SIZE, (page + 1) * SCAN_SIZE - 1);
    if (error || !Array.isArray(data)) throw new Error("transactions_unavailable");
    rows.push(...data);
    if (data.length < SCAN_SIZE) return rows;
  }
  throw new Error("transactions_scan_limit");
}

export async function GET(request: Request) {
  const { admin, response } = await requireAdmin();
  if (!admin) {
    return response ?? NextResponse.json({ error: "Accès administrateur requis." }, { status: 403, headers: NO_STORE });
  }

  const params = new URL(request.url).searchParams;
  const period = resolveRevenuePeriod(params, new Date());
  const type = params.get("type") ?? "all";
  const status = params.get("status") ?? "all";
  const pageValue = params.get("page") ?? "1";
  if (!period) return NextResponse.json({ error: "Période invalide." }, { status: 400, headers: NO_STORE });
  if (!["all", "subscription", "credits"].includes(type)) {
    return NextResponse.json({ error: "Type de transaction invalide." }, { status: 400, headers: NO_STORE });
  }
  if (!VALID_STATUSES.has(status)) {
    return NextResponse.json({ error: "Statut invalide." }, { status: 400, headers: NO_STORE });
  }
  if (!/^\d+$/.test(pageValue) || Number(pageValue) < 1 || !Number.isSafeInteger(Number(pageValue))) {
    return NextResponse.json({ error: "Page invalide." }, { status: 400, headers: NO_STORE });
  }
  const page = Number(pageValue);

  try {
    const service = createAdminClient();
    const withinPeriod = (query: any) => {
      let q = query;
      if (period.startAt) q = q.gte("created_at", period.startAt);
      return q.lte("created_at", period.endAt).order("created_at", { ascending: false }).order("id", { ascending: false });
    };
    const [payments, purchases] = await Promise.all([
      readAll(withinPeriod(service.from("payment_events").select("id,user_id,provider,status,metadata,created_at"))),
      readAll(withinPeriod(service.from("credit_transactions").select("id,user_id,kind,credits,operation,status,metadata,created_at").eq("kind", "purchase"))),
    ]);

    const rows: TransactionRow[] = [
      ...payments.map((row): TransactionRow => ({
        id: row.id,
        kind: "subscription",
        user_id: row.user_id ?? null,
        email: null,
        full_name: null,
        amount_xof: typeof row.metadata?.amount_xof === "number" && Number.isFinite(row.metadata.amount_xof) ? row.metadata.amount_xof : null,
        credits: null,
        provider: row.provider ?? null,
        status: row.status,
        is_admin_grant: false,
        created_at: row.created_at,
      })),
      ...purchases.map((row): TransactionRow => {
        const isGrant = row.operation === "admin_grant" || row.operation === "welcome_credits" || row.metadata?.provider === "admin_grant";
        return {
          id: row.id,
          kind: "credits",
          user_id: row.user_id ?? null,
          email: null,
          full_name: null,
          amount_xof: typeof row.metadata?.amount_xof === "number" && Number.isFinite(row.metadata.amount_xof) ? row.metadata.amount_xof : null,
          credits: Number.isSafeInteger(row.credits) ? row.credits : null,
          provider: row.metadata?.provider ?? null,
          status: row.status,
          is_admin_grant: isGrant,
          created_at: row.created_at,
        };
      }),
    ];

    const userIds = [...new Set(rows.map((row) => row.user_id).filter((id): id is string => Boolean(id)))];
    const profilesById = new Map<string, { email: string | null; full_name: string | null }>();
    for (let i = 0; i < userIds.length; i += 500) {
      const { data, error } = await service.from("profiles").select("id,email,full_name").in("id", userIds.slice(i, i + 500));
      if (error || !Array.isArray(data)) throw new Error("profiles_unavailable");
      for (const profile of data) profilesById.set(profile.id, { email: profile.email ?? null, full_name: profile.full_name ?? null });
    }
    for (const row of rows) {
      const profile = row.user_id ? profilesById.get(row.user_id) : undefined;
      row.email = profile?.email ?? null;
      row.full_name = profile?.full_name ?? null;
    }

    const filtered = rows
      .filter((row) => type === "all" || row.kind === type)
      .filter((row) => status === "all" || row.status === status)
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || b.id.localeCompare(a.id));
    const start = (page - 1) * PAGE_SIZE;
    const transactions = filtered.slice(start, start + PAGE_SIZE);
    const counted = filtered.filter((row) => !row.is_admin_grant && row.amount_xof != null && (row.kind === "subscription" ? row.status === "approved" : row.status === "completed"));
    const subscriptions = counted.filter((row) => row.kind === "subscription");
    const credits = counted.filter((row) => row.kind === "credits");
    const totals = {
      subscriptions: subscriptions.length,
      credits: credits.length,
      subscription_amount_xof: subscriptions.reduce((sum, row) => sum + (row.amount_xof ?? 0), 0),
      credits_amount_xof: credits.reduce((sum, row) => sum + (row.amount_xof ?? 0), 0),
      credits_sold: credits.reduce((sum, row) => sum + (row.credits ?? 0), 0),
    };
    return NextResponse.json({ transactions, total: filtered.length, page, pageSize: PAGE_SIZE, totals: { ...totals, amount_xof: totals.subscription_amount_xof + totals.credits_amount_xof } }, { headers: NO_STORE });
  } catch {
    return NextResponse.json({ error: "Transactions indisponibles pour le moment." }, { status: 503, headers: NO_STORE });
  }
}
