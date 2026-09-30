// Configuration structurée d'une vitrine. C'est la SEULE chose que l'IA ou l'utilisateur peuvent écrire :
// jamais de HTML, de CSS ni de script libre. Tout passe par validateShopConfig() avant stockage ET avant affichage.

export const SHOP_CONFIG_VERSION = 1 as const;
export const SHOP_THEMES = ["light", "dark"] as const;
export const SHOP_TITLE_STYLES = ["bold", "elegant", "minimal"] as const;
export type ShopTheme = (typeof SHOP_THEMES)[number];
export type ShopTitleStyle = (typeof SHOP_TITLE_STYLES)[number];

export const SHOP_LIMITS = {
  shopName: 60,
  tagline: 120,
  about: 400,
  buttonLabel: 24,
  productTitle: 80,
  productDescription: 400,
  products: 50,
  productId: 100,
  url: 2048,
  logoUrl: 500,
} as const;

export const DEFAULT_PRIMARY_COLOR = "#2563eb";
// Les liens produits Chariow actuels finissent par .shop (ex. https://abc.mychariow.shop/prd_xxx) ; .com reste accepté pour les anciens liens.
export const DEFAULT_ALLOWED_BUY_HOSTS = ["mychariow.shop", "mychariow.com"];

export type ShopProductEntry = {
  productId: string;
  buyUrl: string;
  visible: boolean;
  title: string | null;
  description: string | null;
};

export type ShopConfig = {
  version: typeof SHOP_CONFIG_VERSION;
  theme: ShopTheme;
  primaryColor: string;
  titleStyle: ShopTitleStyle;
  shopName: string;
  tagline: string;
  about: string;
  buttonLabel: string;
  logoUrl: string | null;
  // L'ordre du tableau est l'ordre d'affichage.
  products: ShopProductEntry[];
};

export type ValidateOptions = {
  // Nom du cloud Cloudinary (CLOUDINARY_CLOUD_NAME) : seules ses images sont acceptées pour le logo.
  cloudName?: string | null;
  allowedHosts?: string[];
};

export type ValidateResult = { ok: true; config: ShopConfig } | { ok: false; errors: string[] };

// Domaines de paiement autorisés : mychariow.shop et mychariow.com (+ sous-domaines) et, en option, CHARIOW_ALLOWED_HOSTS.
export function getAllowedBuyHosts(env: string | undefined = process.env.CHARIOW_ALLOWED_HOSTS): string[] {
  const extra = (env ?? "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter((host) => host.includes(".") && /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/.test(host));
  return Array.from(new Set([...DEFAULT_ALLOWED_BUY_HOSTS, ...extra]));
}

// Nettoie un texte : pas de chevrons, pas de caractères de contrôle ni de marques bidirectionnelles.
// Le rendu React échappe de toute façon le texte ; ceci est une deuxième barrière.
export function cleanText(value: string, multiline = false): string {
  let text = value.normalize("NFC").replace(/[<>]/g, "").replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, "");
  if (multiline) {
    text = text.replace(/[^\S\n]+/g, " ").replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, "").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n");
  } else {
    text = text.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ");
  }
  return text.trim();
}

export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
}

export function isProductId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/.test(value);
}

// Retourne l'URL normalisée si elle est en https, sans identifiants ni port, et sur un domaine autorisé ; sinon null.
export function parseBuyUrl(value: unknown, allowedHosts: string[] = getAllowedBuyHosts()): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw || raw.length > SHOP_LIMITS.url) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
  const host = url.hostname.toLowerCase();
  const allowed = allowedHosts.some((allowedHost) => host === allowedHost || host.endsWith(`.${allowedHost}`));
  return allowed ? url.toString() : null;
}

export function isAllowedBuyUrl(value: unknown, allowedHosts?: string[]): boolean {
  return parseBuyUrl(value, allowedHosts) !== null;
}

// Logo : uniquement une image de NOTRE Cloudinary, dans le dossier vendeo/storefronts.
export function isAllowedLogoUrl(value: unknown, cloudName: string | null | undefined): value is string {
  if (typeof value !== "string" || !cloudName || value.length > SHOP_LIMITS.logoUrl) return false;
  if (!/^[A-Za-z0-9_-]+$/.test(cloudName)) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.hostname !== "res.cloudinary.com") return false;
  if (url.username || url.password || url.port || url.search || url.hash) return false;
  if (!url.pathname.startsWith(`/${cloudName}/image/upload/`)) return false;
  if (!/^[A-Za-z0-9_\-./]+$/.test(url.pathname) || url.pathname.includes("..")) return false;
  return url.pathname.includes("/vendeo/storefronts/");
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function checkKeys(errors: string[], path: string, obj: Record<string, unknown>, allowed: readonly string[]) {
  for (const key of Object.keys(obj)) {
    if (!allowed.includes(key)) errors.push(`${path} : champ non autorisé « ${key.slice(0, 30)} »`);
  }
}

