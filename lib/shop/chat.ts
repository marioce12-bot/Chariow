import type { SupabaseClient } from "@supabase/supabase-js";
import { SHOP_LIMITS, SHOP_THEMES, SHOP_TITLE_STYLES, cleanText, isHexColor, isProductId } from "./config";
import { importChatAttachmentAsLogo } from "./logo";
import { fetchStoreProducts, type ShopProduct } from "./products";
import { saveStorefront, storefrontUrl } from "./service";
import { clip } from "./text";

export const VITRINE_TAG = "[[CREE_VITRINE]]";

// Consignes ajoutées au prompt système UNIQUEMENT quand la conversation parle de vitrine (voir wantsVitrine),
// pour ne pas alourdir le prompt à chaque message. Le plafond MAX_SYSTEM_CONTENT_CHARS est relevé d'autant.
export const VITRINE_PROMPT = `Création de vitrine (quand l'utilisateur veut une vitrine, un mini-site public pour vendre ses produits) :
- Une vitrine est une page publique (vendeo-studio.site/shop/...) qui affiche les produits choisis ; le bouton Acheter mène au lien de paiement Chariow du produit.
- À réunir sans jamais redemander ce qui a déjà été dit : la boutique concernée (s'il en a plusieurs), le nom affiché, le logo (l'utilisateur joint une image dans le chat, sinon pas de logo), les produits à afficher dans l'ordre voulu, ses goûts (couleur principale, thème clair ou sombre, style de titre : bold, elegant ou minimal, phrase d'accroche).
- Lien d'achat (OBLIGATOIRE) : pour CHAQUE produit affiché, demande le lien de sa page produit Chariow (https, sur mychariow.shop, par exemple https://maboutique.mychariow.shop/prd_xxxxx). Ne le devine jamais, ne le déduis pas des données de boutique, n'en invente pas. S'il n'est pas sur mychariow.shop (ou mychariow.com pour un ancien lien), demande-le à nouveau.
- Une fois tout réuni, résume la vitrine en un seul message et demande une validation explicite avant de la créer.
- Après validation explicite, termine TON message par la balise exacte [[CREE_VITRINE]] suivie IMMÉDIATEMENT d'un JSON compact et valide, sans aucun autre texte après : {"storeName": string|null, "shopName": string, "tagline": string|null, "about": string|null, "theme": "light"|"dark", "primaryColor": "#RRGGBB", "titleStyle": "bold"|"elegant"|"minimal", "buttonLabel": string|null, "useAttachedImageAsLogo": boolean, "products": [{"name": string (nom du produit tel qu'il apparaît dans les données de boutique), "buyUrl": string (lien donné par l'utilisateur, recopié EXACTEMENT)}]}. N'écris ni HTML, ni code, ni script. Le serveur vérifie et crée la page : ne promets pas de lien avant.`;

export function wantsVitrine(texts: string[]): boolean {
  return texts.some((text) => /vitrine|storefront|showcase|mini[- ]?site/i.test(text));
}

export function extractVitrineTag(answer: string): { found: boolean; text: string; payload: unknown | null } {
  const index = answer.indexOf(VITRINE_TAG);
  if (index === -1) return { found: false, text: answer, payload: null };
  const text = answer.slice(0, index).trim();
  const after = answer.slice(index + VITRINE_TAG.length);
  const start = after.indexOf("{");
  const end = after.lastIndexOf("}");
  let payload: unknown | null = null;
  if (start !== -1 && end > start) {
    try {
      payload = JSON.parse(after.slice(start, end + 1));
    } catch {
      payload = null;
    }
  }
  return { found: true, text, payload };
}

