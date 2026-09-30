import crypto from "node:crypto";

export const RESERVED_SLUGS = new Set([
  "admin", "api", "app", "dashboard", "login", "register", "shop", "www", "static", "assets", "vendeo",
  "support", "help", "terms", "privacy", "about", "buy", "preview", "auth", "null", "undefined",
]);

export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
}

export function isValidSlug(slug: unknown): slug is string {
  return typeof slug === "string" && slug.length >= 3 && slug.length <= 60 && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) && !RESERVED_SLUGS.has(slug);
}

export function randomSuffix(length = 4): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = crypto.randomBytes(length);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

// Le premier candidat est le slug « propre » ; en cas de doublon on ajoute un suffixe aléatoire.
export function buildSlugCandidates(name: string, attempts = 6): string[] {
  let base = slugify(name);
  if (base.length < 3 || RESERVED_SLUGS.has(base)) base = "boutique";
  const candidates = [base];
  for (let i = 1; i < attempts; i += 1) candidates.push(`${base}-${randomSuffix()}`);
  return candidates;
}
