import { PLAN_CONFIG, type PlanId } from "@/lib/plans";

const endpoint = "https://api.saspay.me/api/v1";

export type PaidPlan = PlanId;

export function planAmount(plan: PaidPlan) { return PLAN_CONFIG[plan].amount; }
function planLabel(plan: PaidPlan) { return PLAN_CONFIG[plan].label; }

async function saspayRequest<T>(path: string, init: RequestInit = {}) {
  const key = process.env.SASPAY_API_KEY;
  if (!key) throw new Error("SASPAY_API_KEY is not configured");
  const response = await fetch(`${endpoint}${path}`, { ...init, headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(init.headers || {}) }, cache: "no-store", signal: AbortSignal.timeout(20_000) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || (data && typeof data === "object" && "success" in data && data.success === false)) {
    // Le statut HTTP est exposé pour que l'appelant distingue un refus définitif (4xx)
    // d'un échec ambigu (5xx/timeout) — indispensable pour les retraits.
    throw Object.assign(new Error(`SasPay ${response.status}: ${JSON.stringify(data)}`), { status: response.ok ? 422 : response.status });
  }
  return data as T;
}

type SasPayCheckout = {
  id?: string;
  checkout_url?: string;
  status?: string;
  amount?: string | number;
  currency?: string;
  metadata?: { userId?: string; plan?: PaidPlan; type?: string; credits?: number };
};

type SasPayTransaction = {
  id?: string;
  status?: string;
  amount?: string | number;
  currency?: string;
};

export async function createPayment(plan: PaidPlan, customer: { email?: string; name?: string }, metadata: { userId: string; plan: PaidPlan }) {
  const returnUrl = process.env.NEXT_PUBLIC_APP_URL ? `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?payment=success` : undefined;
  const periodLabel = "mensuel";
  const response = await saspayRequest<{ data?: SasPayCheckout }>("/checkout-sessions/", { method: "POST", body: JSON.stringify({ amount: planAmount(plan).toFixed(2), currency: "XOF", description: `Vendeo ${planLabel(plan)} - abonnement ${periodLabel}`, customer_email: customer.email, customer_name: customer.name || "Créateur", return_url: returnUrl, metadata }) });
  const checkout = response.data;
  if (!checkout?.id || !checkout.checkout_url) throw new Error("SasPay did not return a checkout session URL");
  return {
    id: checkout.id,
    url: checkout.checkout_url,
  };
}

export async function createCreditsPayment(credits: number, amount: number, customer: { email?: string; name?: string }, metadata: { userId: string; credits: number }) {
  const returnUrl = process.env.NEXT_PUBLIC_APP_URL ? `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?credits=success` : undefined;
  const response = await saspayRequest<{ data?: SasPayCheckout }>("/checkout-sessions/", { method: "POST", body: JSON.stringify({ amount: amount.toFixed(2), currency: "XOF", description: `Vendeo - Recharge de ${credits} crédits Studio`, customer_email: customer.email, customer_name: customer.name || "Créateur", return_url: returnUrl, metadata: { ...metadata, type: "studio_credits" } }) });
  const checkout = response.data;
  if (!checkout?.id || !checkout.checkout_url) throw new Error("SasPay did not return a checkout session URL");
  return { id: checkout.id, url: checkout.checkout_url };
}

export async function getCheckoutSession(id: string) {
  return saspayRequest<SasPayCheckout>(`/checkout-sessions/${encodeURIComponent(id)}/`, { method: "GET" });
}

export async function getTransaction(id: string) {
  return saspayRequest<SasPayTransaction>(`/transactions/${encodeURIComponent(id)}/`, { method: "GET" });
}
