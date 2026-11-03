import type { UgcGeneratorInput } from "./ugc-prompt-generator";
import { resolveProductLanguage } from "./product-language";

const text = (value: unknown, max: number) => typeof value === "string" ? value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";
const named = (value: unknown, max: number) => text(value && typeof value === "object" ? (value as Record<string, unknown>).name : value, max);
function image(value: unknown) {
  try {
    const url = new URL(text(value, 2000));
    if (url.protocol !== "https:" || url.username || url.password || /^(localhost|127\.|10\.|192\.168\.|\[::1\])/.test(url.hostname)) return "";
    return url.toString();
  } catch { return ""; }
}
export function normalizeUgcInput(rawProduct: unknown, rawOptions: unknown, locale: unknown, userBrief = "", previousPrompt = ""): UgcGeneratorInput {
  const product = rawProduct && typeof rawProduct === "object" ? rawProduct as Record<string, unknown> : {};
  const options = rawOptions && typeof rawOptions === "object" ? rawOptions as Record<string, unknown> : {};
  const name = text(product.name, 200);
  const description = text(product.description, 3000);
  const language = text(options.language, 60);
  const images = [...new Set([product.image, product.imageUrl, ...(Array.isArray(product.images) ? product.images : [])].map(value => image(typeof value === "object" && value ? (value as Record<string, unknown>).url : value)).filter(Boolean))].slice(0, 5);
  return {
    product: {
      name, description,
      price: typeof product.price === "number" || typeof product.price === "string" ? String(product.price).slice(0, 40) : "",
      currency: text(product.currency, 10), category: named(product.category, 150),
      images, type: text(product.type ?? product.product_type, 60),
      tags: (Array.isArray(product.tags) ? product.tags : typeof product.tags === "string" ? product.tags.split(",") : []).map(value => named(value, 60)).filter(Boolean).slice(0, 12),
      shop: named(product.shop ?? product.store, 200),
    },
    options: {
      language: language && language !== "auto" ? language : resolveProductLanguage({ name, description }, typeof locale === "string" ? locale : "fr").label,
      duration: Number(options.duration ?? 10), tone: text(options.tone, 100) || "naturel",
      platform: text(options.platform, 60) || "Reels",
      angle: text(options.angle, 120),
    },
    userBrief: text(userBrief, 4000), previousPrompt: text(previousPrompt, 4000),
  };
}
