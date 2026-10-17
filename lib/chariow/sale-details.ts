/**
 * Détails d'un événement Chariow (vente, paiement échoué, achat abandonné…) pour la
 * fenêtre « Détail » du tableau de bord.
 *
 * La liste publique (publicSaleSummary) ne garde que statut / montant / date / produit.
 * Ici on aplatit l'événement brut envoyé par Chariow en paires libellé → valeur lisibles,
 * en retirant tout ce qui ressemble à un secret (jeton, mot de passe, signature…).
 * La route /api/analytics est authentifiée et ne renvoie que les ventes de la boutique
 * de l'utilisateur connecté : ces informations ne sont visibles que par le propriétaire.
 */

export type SaleDetail = { label: string; value: string };

/** Les seules infos affichées dans la fenêtre « Détail de l'événement ». */
export type SaleContact = {
  name: string | null;
  email: string | null;
  phone: string | null;
  country: string | null;
  failureReason: string | null;
};

const SECRET_KEY = /token|secret|password|passwd|signature|authorization|api[_-]?key|credential/i;
const SKIP_KEY = /^(links?|_links|meta|__typename)$/i;

const LABELS: Record<string, string> = {
  id: "Identifiant",
  uuid: "Identifiant",
  reference: "Référence",
  status: "Statut",
  state: "Statut",
  amount: "Montant",
  currency: "Devise",
  created_at: "Créé le",
  createdat: "Créé le",
  occurred_at: "Date de l'événement",
  updated_at: "Mis à jour le",
  completed_at: "Terminé le",
  settled_at: "Réglé le",
  product_name: "Produit",
  name: "Nom",
  full_name: "Nom complet",
  first_name: "Prénom",
  last_name: "Nom de famille",
  email: "E-mail",
  phone: "Téléphone",
  phone_number: "Téléphone",
  country: "Pays",
  city: "Ville",
  payment_method: "Moyen de paiement",
  method: "Moyen de paiement",
  gateway: "Passerelle de paiement",
  provider: "Fournisseur",
  discount: "Réduction",
  coupon: "Code promo",
  quantity: "Quantité",
  type: "Type",
  fee: "Frais",
  fees: "Frais",
  net_amount: "Montant net",
  failure_reason: "Motif d'échec",
  failure_message: "Motif d'échec",
  reason: "Motif",
  message: "Message",
};

function humanize(key: string): string {
  const spaced = key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").trim();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : key;
}

function prettify(path: string[]): string {
  const last = path[path.length - 1] ?? "";
  const known = LABELS[last.toLowerCase()];
  const parent = path.length > 1 ? path[path.length - 2] : "";
  const parentLabel = parent ? (LABELS[parent.toLowerCase()] ?? humanize(parent)) : "";
  if (known) {
    if (parent && !["data", "attributes"].includes(parent.toLowerCase())) return `${parentLabel} · ${known}`;
    return known;
  }
  return path.slice(-2).map(humanize).join(" · ");
}

function isDateKey(key: string): boolean {
  return /(_at|At|date|Date)$/.test(key);
}

function formatScalar(key: string, value: string | number | boolean): string {
  if (typeof value === "boolean") return value ? "Oui" : "Non";
  if (typeof value === "string") {
    if (isDateKey(key) && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) return `${date.toLocaleString("fr-FR", { timeZone: "UTC" })} (UTC)`;
    }
    return value.length > 300 ? `${value.slice(0, 299)}…` : value;
  }
  return String(value);
}

function push(path: string[], value: string, out: SaleDetail[], seen: Set<string>) {
  const label = prettify(path.filter((part) => !/^\d+$/.test(part)));
  const signature = `${label}|${value}`;
  if (seen.has(signature)) return;
  seen.add(signature);
  out.push({ label, value });
}

function walk(value: unknown, path: string[], out: SaleDetail[], seen: Set<string>, depth: number) {
  if (out.length >= 40 || value === null || value === undefined) return;
  const key = path[path.length - 1] ?? "";
  if (SECRET_KEY.test(key) || SKIP_KEY.test(key)) return;

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    if (typeof value === "string" && !value.trim()) return;
    push(path, formatScalar(key, value), out, seen);
    return;
  }

  if (Array.isArray(value)) {
    const scalars = value.filter((item) => typeof item === "string" || typeof item === "number");
    if (scalars.length && scalars.length === value.length) {
      push(path, scalars.join(", "), out, seen);
      return;
    }
    if (depth >= 3) return;
    value.slice(0, 5).forEach((item, index) => walk(item, [...path, String(index + 1)], out, seen, depth + 1));
    return;
  }

  if (typeof value === "object") {
    const object = value as Record<string, unknown>;
    // Montant Chariow : { value, formatted, short, currency } → on affiche la forme lisible.
    if (typeof object.formatted === "string" && object.formatted.trim()) {
      push(path, object.formatted, out, seen);
      return;
    }
    if (depth >= 3) return;
    for (const [childKey, childValue] of Object.entries(object)) {
      walk(childValue, [...path, childKey], out, seen, depth + 1);
    }
  }
}

export function buildSaleDetails(rawSale: unknown): SaleDetail[] {
  if (!rawSale || typeof rawSale !== "object" || Array.isArray(rawSale)) return [];
  const out: SaleDetail[] = [];
  const seen = new Set<string>();
  for (const [key, value] of Object.entries(rawSale as Record<string, unknown>)) {
    walk(value, [key], out, seen, 0);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Infos utiles uniquement : client, e-mail, téléphone, pays, motif d'échec.
// (la date et l'heure viennent de la vente elle-même, côté interface)
// ---------------------------------------------------------------------------

type Rec = Record<string, unknown>;

function asRec(value: unknown): Rec | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Rec) : null;
}

