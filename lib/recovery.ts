export type RecoveryStatus =
  | "open"
  | "prepared"
  | "sent"
  | "recovered"
  | "opted_out";
export type RecoveryCase = {
  id: string;
  store_id: string;
  source_sale_id?: string | null;
  customer_name: string | null;
  phone: string;
  email?: string | null;
  customer_id?: string | null;
  product_name: string | null;
  amount: number | null;
  currency: string | null;
  abandoned_at: string;
  consent_at: string;
  consent_source: string;
  payment_url?: string | null;
  status: RecoveryStatus;
  prepared_at: string | null;
  sent_at: string | null;
  sale_id: string | null;
  attribution: "confirmed" | "estimated" | null;
};
export function normalizePhone(value: string) {
  const digits = value
    .replace(/[^\d+]/g, "")
    .replace(/^00/, "+")
    .replace(/\D/g, "");
  return digits ? `+${digits}` : "";
}
export function validHttpsUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const u = new URL(value);
    return (
      u.protocol === "https:" && !!u.hostname && !u.username && !u.password
    );
  } catch {
    return false;
  }
}
export function validRecoveryInput(x: any) {
  const phone =
    typeof x?.phone === "string"
      ? normalizePhone(x.phone).replace(/\D/g, "")
      : "";
  const abandoned =
    typeof x?.abandonedAt === "string" ? Date.parse(x.abandonedAt) : NaN;
  const consentDate = x?.consentAt == null ? NaN : Date.parse(x.consentAt);
  const amount = x?.amount == null || x.amount === "" ? null : Number(x.amount);
  return (
    phone.length >= 8 &&
    phone.length <= 15 &&
    typeof x?.consentSource === "string" &&
    x.consentSource.trim().length >= 3 &&
    Number.isFinite(abandoned) &&
    abandoned <= Date.now() &&
    (x.consentAt == null ||
      (Number.isFinite(consentDate) && consentDate <= Date.now())) &&
    validHttpsUrl(x?.paymentUrl) &&
    x?.consent === true &&
    (amount === null || (Number.isFinite(amount) && amount >= 0))
  );
}
export function recoveryDraftError(x: {
  phone?: string;
  abandonedAt?: string;
  consentSource?: string;
  paymentUrl?: string;
  consent?: boolean;
}) {
  const digits = normalizePhone(x.phone ?? "").replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15)
    return "Ajoute un numéro WhatsApp valide (8 à 15 chiffres).";
  if (!x.abandonedAt || !Number.isFinite(Date.parse(x.abandonedAt)))
    return "Indique une date d’abandon valide.";
  if (Date.parse(x.abandonedAt) > Date.now())
    return "La date d’abandon ne peut pas être dans le futur.";
  if ((x.consentSource ?? "").trim().length < 3)
    return "Indique la preuve ou la provenance du consentement (3 caractères minimum).";
  if (!validHttpsUrl(x.paymentUrl))
    return "Ajoute le lien de paiement HTTPS fourni par la boutique.";
  if (!x.consent)
    return "Confirme le consentement explicite du client avant d’enregistrer.";
  return null;
}
export function waLink(phone: string, message: string) {
  return `https://wa.me/${normalizePhone(phone).replace(/\D/g, "")}?text=${encodeURIComponent(message)}`;
}
export function recoveryMessage(
  name: string | null,
  product: string | null,
  store: string,
  paymentUrl: string,
) {
  const greet = name?.trim() ? `Bonjour ${name.trim()},` : "Bonjour,";
  return `${greet}\n\nNous nous permettons un petit message au sujet de votre achat${product ? ` de « ${product.trim()} »` : ""} sur ${store}. Il semble que le paiement n’ait pas été finalisé.\n\nSi vous souhaitez toujours en profiter, vous pouvez reprendre votre achat ici : ${paymentUrl}\n\nSi vous avez déjà réglé votre achat ou si vous n’êtes plus intéressé(e), vous pouvez simplement ignorer ce message. Merci pour votre temps et belle journée !\n\nPour ne plus recevoir de relance, répondez STOP.`;
}
export function isConfirmedChariowSaleStatus(status: unknown) {
  return ["completed", "settled"].includes(String(status ?? "").toLowerCase());
}
function safeString(...values: any[]): string {
  for (const value of values)
    if (typeof value === "string" && value.trim()) return value.trim();
  return "";
}
function identity(caseRow: RecoveryCase, s: any) {
  const p = s.raw_payload ?? {};
  const d = p.data?.sale ?? p.sale ?? p.data ?? {};
  const email = String(caseRow.email ?? "").toLowerCase();
  const phone = normalizePhone(caseRow.phone ?? "").replace(/\D/g, "");
  const customer = String(caseRow.customer_id ?? "");
  const id = safeString(
    p.customer_id,
    p.customer?.id,
    p.buyer?.id,
    d.customer_id,
    d.customer?.id,
    d.buyer?.id,
  );
  const se = safeString(
    p.email,
    p.customer?.email,
    p.buyer?.email,
    d.email,
    d.customer?.email,
    d.buyer?.email,
  ).toLowerCase();
  const sp = safeString(
    p.phone,
    p.customer?.phone,
    p.buyer?.phone,
    d.phone,
    d.customer?.phone,
    d.buyer?.phone,
  );
  return (
    (!!customer && id === customer) ||
    (!!email && se === email) ||
    (!!phone && normalizePhone(sp).replace(/\D/g, "") === phone)
  );
}
function paymentDate(s: any): number {
  const p = s.raw_payload ?? {};
  const roots = [p, p.data?.sale, p.sale, p.data].filter(Boolean);
  for (const root of roots) {
    for (const value of [
      root.completed_at,
      root.payment?.completed_at,
      root.payment?.paid_at,
      root.settled_at,
      root.settlement?.done_at,
    ]) {
      if (typeof value === "string" && Number.isFinite(Date.parse(value)))
        return Date.parse(value);
    }
  }
  return Number.isFinite(Date.parse(s.occurred_at ?? ""))
    ? Date.parse(s.occurred_at)
    : NaN;
}
export function saleMatch(caseRow: RecoveryCase, sales: any[]) {
  const afterSend = (s: any) => {
    const paidAt = paymentDate(s),
      sentAt = Date.parse(caseRow.sent_at ?? "");
    return (
      !!caseRow.sent_at &&
      Number.isFinite(paidAt) &&
      Number.isFinite(sentAt) &&
      paidAt > sentAt &&
      paidAt <= Date.now()
    );
  };
  const eligible = (s: any) =>
    afterSend(s) && isConfirmedChariowSaleStatus(s.status);
  const exact = sales.find(
    (s) =>
      eligible(s) &&
      caseRow.source_sale_id &&
      String(s.chariow_sale_id ?? "") === String(caseRow.source_sale_id),
  );
  if (exact) return { sale: exact, attribution: "confirmed" as const };
  if (!caseRow.phone && !caseRow.email && !caseRow.customer_id) return null;
  const currency =
    typeof caseRow.currency === "string"
      ? caseRow.currency.trim().toUpperCase()
      : "";
  if (
    caseRow.amount == null ||
    !Number.isFinite(Number(caseRow.amount)) ||
    !currency
  )
    return null;
  const candidates = sales.filter(
    (s) =>
      eligible(s) &&
      String(s.chariow_sale_id ?? "") !==
        String(caseRow.source_sale_id ?? "") &&
      identity(caseRow, s) &&
      typeof s.currency === "string" &&
      s.currency.trim().toUpperCase() === currency &&
      s.amount != null &&
      Number.isFinite(Number(s.amount)) &&
      Number(s.amount) === Number(caseRow.amount) &&
      (!caseRow.product_name ||
        (() => {
          const p = s.raw_payload ?? {},
            d = p.data?.sale ?? p.sale ?? p.data ?? {};
          const product = safeString(
            p.product_name,
            p.product?.name,
            p.product?.product_name,
            d.product_name,
            d.product?.name,
            d.product?.product_name,
          );
          return (
            !!product &&
            product.toLowerCase() === caseRow.product_name!.trim().toLowerCase()
          );
        })()),
  );
  return candidates.length === 1
    ? { sale: candidates[0], attribution: "estimated" as const }
    : null;
}
