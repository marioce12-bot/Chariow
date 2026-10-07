import type { Locale } from "./locales";
import type { Dict } from "./translation-types";
import { fr } from "./translations/fr";
import { en } from "./translations/en";

export type { Dict } from "./translation-types";

export const translations: Record<Locale, Dict> = { fr, en };
