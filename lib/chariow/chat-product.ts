export type ChatCatalogProduct = { id: string; storeId: string; storeName: string; name: string; url: string | null };
export type CampaignProductPayload = { productId?: unknown; storeId?: unknown; productName?: unknown; storeName?: unknown; linkUrl?: unknown; [key: string]: unknown };
function normalizeName(value: string): string { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
/** Resolves solely by explicit catalog identity/name. User-provided URL overrides are trusted only when supplied separately. */
export function resolveCampaignProduct<T extends CampaignProductPayload>(payload: T, catalog: ChatCatalogProduct[], userProvidedUrls: string[] = []): (T & { productId?: string; storeId?: string; linkUrl?: string }) | { error: "missing" | "ambiguous" | "unavailable" } {
  let candidates = catalog;
  if (typeof payload.productId === "string" && payload.productId) candidates = candidates.filter((p) => p.id === payload.productId);
  else if (typeof payload.productName === "string" && payload.productName.trim()) candidates = candidates.filter((p) => normalizeName(p.name) === normalizeName(payload.productName as string));
  else return { error: "missing" };
  if (typeof payload.storeId === "string" && payload.storeId) candidates = candidates.filter((p) => p.storeId === payload.storeId);
  else if (typeof payload.storeName === "string" && payload.storeName.trim()) candidates = candidates.filter((p) => normalizeName(p.storeName) === normalizeName(payload.storeName as string));
  if (!candidates.length) return { error: "missing" };
  if (candidates.length !== 1) return { error: "ambiguous" };
  const product = candidates[0];
  if (!product.url) return { error: "unavailable" };
  const linkUrl = typeof payload.linkUrl === "string" && userProvidedUrls.includes(payload.linkUrl) ? payload.linkUrl : product.url;
  return { ...payload, productId: product.id, storeId: product.storeId, linkUrl };
}

/** Model launch markers are proposals only: normalize identity before showing a launch action. */
export function resolveCampaignAnswer(answer: string, catalog: ChatCatalogProduct[], options: { userProvidedUrls?: string[]; locale?: string } = {}): string {
  const marker = answer.match(/\[\[LANCE_CAMPAGNE\]\]([\s\S]*)$/);
  if (!marker) return answer;
  const before = answer.slice(0, marker.index).trim();
  const en = options.locale === "en";
  const clarify = en ? "Which exact product and store should I promote?" : "Quel produit exact et quelle boutique veux-tu promouvoir ?";
  let suffix = clarify;
  try {
    const payload: unknown = JSON.parse(marker[1]);
    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
      const resolved = resolveCampaignProduct(payload as CampaignProductPayload, catalog, options.userProvidedUrls);
      if (!("error" in resolved)) return `${before}${before ? "\n\n" : ""}[[LANCE_CAMPAGNE]]${JSON.stringify(resolved)}`;
      if (resolved.error === "unavailable") suffix = en
        ? "The product was found, but its public link is currently unavailable. Check the store connection before continuing."
        : "Le produit est identifié, mais son lien public est actuellement indisponible. Vérifie la connexion de la boutique avant de continuer.";
    }
  } catch { /* A malformed model payload must never leave a clickable launch marker. */ }
  return `${before}${before ? "\n\n" : ""}${suffix}`;
}
