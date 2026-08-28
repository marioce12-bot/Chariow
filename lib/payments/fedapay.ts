const endpoint = () => `${process.env.FEDAPAY_ENVIRONMENT === "live" ? "https://api.fedapay.com" : "https://sandbox-api.fedapay.com"}/v1`;

const plans = { starter: 3000, pro: 5000 } as const;
export type PaidPlan = keyof typeof plans;

export function planAmount(plan: PaidPlan) { return plans[plan]; }

async function fedapayRequest<T>(path: string, init: RequestInit = {}) {
  const key = process.env.FEDAPAY_SECRET_KEY;
  if (!key) throw new Error("FEDAPAY_SECRET_KEY is not configured");
  const response = await fetch(`${endpoint()}${path}`, { ...init, headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(init.headers || {}) }, cache: "no-store", signal: AbortSignal.timeout(20_000) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`FedaPay ${response.status}: ${JSON.stringify(data)}`);
  return data as T;
}

type AnyRecord = Record<string, unknown>;

type TransactionResponse = AnyRecord & {
  v1?: { id?: number; reference?: string; status?: string; payment_url?: string };
  id?: number;
  reference?: string;
  status?: string;
};
type TokenResponse = { token?: string; url?: string };

type FedaPayTransaction = {
  id?: number;
  status?: string;
  amount?: number;
  currency?: { iso?: string };
  custom_metadata?: { userId?: string; plan?: PaidPlan };
};

export async function createPayment(plan: PaidPlan, customer: { email?: string; name?: string }, metadata: { userId: string; plan: PaidPlan }) {
  const callbackUrl = process.env.NEXT_PUBLIC_APP_URL ? `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?payment=success` : undefined;
  const transaction = await fedapayRequest<TransactionResponse>("/transactions", { method: "POST", body: JSON.stringify({ description: `Vendeo ${plan === "pro" ? "Pro" : "Starter"} - abonnement mensuel`, amount: planAmount(plan), currency: { iso: "XOF" }, callback_url: callbackUrl, custom_metadata: metadata, customer: { email: customer.email, firstname: customer.name || "Créateur" } }) });
  const keys = transaction && typeof transaction === "object" ? Object.keys(transaction) : [];
  // Diagnostic limité (pas de body brut, pas de secrets)
  console.info("FedaPay /transactions response keys", keys);

  const tx = transaction as AnyRecord;
  const data = (tx?.data && typeof tx.data === "object" ? tx.data as AnyRecord : undefined) as AnyRecord | undefined;
  const v1 = (tx?.v1 && typeof tx.v1 === "object" ? tx.v1 as AnyRecord : undefined) as AnyRecord | undefined;
  const v1Transaction = (tx?.["v1/transaction"] && typeof tx["v1/transaction"] === "object" ? tx["v1/transaction"] as AnyRecord : undefined) as AnyRecord | undefined;
  const idSource = v1Transaction ?? v1;

  const extractedId =
    (typeof tx.id === "number" ? tx.id : null) ||
    (idSource && typeof idSource.id === "number" ? idSource.id : null) ||
    (typeof tx.transaction_id === "number" ? tx.transaction_id : null) ||
    (typeof tx.transactionId === "number" ? tx.transactionId : null) ||
    (data && typeof data.id === "number" ? data.id : null);

  if (!extractedId) {
    // On tente aussi de récupérer un id numérique depuis des chemins courants
    const candidate = (v1 && typeof v1.id !== "undefined" ? v1.id : tx.id) as unknown;
    throw new Error(`FedaPay did not return a transaction id (candidate type: ${typeof candidate})`);
  }

  const payment = await fedapayRequest<AnyRecord>(`/transactions/${extractedId}/token`, { method: "POST" });
  const p = payment as AnyRecord;
  const pV1 = (p?.v1 && typeof p.v1 === "object" ? p.v1 as AnyRecord : undefined) as AnyRecord | undefined;
  const pV1Token = (p?.["v1/token"] && typeof p["v1/token"] === "object" ? p["v1/token"] as AnyRecord : undefined) as AnyRecord | undefined;
  const paymentUrl =
    (typeof p.url === "string" ? p.url : null) ||
    (typeof p.payment_url === "string" ? p.payment_url : null) ||
    (pV1 && typeof pV1.url === "string" ? pV1.url : null) ||
    (pV1Token && typeof pV1Token.url === "string" ? pV1Token.url : null);
  if (!paymentUrl) throw new Error("FedaPay did not return a payment URL");

  return {
    id: extractedId,
    reference:
      (typeof tx.reference === "string" ? tx.reference : null) ||
      (idSource && typeof idSource.reference === "string" ? idSource.reference : null) ||
      (v1Transaction && typeof v1Transaction.reference === "string" ? v1Transaction.reference : null) ||
      null,
    url: paymentUrl,
  };
}

export async function getTransaction(id: number) {
  return fedapayRequest<FedaPayTransaction>(`/transactions/${id}`, { method: "GET" });
}
