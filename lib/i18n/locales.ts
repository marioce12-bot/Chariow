export type Locale = "fr" | "en";

export const SUPPORTED_LOCALES: Locale[] = ["fr", "en"];
export const DEFAULT_LOCALE: Locale = "fr";

const STORAGE_KEY = "vendeo-lang";

export function isLocale(value: unknown): value is Locale {
  return value === "fr" || value === "en";
}

// Détecte la langue de départ : choix manuel persisté, sinon langue du navigateur
// (français/anglais), sinon français par défaut.
export function detectLocale(): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isLocale(stored)) return stored;
  } catch {
    // Stockage indisponible : on s'appuie uniquement sur le navigateur.
  }
  const nav = (navigator.language || "").toLowerCase();
  if (nav.startsWith("fr")) return "fr";
  if (nav.startsWith("en")) return "en";
  return DEFAULT_LOCALE;
}

export function persistLocale(locale: Locale) {
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // Stockage indisponible : le choix s'applique seulement à la session.
  }
  if (typeof document !== "undefined") document.documentElement.lang = locale;
}