export function normalizeName(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

// L'IA ne connaît que les noms des produits (pas leurs identifiants) : on retrouve le produit par son nom.
export function matchProduct(name: string, catalog: Pick<ShopProduct, "id" | "name">[]): { id: string } | { error: string } {
  const needle = normalizeName(name);
  if (!needle) return { error: "nom de produit vide" };
  const exact = catalog.filter((product) => normalizeName(product.name) === needle);
  if (exact.length === 1) return { id: exact[0].id };
  if (exact.length > 1) return { error: `plusieurs produits s'appellent « ${clip(name, 40)} »` };
  const partial = catalog.filter((product) => {
    const candidate = normalizeName(product.name);
    return candidate.length >= 4 && needle.length >= 4 && (candidate.includes(needle) || needle.includes(candidate));
  });
  if (partial.length === 1) return { id: partial[0].id };
  return { error: partial.length > 1 ? `« ${clip(name, 40)} » correspond à plusieurs produits` : `produit « ${clip(name, 40)} » introuvable dans la boutique` };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function aiText(value: unknown, max: number, multiline = false): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = clip(cleanText(value, multiline), max);
  return text || undefined;
}

// Convertit le JSON de l'IA en configuration candidate. Seuls des champs connus sont repris ;
// la configuration résultante est ensuite validée strictement par validateShopConfig (dans saveStorefront).
export function buildConfigFromAi(
  payload: unknown,
  options: { catalog: Pick<ShopProduct, "id" | "name">[]; logoUrl: string | null },
): { ok: true; config: Record<string, unknown>; notes: string[]; storeName: string | null } | { ok: false; error: string } {
  if (!isObject(payload)) return { ok: false, error: "les informations de la vitrine sont illisibles" };
  if (!Array.isArray(payload.products) || payload.products.length === 0) return { ok: false, error: "aucun produit à afficher" };
  if (payload.products.length > SHOP_LIMITS.products) return { ok: false, error: `${SHOP_LIMITS.products} produits maximum` };
  const notes: string[] = [];
  const products: Record<string, unknown>[] = [];
  for (const item of payload.products) {
    if (!isObject(item)) return { ok: false, error: "un produit est mal renseigné" };
    const label = typeof item.name === "string" ? item.name : typeof item.productId === "string" ? item.productId : "produit";
    if (typeof item.buyUrl !== "string" || !item.buyUrl.trim()) return { ok: false, error: `il manque le lien d'achat de « ${clip(label, 40)} »` };
    let productId: string;
    if (typeof item.name === "string" && item.name.trim()) {
      const match = matchProduct(item.name, options.catalog);
      if (("error" in match)) return { ok: false, error: match.error };
      productId = match.id;
    } else if (isProductId(item.productId)) {
      productId = item.productId;
    } else {
      return { ok: false, error: "un produit n'a ni nom ni identifiant" };
    }
    products.push({ productId, buyUrl: item.buyUrl.trim(), visible: true });
  }
  const config: Record<string, unknown> = { version: 1, shopName: aiText(payload.shopName, SHOP_LIMITS.shopName), products };
  const tagline = aiText(payload.tagline, SHOP_LIMITS.tagline);
  if (tagline) config.tagline = tagline;
  const about = aiText(payload.about, SHOP_LIMITS.about, true);
  if (about) config.about = about;
  const buttonLabel = aiText(payload.buttonLabel, SHOP_LIMITS.buttonLabel);
  if (buttonLabel) config.buttonLabel = buttonLabel;
  if (SHOP_THEMES.includes(payload.theme as never)) config.theme = payload.theme;
  else if (payload.theme != null) notes.push("thème non reconnu, thème clair utilisé");
  if (SHOP_TITLE_STYLES.includes(payload.titleStyle as never)) config.titleStyle = payload.titleStyle;
  else if (payload.titleStyle != null) notes.push("style de titre non reconnu, style par défaut utilisé");
  if (isHexColor(payload.primaryColor)) config.primaryColor = payload.primaryColor;
  else if (payload.primaryColor != null) notes.push("couleur non reconnue, couleur par défaut utilisée");
  if (options.logoUrl) config.logoUrl = options.logoUrl;
  const storeName = typeof payload.storeName === "string" && payload.storeName.trim() ? payload.storeName.trim() : null;
  return { ok: true, config, notes, storeName };
}

// Traite la réponse de l'IA : si elle contient [[CREE_VITRINE]] + JSON, le serveur valide, crée la vitrine
// et remplace la balise par le lien. Retourne le texte final à enregistrer et afficher.
export async function processVitrineAnswer(args: {
  answer: string;
  supabase: SupabaseClient;
  userId: string;
  imageUrls: string[]; // pièces jointes image, de la plus récente à la plus ancienne
  hasPriorAssistantTurn: boolean;
}): Promise<string> {
  const extracted = extractVitrineTag(args.answer);
  if (!extracted.found) return args.answer;
  const before = extracted.text;
  const fail = (reason: string) => `${before ? `${before}\n\n` : ""}⚠️ Je n'ai pas pu créer la vitrine : ${reason}.`;

  // La balise n'est prise en compte qu'après au moins un échange (récapitulatif + validation de l'utilisateur).
  if (!args.hasPriorAssistantTurn) return fail("confirme d'abord le récapitulatif de ta vitrine");
  if (!extracted.payload) return fail("les informations reçues sont illisibles, redonne-moi tes choix et je réessaie");

  const { data: stores } = await args.supabase.from("stores").select("id, store_name").eq("user_id", args.userId).eq("platform", "chariow").eq("is_active", true);
  if (!stores?.length) return fail("aucune boutique Chariow n'est connectée");
  const wanted = isObject(extracted.payload) && typeof extracted.payload.storeName === "string" ? normalizeName(extracted.payload.storeName) : "";
  let store = wanted ? stores.find((candidate) => normalizeName(candidate.store_name) === wanted) : undefined;
  if (!store && stores.length === 1) store = stores[0];
  if (!store) return fail(`précise pour quelle boutique (${stores.map((candidate) => candidate.store_name).slice(0, 5).join(", ")})`);

  let catalog: ShopProduct[];
  try {
    catalog = await fetchStoreProducts(store.id);
  } catch {
    return fail("je n'arrive pas à lire le catalogue de ta boutique pour le moment");
  }

  const notes: string[] = [];
  let logoUrl: string | null = null;
  if (isObject(extracted.payload) && extracted.payload.useAttachedImageAsLogo === true) {
    if (args.imageUrls.length) {
      const logo = await importChatAttachmentAsLogo(args.userId, args.imageUrls[0]).catch(() => null);
      if (logo?.ok) logoUrl = logo.url;
      else notes.push("le logo n'a pas pu être enregistré (image JPEG, PNG ou WebP de 5 Mo maximum)");
    } else {
      notes.push("aucune image jointe pour le logo");
    }
  }

  const built = buildConfigFromAi(extracted.payload, { catalog, logoUrl });
  if (!built.ok) return fail(built.error);
  notes.push(...built.notes);

  const saved = await saveStorefront({ supabase: args.supabase, userId: args.userId, storeId: store.id, config: built.config, publish: true, catalog });
  if (!saved.ok) return fail(saved.error.toLowerCase().startsWith("http") ? "données invalides" : saved.error);

  const link = storefrontUrl(saved.storefront.slug);
  const noteText = notes.length ? `\n(${notes.join(" ; ")})` : "";
  return `${before ? `${before}\n\n` : ""}✅ Ta vitrine est ${saved.created ? "en ligne" : "mise à jour"} : ${link}${noteText}`;
}
