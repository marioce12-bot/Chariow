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
    candidates = scored.filter(({ score }) => score === maximum).map(({ product }) => product);
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

function sanitizeJsonControlCharacters(text: string): string {
  let output = "";
  let quoted = false;
  let escaped = false;
  for (const char of text) {
    const code = char.charCodeAt(0);
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') quoted = false;
      if (code < 0x20) {
        output += char === "\n" ? "\\n" : char === "\r" ? "\\r" : char === "\t" ? "\\t" : `\\u${code.toString(16).padStart(4, "0")}`;
        continue;
      }
    } else if (char === '"') quoted = true;
    output += char;
  }
  return output;
}

function extractJsonObject(text: string): CampaignProductPayload | null {
  const source = text.replace(/```(?:json)?/gi, "");
  for (let start = 0; start < source.length; start += 1) {
    if (source[start] !== "{") continue;
    let depth = 0;
    let quoted = false;
    let escaped = false;
    for (let index = start; index < source.length; index += 1) {
      const char = source[index];
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
            const parsed: unknown = JSON.parse(sanitizeJsonControlCharacters(source.slice(start, index + 1)));
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

function removeLaunchAnnouncement(text: string): string {
  return text
    .replace(/(?:^|\n)\s*(?:parfait\s*[!,]?\s*)?(?:je\s+(?:vais|lance|démarre)|je\s+m['’]apprête\s+à\s+lancer|lancement\s+de\s+la\s+campagne)[^\n.!?]*(?:[.!?]|$)/giu, "")
    .replace(/(?:^|\n)\s*(?:perfect\s*[!,]?\s*)?(?:i['’]?m\s+(?:launching|starting)|i\s+will\s+launch|launching\s+the\s+campaign)[^\n.!?]*(?:[.!?]|$)/giu, "")
    .trim();
}

/** Model launch markers are proposals only: normalize identity before showing a launch action. */
export function resolveCampaignAnswer(answer: string, catalog: ChatCatalogProduct[], options: { userProvidedUrls?: string[]; locale?: string; conversationId?: string } = {}): string {
  const marker = answer.indexOf("[[LANCE_CAMPAGNE]]");
  if (marker < 0) return answer;
  const before = removeLaunchAnnouncement(answer.slice(0, marker).trim());
  const en = options.locale === "en";
  const payloadText = answer.slice(marker + "[[LANCE_CAMPAGNE]]".length);
  const payload = extractJsonObject(payloadText);
  const rawLength = payloadText.length;
  if (payload) {
    const resolved = resolveCampaignProduct(payload, catalog, options.userProvidedUrls);
    if (!("error" in resolved)) return `${before}${before ? "\n\n" : ""}[[LANCE_CAMPAGNE]]${JSON.stringify(resolved)}`;
    console.error("[chat-campaign] product_resolution_failed", {
      conversation_id: options.conversationId ?? null,
      reason: resolved.error,
      product_id: typeof payload.productId === "string" ? payload.productId : null,
      store_id: typeof payload.storeId === "string" ? payload.storeId : null,
      raw_json_length: rawLength,
    });
    const reason = resolved.error === "missing"
      ? (en ? "The product was not found in the connected stores." : "Le produit est introuvable dans les boutiques connectées.")
      : resolved.error === "ambiguous"
        ? (en ? "Several products match this request. Which exact product and store should I use?" : "Plusieurs produits correspondent. Quel produit exact et quelle boutique veux-tu promouvoir ?")
        : (en ? "The product was found, but its public link is currently unavailable. The store connection may have expired." : "Le produit est identifié, mais son lien public est indisponible. La connexion de la boutique est peut-être expirée.");
    return `${before}${before ? "\n\n" : ""}${reason}`;
  }
  console.error("[chat-campaign] product_resolution_failed", {
    conversation_id: options.conversationId ?? null,
    reason: "invalid_json",
    product_id: null,
    store_id: null,
    raw_json_length: rawLength,
  });
  const invalid = en ? "The campaign information was invalid. Please retry." : "Les informations de campagne sont invalides. Réessaie.";
  return `${before}${before ? "\n\n" : ""}${invalid}`;
}
