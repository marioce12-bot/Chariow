// Read-only revenue recognition. Never infer payments from plans or credit balances.
import { dateInTimeZone, type RevenuePeriod } from "@/lib/admin-revenue-period";
export type RevenueRow = {
  id: string; created_at: string; status: string; provider?: string;
  transaction_id?: string | null; plan?: string | null;
  kind?: string; operation?: string | null; external_id?: string | null;
  metadata?: Record<string, unknown> | null;
};
export type RevenueSummary = {
  currency: "XOF"; asOf: string; firstRecordedAt: string | null;
  complete: boolean; unresolved: number;
  unresolvedSamples: { table: "payment_events" | "credit_transactions"; id: string; reason: string }[];
  subscriptions: number | null; studio: number | null; total: number | null;
  subscriptionPayments: number; studioPayments: number;
  period?: { preset: string; start: string | null; end: string; startAt: string | null; endAt: string; timeZone: string };
  series?: { date: string; subscriptions: number; studio: number; total: number }[];
};
export function summarizeRevenue(payments: RevenueRow[], credits: RevenueRow[], asOf: string, recognized?: (row: RevenueRow, category: "subscriptions" | "studio") => void): RevenueSummary {
  const result: RevenueSummary = {
    currency: "XOF", asOf, firstRecordedAt: null, complete: true, unresolved: 0, unresolvedSamples: [],
    subscriptions: 0, studio: 0, total: 0, subscriptionPayments: 0, studioPayments: 0,
  };
  const seen = new Map<string, string>();
  const unresolved = (row: RevenueRow, table: "payment_events" | "credit_transactions", reason: string) => {
    result.unresolved++;
    result.complete = false;
    if (result.unresolvedSamples.length < 20) result.unresolvedSamples.push({ table, id: row.id, reason });
  };
  function add(row: RevenueRow, category: "subscriptions" | "studio", provider: unknown, paymentId: unknown, table: "payment_events" | "credit_transactions") {
    const meta = row.metadata ?? {};
    const amount = meta.amount_xof;
    if (provider !== "saspay" || typeof paymentId !== "string" || !paymentId.trim() || typeof amount !== "number" || !Number.isSafeInteger(amount) || amount <= 0 || (meta.currency !== undefined && meta.currency !== "XOF") || !Number.isFinite(Date.parse(row.created_at)) || Date.parse(row.created_at) > Date.parse(asOf)) {
      const reason = provider !== "saspay" ? "provider_not_saspay" : typeof paymentId !== "string" || !paymentId.trim() ? "missing_transaction_id" : typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0 ? "missing_or_nonpositive_amount_xof" : meta.currency !== undefined && meta.currency !== "XOF" ? "unexpected_currency" : "invalid_or_future_created_at";
      unresolved(row, table, reason); return;
    }
    const key = `${provider}:${paymentId}`;
    const fingerprint = `${category}:${amount}`;
    if (seen.has(key)) { if (seen.get(key) !== fingerprint) unresolved(row, table, "conflicting_duplicate_transaction"); return; }
    seen.set(key, fingerprint);
    recognized?.(row, category);
    result[category]! += amount;
    if (!Number.isSafeInteger(result[category])) unresolved(row, table, "amount_overflow");
    if (category === "subscriptions") result.subscriptionPayments++; else result.studioPayments++;
    if (!result.firstRecordedAt || Date.parse(row.created_at) < Date.parse(result.firstRecordedAt)) result.firstRecordedAt = row.created_at;
  }
  for (const row of payments) {
    if (["pending", "failed", "cancelled", "canceled", "declined", "rejected"].includes(row.status)) continue;
    if (row.status !== "approved" || !row.plan) { unresolved(row, "payment_events", "unexpected_status_or_missing_plan"); continue; }
    add(row, "subscriptions", row.provider, row.transaction_id, "payment_events");
  }
  for (const row of credits) {
    if (row.kind === "debit") continue;
    if (row.operation === "admin_grant" || row.operation === "welcome_credits" || row.metadata?.provider === "admin_grant") continue;
    if (["pending", "failed", "cancelled", "canceled"].includes(row.status)) continue;
    if (row.kind !== "purchase" || row.operation !== "credit_purchase" || row.status !== "completed") { unresolved(row, "credit_transactions", "unexpected_credit_kind_operation_or_status"); continue; }
    add(row, "studio", row.metadata?.provider, row.external_id, "credit_transactions");
  }
  if (!Number.isSafeInteger(result.subscriptions! + result.studio!)) { result.complete = false; result.unresolved++; }
  if (!result.complete) result.subscriptions = result.studio = result.total = null;
  else result.total = result.subscriptions! + result.studio!;
  return result;
}

