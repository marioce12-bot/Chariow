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

type TransactionResponse = { v1?: { id?: number; reference?: string; status?: string; payment_url?: string }; id?: number; reference?: string; status?: string };
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
  const id = transaction.id || transaction.v1?.id;
  if (!id) throw new Error("FedaPay did not return a transaction id");
  const payment = await fedapayRequest<TokenResponse>(`/transactions/${id}/token`, { method: "POST" });
  if (!payment.url) throw new Error("FedaPay did not return a payment URL");
  return { id, reference: transaction.reference || transaction.v1?.reference, url: payment.url };
}

export async function getTransaction(id: number) {
  return fedapayRequest<FedaPayTransaction>(`/transactions/${id}`, { method: "GET" });
}
