export type ChatCatalogProduct = { id: string; storeId: string; storeName: string; name: string; url: string | null };
export type CampaignProductPayload = { productId?: unknown; storeId?: unknown; productName?: unknown; storeName?: unknown; linkUrl?: unknown; [key: string]: unknown };

type ResolutionError = { error: "missing" | "ambiguous" | "unavailable" };
type ResolvedCampaignProduct<T extends CampaignProductPayload> = T & { productId: string; storeId: string; linkUrl: string };

function normalizeName(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function nameSimilarity(left: string, right: string): number {
  const a = normalizeName(left);
  const b = normalizeName(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const aTokens = new Set(a.split(" "));
  const bTokens = new Set(b.split(" "));
  const overlap = [...aTokens].filter((token) => bTokens.has(token)).length;
  const union = new Set([...aTokens, ...bTokens]).size;
  const tokenScore = union ? overlap / union : 0;
  if (a.includes(b) || b.includes(a)) return Math.max(tokenScore, 0.82);
  return tokenScore;
}

function productIdFromUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  try {
    const url = new URL(value);
    const parts = url.pathname.split("/").filter(Boolean);
    const candidate = parts.at(-1) ?? "";
    return candidate || null;
  } catch {
    return null;
  }
}

/** Resolves only against the server-side catalog; arbitrary model URLs are never trusted. */
export function resolveCampaignProduct<T extends CampaignProductPayload>(payload: T, catalog: ChatCatalogProduct[], userProvidedUrls: string[] = []): ResolvedCampaignProduct<T> | ResolutionError {
  const explicitProductId = typeof payload.productId === "string" && payload.productId.trim() ? payload.productId.trim() : null;
  const payloadUrl = typeof payload.linkUrl === "string" && payload.linkUrl.trim() ? payload.linkUrl.trim() : null;
  const urlProductId = productIdFromUrl(payloadUrl);
  let candidates = explicitProductId
    ? catalog.filter((product) => product.id === explicitProductId)
    : urlProductId
      ? catalog.filter((product) => product.id === urlProductId || product.url === payloadUrl)
      : catalog;

  if (!explicitProductId && !urlProductId) {
    if (typeof payload.productName !== "string" || !payload.productName.trim()) return { error: "missing" };
    const scored = catalog.map((product) => ({ product, score: nameSimilarity(payload.productName as string, product.name) }));
    const maximum = Math.max(0, ...scored.map(({ score }) => score));
    if (maximum < 0.5) return { error: "missing" };
    const close = scored.filter(({ score }) => score === maximum).map(({ product }) => product);
    candidates = close;
  }

  if (typeof payload.storeId === "string" && payload.storeId.trim()) {
    candidates = candidates.filter((product) => product.storeId === payload.storeId);
  } else if (typeof payload.storeName === "string" && payload.storeName.trim()) {
    const storeName = normalizeName(payload.storeName as string);
    candidates = candidates.filter((product) => normalizeName(product.storeName) === storeName);
  }
  if (!candidates.length) return { error: "missing" };
  if (candidates.length !== 1) return { error: "ambiguous" };

  const product = candidates[0];
  if (!product.url) return { error: "unavailable" };
  const linkUrl = payloadUrl && userProvidedUrls.includes(payloadUrl) ? payloadUrl : product.url;
  return { ...payload, productId: product.id, storeId: product.storeId, linkUrl };
}

function extractJsonObject(text: string): CampaignProductPayload | null {
  for (let start = 0; start < text.length; start += 1) {
    if (text[start] !== "{") continue;
    let depth = 0;
    let quoted = false;
    let escaped = false;
    for (let index = start; index < text.length; index += 1) {
      const char = text[index];
      if (quoted) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') quoted = false;
        continue;
      }
      if (char === '"') quoted = true;
      else if (char === "{") depth += 1;
      else if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          try {
            const parsed: unknown = JSON.parse(text.slice(start, index + 1));
            return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as CampaignProductPayload : null;
          } catch {
            break;
          }
        }
      }
    }
  }
  return null;
}

/** Model launch markers are proposals only: normalize identity before showing a launch action. */
export function resolveCampaignAnswer(answer: string, catalog: ChatCatalogProduct[], options: { userProvidedUrls?: string[]; locale?: string } = {}): string {
  const marker = answer.indexOf("[[LANCE_CAMPAGNE]]");
  if (marker < 0) return answer;
  const before = answer.slice(0, marker).trim();
  const en = options.locale === "en";
  const clarify = en ? "Which exact product and store should I promote?" : "Quel produit exact et quelle boutique veux-tu promouvoir ?";
  const payload = extractJsonObject(answer.slice(marker + "[[LANCE_CAMPAGNE]]".length));
  if (payload) {
    const resolved = resolveCampaignProduct(payload, catalog, options.userProvidedUrls);
    if (!("error" in resolved)) return `${before}${before ? "\n\n" : ""}[[LANCE_CAMPAGNE]]${JSON.stringify(resolved)}`;
    if (resolved.error === "unavailable") {
      const unavailable = en
        ? "The product was found, but its public link is currently unavailable. Check the store connection before continuing."
        : "Le produit est identifié, mais son lien public est actuellement indisponible. Vérifie la connexion de la boutique avant de continuer.";
      return `${before}${before ? "\n\n" : ""}${unavailable}`;
    }
  }
  return `${before}${before ? "\n\n" : ""}${clarify}`;
}
