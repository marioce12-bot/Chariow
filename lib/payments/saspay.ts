const endpoint = "https://api.saspay.me/api/v1";

const plans = { starter: 5000, pro: 9000 } as const;
export type PaidPlan = keyof typeof plans;

export function planAmount(plan: PaidPlan) { return plans[plan]; }

async function saspayRequest<T>(path: string, init: RequestInit = {}) {
  const key = process.env.SASPAY_API_KEY;
  if (!key) throw new Error("SASPAY_API_KEY is not configured");
  const response = await fetch(`${endpoint}${path}`, { ...init, headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(init.headers || {}) }, cache: "no-store", signal: AbortSignal.timeout(20_000) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || (data && typeof data === "object" && "success" in data && data.success === false)) throw new Error(`SasPay ${response.status}: ${JSON.stringify(data)}`);
  if (path === "/checkout-sessions/") {
    const record = data && typeof data === "object" ? data as Record<string, unknown> : {};
    const nested = record.data && typeof record.data === "object" ? record.data as Record<string, unknown> : null;
    console.info("SasPay checkout response diagnostic", {
      status: response.status,
      topLevelKeys: Object.keys(record),
      nestedDataKeys: nested ? Object.keys(nested) : [],
      hasCheckoutUrl: typeof record.checkout_url === "string" || typeof nested?.checkout_url === "string",
      hasId: typeof record.id === "string" || typeof nested?.id === "string",
    });
  }
  return data as T;
}

type SasPayCheckout = {
  id?: string;
  checkout_url?: string;
  status?: string;
  amount?: string | number;
  currency?: string;
  metadata?: { userId?: string; plan?: PaidPlan };
};

type SasPayTransaction = {
  id?: string;
  status?: string;
  amount?: string | number;
  currency?: string;
};

export async function createPayment(plan: PaidPlan, customer: { email?: string; name?: string }, metadata: { userId: string; plan: PaidPlan }) {
  const returnUrl = process.env.NEXT_PUBLIC_APP_URL ? `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?payment=success` : undefined;
  const checkout = await saspayRequest<SasPayCheckout>("/checkout-sessions/", { method: "POST", body: JSON.stringify({ amount: planAmount(plan).toFixed(2), currency: "XOF", description: `Vendeo ${plan === "pro" ? "Pro" : "Starter"} - abonnement mensuel`, customer_email: customer.email, customer_name: customer.name || "Créateur", return_url: returnUrl, metadata }) });
  if (!checkout.id || !checkout.checkout_url) throw new Error("SasPay did not return a checkout session URL");
  return {
    id: checkout.id,
    url: checkout.checkout_url,
  };
}

export async function getCheckoutSession(id: string) {
  return saspayRequest<SasPayCheckout>(`/checkout-sessions/${encodeURIComponent(id)}/`, { method: "GET" });
}

export async function getTransaction(id: string) {
  return saspayRequest<SasPayTransaction>(`/transactions/${encodeURIComponent(id)}/`, { method: "GET" });
}