function readText(errors: string[], path: string, value: unknown, max: number, opts: { required?: boolean; multiline?: boolean } = {}): string {
  if (value === undefined || value === null) {
    if (opts.required) errors.push(`${path} est requis`);
    return "";
  }
  if (typeof value !== "string") {
    errors.push(`${path} doit être un texte`);
    return "";
  }
  const text = cleanText(value, opts.multiline);
  if (opts.required && !text) errors.push(`${path} est requis`);
  if (text.length > max) errors.push(`${path} dépasse ${max} caractères`);
  return text;
}

const CONFIG_KEYS = ["version", "theme", "primaryColor", "titleStyle", "shopName", "tagline", "about", "buttonLabel", "logoUrl", "products"] as const;
const PRODUCT_KEYS = ["productId", "buyUrl", "visible", "title", "description"] as const;

export function validateShopConfig(input: unknown, options: ValidateOptions = {}): ValidateResult {
  const errors: string[] = [];
  if (!isPlainObject(input)) return { ok: false, errors: ["La configuration doit être un objet"] };
  const allowedHosts = options.allowedHosts ?? getAllowedBuyHosts();
  checkKeys(errors, "config", input, CONFIG_KEYS);

  if (input.version !== undefined && input.version !== SHOP_CONFIG_VERSION) errors.push(`version doit valoir ${SHOP_CONFIG_VERSION}`);

  let theme: ShopTheme = "light";
  if (input.theme !== undefined) {
    if (SHOP_THEMES.includes(input.theme as ShopTheme)) theme = input.theme as ShopTheme;
    else errors.push("theme doit être « light » ou « dark »");
  }

  let titleStyle: ShopTitleStyle = "bold";
  if (input.titleStyle !== undefined) {
    if (SHOP_TITLE_STYLES.includes(input.titleStyle as ShopTitleStyle)) titleStyle = input.titleStyle as ShopTitleStyle;
    else errors.push("titleStyle doit être « bold », « elegant » ou « minimal »");
  }

  let primaryColor = DEFAULT_PRIMARY_COLOR;
  if (input.primaryColor !== undefined) {
    if (isHexColor(input.primaryColor)) primaryColor = input.primaryColor.toLowerCase();
    else errors.push("primaryColor doit être une couleur hexadécimale de la forme #RRGGBB");
  }

  const shopName = readText(errors, "shopName", input.shopName, SHOP_LIMITS.shopName, { required: true });
  const tagline = readText(errors, "tagline", input.tagline, SHOP_LIMITS.tagline);
  const about = readText(errors, "about", input.about, SHOP_LIMITS.about, { multiline: true });
  const buttonLabel = readText(errors, "buttonLabel", input.buttonLabel, SHOP_LIMITS.buttonLabel) || "Acheter";

  let logoUrl: string | null = null;
  if (input.logoUrl !== undefined && input.logoUrl !== null && input.logoUrl !== "") {
    if (isAllowedLogoUrl(input.logoUrl, options.cloudName)) logoUrl = input.logoUrl;
    else errors.push("logoUrl doit être une image envoyée via Vendeo");
  }

  const products: ShopProductEntry[] = [];
  if (!Array.isArray(input.products)) {
    errors.push("products doit être une liste");
  } else {
    if (input.products.length > SHOP_LIMITS.products) errors.push(`products : ${SHOP_LIMITS.products} produits maximum`);
    const seen = new Set<string>();
    input.products.slice(0, SHOP_LIMITS.products).forEach((entry, index) => {
      const path = `products[${index}]`;
      if (!isPlainObject(entry)) {
        errors.push(`${path} doit être un objet`);
        return;
      }
      checkKeys(errors, path, entry, PRODUCT_KEYS);
      if (!isProductId(entry.productId)) {
        errors.push(`${path}.productId est invalide`);
        return;
      }
      if (seen.has(entry.productId)) errors.push(`${path}.productId est en double`);
      seen.add(entry.productId);
      const buyUrl = parseBuyUrl(entry.buyUrl, allowedHosts);
      if (!buyUrl) errors.push(`${path}.buyUrl doit être un lien https vers ${allowedHosts.join(", ")}`);
      let visible = true;
      if (entry.visible !== undefined) {
        if (typeof entry.visible === "boolean") visible = entry.visible;
        else errors.push(`${path}.visible doit être vrai ou faux`);
      }
      const title = readText(errors, `${path}.title`, entry.title, SHOP_LIMITS.productTitle);
      const description = readText(errors, `${path}.description`, entry.description, SHOP_LIMITS.productDescription, { multiline: true });
      if (buyUrl) products.push({ productId: entry.productId, buyUrl, visible, title: title || null, description: description || null });
    });
  }

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    config: { version: SHOP_CONFIG_VERSION, theme, primaryColor, titleStyle, shopName, tagline, about, buttonLabel, logoUrl, products },
  };
}
