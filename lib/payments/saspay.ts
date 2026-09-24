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
  metadata?: { userId?: string; plan?: PaidPlan; type?: string; campaignId?: string; credits?: number };
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

/**
 * Paiement pour le lancement d'une campagne pub (wizard 5 étapes).
 * `amount` est le montant BRUT (budget pub net / 0.98, cf. /api/ad-campaigns/estimate) :
 * 98% finance la campagne, 2% est la commission Vendeo.
 */
export async function createAdCampaignPayment(
  amount: number,
  customer: { email?: string; name?: string },
  metadata: { userId: string; campaignId: string },
) {
  const returnUrl = process.env.NEXT_PUBLIC_APP_URL
    ? `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?ad_payment=success&campaign=${metadata.campaignId}`
    : undefined;
  const response = await saspayRequest<{ data?: SasPayCheckout }>("/checkout-sessions/", {
    method: "POST",
    body: JSON.stringify({
      amount: amount.toFixed(2),
      currency: "XOF",
      description: "Vendeo - Lancement de campagne publicitaire",
      customer_email: customer.email,
      customer_name: customer.name || "Créateur",
      return_url: returnUrl,
      metadata: { ...metadata, type: "ad_campaign" },
    }),
  });
  const checkout = response.data;
  if (!checkout?.id || !checkout.checkout_url) throw new Error("SasPay did not return a checkout session URL");
  return { id: checkout.id, url: checkout.checkout_url };
}

/**
 * Retrait du solde publicitaire vers le mobile money de l'utilisateur (payout SasPay).
 * - `Idempotency-Key` = id du retrait : un retry réseau ne peut jamais envoyer l'argent deux fois.
 * - `fee_charge_mode: DEDUCTED` : les frais d'opérateur sont déduits du montant reçu par
 *   l'utilisateur, jamais payés par Vendeo.
 * Prérequis côté SasPay : clé API avec le scope PAYOUT (ou BOTH), IP du serveur whitelistée,
 * retraits activés pour le marchand.
 */
export async function createPayout(input: {
  amount: number;
  msisdn: string;
  network: string;
  idempotencyKey: string;
  customer: { email?: string; name?: string };
  metadata: { type: "ad_balance_withdrawal"; withdrawalId: string; userId: string };
}) {
  const [firstName, ...rest] = (input.customer.name || "Créateur").trim().split(/\s+/);
  const response = await saspayRequest<{ id?: string; message?: string }>("/payouts/initialize/", {
    method: "POST",
    headers: { "Idempotency-Key": input.idempotencyKey },
    body: JSON.stringify({
      amount: input.amount.toFixed(2),
      currency: "XOF",
      country: "BJ",
      description: "Vendeo - Retrait du solde publicitaire",
      customer: { email: input.customer.email, first_name: firstName, last_name: rest.join(" ") || firstName },
      method: input.network,
      recipient: { msisdn: input.msisdn },
      fee_charge_mode: "DEDUCTED",
      metadata: input.metadata,
    }),
  });
  if (!response.id) throw Object.assign(new Error("SasPay did not return a payout id"), { status: 502 });
  return { id: response.id };
}

export async function getPayoutStatus(id: string) {
  return saspayRequest<{ id?: string; status?: string }>(`/payouts/${encodeURIComponent(id)}/verify/`, { method: "GET" });
}

export async function getCheckoutSession(id: string) {
  return saspayRequest<SasPayCheckout>(`/checkout-sessions/${encodeURIComponent(id)}/`, { method: "GET" });
}

export async function getTransaction(id: string) {
  return saspayRequest<SasPayTransaction>(`/transactions/${encodeURIComponent(id)}/`, { method: "GET" });
}
