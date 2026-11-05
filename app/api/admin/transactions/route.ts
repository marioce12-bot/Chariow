import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveRevenuePeriod } from "@/lib/admin-revenue-period";
import { readAllRows } from "@/lib/admin-reads";
import { buildTransactions, type CreditRow, type PaymentRow } from "@/lib/admin-transactions";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  const { admin, response } = await requireAdmin();
  if (!admin) return response ?? NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const params = new URL(request.url).searchParams;
  const asOf = new Date();
  const period = resolveRevenuePeriod(params, asOf);
  if (!period) return NextResponse.json({ error: "Invalid period" }, { status: 400, headers });
  try {
    const service = createAdminClient();
    const [payments, credits] = await Promise.all([
      readAllRows<PaymentRow>(service, "payment_events", "id,user_id,provider,transaction_id,plan,status,metadata,created_at", { endAt: period.endAt }),
      readAllRows<CreditRow>(service, "credit_transactions", "id,user_id,kind,operation,external_id,status,credits,metadata,created_at", {
        endAt: period.endAt,
        filter: (query) => query.in("kind", ["purchase", "refund"]),
      }),
    ]);
    const result = buildTransactions(payments, credits, period);
    const ids = [...new Set(result.items.map((item) => item.user_id).filter((id): id is string => !!id))];
    const users = new Map<string, { full_name: string | null; email: string | null }>();
    for (let i = 0; i < ids.length; i += 200) {
      const { data, error } = await service.from("profiles").select("id,full_name,email").in("id", ids.slice(i, i + 200));
      if (error) throw new Error("admin_read_unavailable");
      for (const row of data ?? []) users.set(row.id, { full_name: row.full_name ?? null, email: row.email ?? null });
    }
    return NextResponse.json({
      transactions: {
        ...result,
        period: { preset: period.preset, start: period.start, end: period.end, timeZone: period.timeZone, startAt: period.startAt, endAt: period.endAt },
        asOf: asOf.toISOString(),
        items: result.items.map((item) => ({ ...item, user: item.user_id ? users.get(item.user_id) ?? null : null })),
      },
    }, { headers });
  } catch {
    return NextResponse.json({ error: "Transactions unavailable" }, { status: 503, headers });
  }
}