// Stable, paginated scans cover every recorded payment; read errors and safety-cap exhaustion fail closed.
export async function readRevenue(service: any, asOf = new Date().toISOString(), period?: RevenuePeriod): Promise<RevenueSummary> {
  async function read(table: string, columns: string, credit = false): Promise<RevenueRow[]> {
    const rows: RevenueRow[] = [];
    const size = 1000;
    for (let page = 0; page < 100; page++) {
      let query = service.from(table).select(columns).lte("created_at", period?.endAt ?? asOf).order("created_at", { ascending: true }).order("id", { ascending: true });
      if (credit) query = query.in("kind", ["purchase", "refund"]);
      const { data, error } = await query.range(page * size, (page + 1) * size - 1);
      if (error || !Array.isArray(data)) throw new Error("revenue_unavailable");
      rows.push(...data);
      if (data.length < size) return rows;
    }
    throw new Error("revenue_scan_limit");
  }
  const [payments, credits] = await Promise.all([
    read("payment_events", "id,provider,transaction_id,plan,status,metadata,created_at"),
    read("credit_transactions", "id,kind,operation,external_id,status,metadata,created_at", true),
  ]);
  if (!period) return summarizeRevenue(payments, credits, asOf);
  const unique: { row: RevenueRow; category: "subscriptions" | "studio" }[] = [];
  const verified = summarizeRevenue(payments, credits, period.endAt, (row, category) => unique.push({ row, category }));
  const selectedPeriod = { ...period };
  if (!verified.complete) return { ...verified, period: selectedPeriod };
  const lower = period.startAt ? Date.parse(period.startAt) : -Infinity;
  const upper = Date.parse(period.endAt);
  const uniqueInRange = unique.filter(({ row }) => Date.parse(row.created_at) >= lower && Date.parse(row.created_at) <= upper);
  const ranged = summarizeRevenue(uniqueInRange.filter(x => x.category === "subscriptions").map(x => x.row), uniqueInRange.filter(x => x.category === "studio").map(x => x.row), period.endAt);
  const buckets = new Map<string, { subscriptions: number; studio: number; total: number }>();
  if (ranged.complete) {
    const last = dateInTimeZone(period.endAt, period.timeZone);
    let day = period.start ?? (ranged.firstRecordedAt ? dateInTimeZone(ranged.firstRecordedAt, period.timeZone) : shiftDay(last));
    for (let count = 0; day <= last; count++, day = shiftDay(day)) {
      if (count >= 40000) throw new Error("revenue_series_limit");
      buckets.set(day, { subscriptions: 0, studio: 0, total: 0 });
    }
    for (const { row, category } of uniqueInRange) {
      const day = dateInTimeZone(row.created_at, period.timeZone);
      const bucket = buckets.get(day) ?? { subscriptions: 0, studio: 0, total: 0 };
      const amount = row.metadata!.amount_xof as number;
      bucket[category] += amount; bucket.total += amount; buckets.set(day, bucket);
    }
  }
  return { ...ranged, period: selectedPeriod, ...(ranged.complete ? { series: [...buckets].map(([date, values]) => ({ date, ...values })) } : {}) };
}
function shiftDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number); const x = new Date(Date.UTC(y, m - 1, d + 1));
  return `${x.getUTCFullYear().toString().padStart(4,"0")}-${String(x.getUTCMonth()+1).padStart(2,"0")}-${String(x.getUTCDate()).padStart(2,"0")}`;
}
