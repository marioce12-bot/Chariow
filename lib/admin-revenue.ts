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
  subscriptions: number | null; studio: number | null; total: number | null;
  subscriptionPayments: number; studioPayments: number;
  period?: { preset: string; start: string | null; end: string; startAt: string | null; endAt: string; timeZone: string };
  series?: { date: string; subscriptions: number; studio: number; total: number }[];
};
export function summarizeRevenue(payments: RevenueRow[], credits: RevenueRow[], asOf: string, recognized?: (row: RevenueRow, category: "subscriptions" | "studio") => void): RevenueSummary {
  const result: RevenueSummary = {
    currency: "XOF", asOf, firstRecordedAt: null, complete: true, unresolved: 0,
    subscriptions: 0, studio: 0, total: 0, subscriptionPayments: 0, studioPayments: 0,
  };
  const seen = new Map<string, string>();
  const unresolved = () => { result.unresolved++; result.complete = false; };
  function add(row: RevenueRow, category: "subscriptions" | "studio", provider: unknown, paymentId: unknown) {
    const meta = row.metadata ?? {};
    const amount = meta.amount_xof;
    if (provider !== "saspay" || typeof paymentId !== "string" || !paymentId.trim() ||
      typeof amount !== "number" || !Number.isSafeInteger(amount) || amount <= 0 ||
      (meta.currency !== undefined && meta.currency !== "XOF") ||
      !Number.isFinite(Date.parse(row.created_at)) || Date.parse(row.created_at) > Date.parse(asOf)) {
      unresolved(); return;
    }
    // SasPay's signed success webhook verifies XOF before recording amount_xof.
    // Use the transaction, not the webhook event id, to deduplicate re-deliveries.
    const key = `${provider}:${paymentId}`;
    const fingerprint = `${category}:${amount}`;
    if (seen.has(key)) {
      if (seen.get(key) !== fingerprint) unresolved();
      return;
    }
    seen.set(key, fingerprint);
    recognized?.(row, category);
    result[category]! += amount;
    if (!Number.isSafeInteger(result[category])) unresolved();
    if (category === "subscriptions") result.subscriptionPayments++;
    else result.studioPayments++;
    if (!result.firstRecordedAt || Date.parse(row.created_at) < Date.parse(result.firstRecordedAt)) result.firstRecordedAt = row.created_at;
  }
  for (const row of payments) {
    if (["pending", "failed", "cancelled", "canceled", "declined", "rejected"].includes(row.status)) continue;
    if (row.status !== "approved" || !row.plan) { unresolved(); continue; }
    add(row, "subscriptions", row.provider, row.transaction_id);
  }
  for (const row of credits) {
    // Usage refunds restore credits; they are not monetary refunds.
    if (row.kind === "debit") continue;
    if (row.operation === "admin_grant" || row.operation === "welcome_credits" || row.metadata?.provider === "admin_grant") continue;
    if (["pending", "failed", "cancelled", "canceled"].includes(row.status)) continue;
    // No monetary refund ledger exists today. An unexpected refund blocks the total;
    // never assume that a credit restoration is a cash refund, or guess its amount.
    if (row.kind !== "purchase" || row.operation !== "credit_purchase" || row.status !== "completed") { unresolved(); continue; }
    add(row, "studio", row.metadata?.provider, row.external_id);
  }
  if (!Number.isSafeInteger(result.subscriptions! + result.studio!)) unresolved();
  if (!result.complete) result.subscriptions = result.studio = result.total = null;
  else result.total = result.subscriptions! + result.studio!;
  return result;
}

// Separate from the overview's intentionally limited recent transaction lists.
// Stable ordering and pagination cover every recorded payment; any read failure
// or safety-cap exhaustion fails closed rather than returning a partial total.
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
  // Recognize once across the full available history through the selected end.
  // A re-delivery must retain its first recording date, even before this range.
  const verified = summarizeRevenue(payments, credits, period.endAt, (row, category) => unique.push({ row, category }));
  const selectedPeriod = { ...period };
  // Preserve the existing fail-closed policy: unknown payment/refund evidence
  // anywhere in the scanned ledger must never turn into an apparently valid zero.
  if (!verified.complete) return { ...verified, period: selectedPeriod };
  const lower = period.startAt ? Date.parse(period.startAt) : -Infinity;
  const upper = Date.parse(period.endAt);
  const uniqueInRange = unique.filter(({ row }) => Date.parse(row.created_at) >= lower && Date.parse(row.created_at) <= upper);
  const ranged = summarizeRevenue(
    uniqueInRange.filter(x => x.category === "subscriptions").map(x => x.row),
    uniqueInRange.filter(x => x.category === "studio").map(x => x.row), period.endAt,
  );
  const buckets = new Map<string, { subscriptions: number; studio: number; total: number }>();
  if (ranged.complete) {
    // Zero-fill only after both complete scans succeeded. Never add future days.
    const last = dateInTimeZone(period.endAt, period.timeZone);
    let day = period.start ?? (ranged.firstRecordedAt ? dateInTimeZone(ranged.firstRecordedAt, period.timeZone) : shiftDay(last));
    for (let count = 0; day <= last; count++, day = shiftDay(day)) {
      if (count >= 40000) throw new Error("revenue_series_limit");
      buckets.set(day, { subscriptions: 0, studio: 0, total: 0 });
    }
    // One pass over recognized unique transactions keeps chart and totals equal.
    for (const { row, category } of uniqueInRange) {
      const day = dateInTimeZone(row.created_at, period.timeZone);
      const bucket = buckets.get(day) ?? { subscriptions: 0, studio: 0, total: 0 };
      const amount = row.metadata!.amount_xof as number;
      bucket[category] += amount;
      bucket.total += amount;
      buckets.set(day, bucket);
    }
  }
  return { ...ranged, period: selectedPeriod, ...(ranged.complete ? { series: [...buckets].map(([date, values]) => ({ date, ...values })) } : {}) };
}

function shiftDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number); const x = new Date(Date.UTC(y, m - 1, d + 1));
  return `${x.getUTCFullYear().toString().padStart(4,"0")}-${String(x.getUTCMonth()+1).padStart(2,"0")}-${String(x.getUTCDate()).padStart(2,"0")}`;
}