function text(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  const object = asRec(value);
  if (object) {
    for (const key of ["formatted", "full", "number", "name", "label", "value"]) {
      const found = text(object[key]);
      if (found) return found;
    }
  }
  return null;
}

function phoneText(value: unknown): string | null {
  const object = asRec(value);
  if (!object) return text(value);
  const whole = text(object.formatted) ?? text(object.full);
  if (whole) return whole;
  const number = text(object.number) ?? text(object.national);
  if (!number) return null;
  const country = asRec(object.country);
  const code = text(object.dial_code) ?? text(object.country_code) ?? text(object.prefix) ?? text(country?.dial_code);
  if (!code || number.startsWith("+")) return number;
  const digits = number.replace(/\D/g, "");
  const countryDigits = code.replace(/\D/g, "");
  // Chariow's phone.number already includes the country code without '+'.
  if (countryDigits && digits.startsWith(countryDigits)) return `+${digits}`;
  return `${code.startsWith("+") ? code : `+${code}`} ${number}`;
}

function countryText(value: unknown): string | null {
  const object = asRec(value);
  if (!object) return text(value);
  // Chariow may serialize country as an object (often {code, name}); favor
  // the readable name, but keep an explicit ISO/code as useful fallback.
  return text(object.name) ?? text(object.label) ?? text(object.formatted)
    ?? text(object.code) ?? text(object.iso_code) ?? text(object.isoCode)
    ?? text(object.country_code) ?? text(object.countryCode) ?? text(object.value);
}

function firstOf(sources: Rec[], keys: string[], read: (value: unknown) => string | null = text): string | null {
  for (const source of sources) {
    for (const key of keys) {
      const found = read(source[key]);
      if (found) return found;
    }
  }
  return null;
}

const FAILURE_FR: Record<string, string> = {
  CUSTOMER_CANCEL_TRANSACTION: "Le client a annulé la transaction.",
};

export function buildSaleContact(rawSale: unknown): SaleContact {
  const raw = asRec(rawSale);
  if (!raw) return { name: null, email: null, phone: null, country: null, failureReason: null };

  const people = [raw.customer, raw.buyer, raw.client, raw.billing, raw.billing_details, raw.contact, raw.user]
    .map(asRec)
    .filter((item): item is Rec => item !== null);
  const addresses = people.flatMap((person) => [person.address, person.billing_address, person.shipping_address])
    .map(asRec).filter((item): item is Rec => item !== null);
  const all = [...people, ...addresses, raw];

  const name =
    firstOf(people, ["name", "full_name", "fullName", "display_name"])
    ?? ([firstOf(people, ["first_name", "firstName"]), firstOf(people, ["last_name", "lastName"])].filter(Boolean).join(" ") || null)
    ?? firstOf([raw], ["customer_name", "client_name", "buyer_name"]);
  const email = firstOf(all, ["email", "customer_email", "client_email"]);
  const phone = firstOf(all, ["phone", "phone_number", "phoneNumber", "mobile", "customer_phone"], phoneText);
  // Chariow's checkout country lives in context.country, separate from the
  // customer's phone.country (dialling metadata, not necessarily their location).
  const checkoutContext = asRec(raw.context);
  const rootAddresses = [raw.address, raw.billing_address, raw.shipping_address, raw.shipping]
    .map(asRec).filter((item): item is Rec => item !== null);
  const countrySources = [...all, ...rootAddresses, ...(checkoutContext ? [checkoutContext] : [])];
  const country = firstOf(countrySources, ["country", "country_name", "countryName", "customer_country", "country_code", "countryCode", "country_iso", "country_iso_code"], countryText);

  const payment = asRec(raw.payment);
  const failure = asRec(raw.failure_error) ?? asRec(payment?.failure_error) ?? asRec(raw.error) ?? asRec(payment?.error);
  const code = text(failure?.code);
  const failureReason =
    (code ? FAILURE_FR[code] : undefined)
    ?? text(failure?.message)
    ?? text(failure?.customer_message)
    ?? text(raw.failure_reason)
    ?? text(payment?.failure_reason)
    ?? text(raw.failure_message)
    ?? code;

  return { name, email, phone, country, failureReason };
}

function firstArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["data", "items", "sales", "results"]) {
      if (Array.isArray(record[key])) return record[key] as unknown[];
    }
  }
  return [];
}

/**
 * Ajoute `id`, `details` et `contact` à chaque vente publique, dans le même ordre que la liste brute
 * (normalizeChariowSnapshot construit `sales` avec un simple map sur cette même liste).
 */
export function mergeSaleDetails(publicSales: unknown[], rawSalesPayload: unknown): unknown[] {
  const raw = firstArray(rawSalesPayload);
  return publicSales.map((sale, index) => {
    const source = raw[index];
    const record = source && typeof source === "object" && !Array.isArray(source) ? (source as Record<string, unknown>) : {};
    const id = record.id ?? record.uuid ?? record.reference;
    return {
      ...(sale as Record<string, unknown>),
      ...(typeof id === "string" || typeof id === "number" ? { id: String(id) } : {}),
      details: buildSaleDetails(source),
      contact: buildSaleContact(source),
    };
  });
}
