// Registre des transactions encaissées (abonnements + recharges de crédits Studio).
// Mêmes règles de reconnaissance que lib/admin-revenue.ts : un paiement n'est compté
// que s'il est confirmé, en XOF, avec un identifiant de transaction et un montant entier
// positif. Tout le reste est listé comme "à vérifier" mais JAMAIS ajouté aux totaux.
import { dateInTimeZone, type RevenuePeriod } from "@/lib/admin-revenue-period";

export type PaymentRow = {
  id: string; user_id: string | null; provider: string | null; transaction_id: string | null;
  plan: string | null; status: string; metadata: Record<string, unknown> | null; created_at: string;
};
export type CreditRow = {
  id: string; user_id: string | null; kind: string; operation: string | null; external_id: string | null;
  status: string; credits: number | null; metadata: Record<string, unknown> | null; created_at: string;
};
export type TransactionType = "subscription" | "credits";
export type TransactionStatus = "paid" | "pending" | "failed" | "unverified";
export type TransactionItem = {
  id: string; type: TransactionType; user_id: string | null; status: TransactionStatus;
  amount_xof: number | null; credits: number | null; provider: string | null;
  reference: string | null; plan: string | null; created_at: string;
};
export type TransactionsSummary = {
  currency: "XOF"; subscriptions_xof: number; credits_xof: number; total_xof: number;
  subscription_count: number; credit_count: number; unverified: number; pending: number; failed: number;
  free_credit_grants: number;
};
export type TransactionsResult = {
  summary: TransactionsSummary; items: TransactionItem[]; truncated: boolean;
  series: { date: string; subscriptions: number; credits: number; total: number }[];
};

const PENDING = ["pending"];
const FAILED = ["failed", "cancelled", "canceled", "declined", "rejected"];
export const TRANSACTIONS_LIST_LIMIT = 500;

function validAmount(meta: Record<string, unknown>, createdAt: string, asOf: number): number | null {
  const amount = meta.amount_xof;
  if (typeof amount !== "number" || !Number.isSafeInteger(amount) || amount <= 0) return null;
  if (meta.currency !== undefined && meta.currency !== "XOF") return null;
  const at = Date.parse(createdAt);
  if (!Number.isFinite(at) || at > asOf) return null;
  return amount;
}

export function buildTransactions(payments: PaymentRow[], credits: CreditRow[], period: Pick<RevenuePeriod, "startAt" | "endAt" | "timeZone">): TransactionsResult {
  const upper = Date.parse(period.endAt);
  const lower = period.startAt ? Date.parse(period.startAt) : -Infinity;
  const summary: TransactionsSummary = {
    currency: "XOF", subscriptions_xof: 0, credits_xof: 0, total_xof: 0,
    subscription_count: 0, credit_count: 0, unverified: 0, pending: 0, failed: 0, free_credit_grants: 0,
  };
  const all: TransactionItem[] = [];
  const seen = new Map<string, string>();
  const days = new Map<string, { subscriptions: number; credits: number; total: number }>();

  // Déduplication sur l'historique complet jusqu'à la fin de période : une
  // re-livraison de webhook garde la date de son premier enregistrement.
  function push(item: TransactionItem, dedupeKey: string | null) {
    if (dedupeKey && item.status === "paid") {
      const fingerprint = `${item.type}:${item.amount_xof}`;
      if (seen.has(dedupeKey)) {
        // Même transaction rejouée : ignorée si identique, sinon à vérifier.
        if (seen.get(dedupeKey) === fingerprint) return;
        item = { ...item, status: "unverified" };
      } else seen.set(dedupeKey, fingerprint);
    }
    const at = Date.parse(item.created_at);
    if (at < lower || at > upper) return;
    all.push(item);
    if (item.status === "paid") {
      const amount = item.amount_xof!;
      if (item.type === "subscription") { summary.subscriptions_xof += amount; summary.subscription_count++; }
      else { summary.credits_xof += amount; summary.credit_count++; }
      const day = dateInTimeZone(item.created_at, period.timeZone);
      const bucket = days.get(day) ?? { subscriptions: 0, credits: 0, total: 0 };
      bucket[item.type === "subscription" ? "subscriptions" : "credits"] += amount;
      bucket.total += amount;
      days.set(day, bucket);
    } else if (item.status === "pending") summary.pending++;
    else if (item.status === "failed") summary.failed++;
    else summary.unverified++;
  }

  const ordered = <T extends { created_at: string; id: string }>(rows: T[]) =>
    [...rows].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || a.id.localeCompare(b.id));

  for (const row of ordered(payments)) {
    if (!row.plan) continue; // événement de paiement sans offre : pas un abonnement
    const meta = row.metadata ?? {};
    const base = { id: row.id, type: "subscription" as const, user_id: row.user_id, credits: null, provider: row.provider, reference: row.transaction_id, plan: row.plan, created_at: row.created_at };
    if (PENDING.includes(row.status)) { push({ ...base, status: "pending", amount_xof: typeof meta.amount_xof === "number" ? meta.amount_xof : null }, null); continue; }
    if (FAILED.includes(row.status)) { push({ ...base, status: "failed", amount_xof: typeof meta.amount_xof === "number" ? meta.amount_xof : null }, null); continue; }
    const amount = validAmount(meta, row.created_at, upper);
    const ok = row.status === "approved" && row.provider === "saspay" && !!row.transaction_id?.trim() && amount !== null;
    push({ ...base, status: ok ? "paid" : "unverified", amount_xof: amount ?? (typeof meta.amount_xof === "number" ? meta.amount_xof : null) }, ok ? `saspay:${row.transaction_id}` : null);
  }

  for (const row of ordered(credits)) {
    if (row.kind === "debit") continue; // consommation de crédits, pas un encaissement
    const meta = row.metadata ?? {};
    if (row.operation === "admin_grant" || row.operation === "welcome_credits" || meta.provider === "admin_grant") {
      const at = Date.parse(row.created_at);
      if (at >= lower && at <= upper) summary.free_credit_grants++;
      continue;
    }
    const provider = typeof meta.provider === "string" ? meta.provider : null;
    const base = { id: row.id, type: "credits" as const, user_id: row.user_id, credits: row.credits, provider, reference: row.external_id, plan: null, created_at: row.created_at };
    const rawAmount = typeof meta.amount_xof === "number" ? meta.amount_xof : null;
    if (PENDING.includes(row.status)) { push({ ...base, status: "pending", amount_xof: rawAmount }, null); continue; }
    if (FAILED.includes(row.status)) { push({ ...base, status: "failed", amount_xof: rawAmount }, null); continue; }
    const amount = validAmount(meta, row.created_at, upper);
    const ok = row.kind === "purchase" && row.operation === "credit_purchase" && row.status === "completed" && provider === "saspay" && !!row.external_id?.trim() && amount !== null;
    push({ ...base, status: ok ? "paid" : "unverified", amount_xof: amount ?? rawAmount }, ok ? `saspay:${row.external_id}` : null);
  }

  summary.total_xof = summary.subscriptions_xof + summary.credits_xof;
  const sorted = all.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || b.id.localeCompare(a.id));
  const series = [...days].sort(([a], [b]) => a.localeCompare(b)).map(([date, v]) => ({ date, ...v }));
  return { summary, items: sorted.slice(0, TRANSACTIONS_LIST_LIMIT), truncated: sorted.length > TRANSACTIONS_LIST_LIMIT, series };
}
