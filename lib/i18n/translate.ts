import type { Locale } from "./locales";
import { translations } from "./translations";
import { uiTranslations } from "./ui";
import { featureTranslations } from "./features";

export type TranslationVariables = Record<string, string | number>;

function getText(dict: Record<string, unknown>, key: string): string | undefined {
  const value = key in dict ? dict[key] : key.split(".").reduce<unknown>((current, part) => {
    if (current && typeof current === "object" && part in current) {
      return (current as Record<string, unknown>)[part];
    }
    return undefined;
  }, dict);
  return typeof value === "string" ? value : undefined;
}

export function translate(locale: Locale, key: string, vars?: TranslationVariables): string {
  const raw = getText(translations[locale], key)
    ?? getText(uiTranslations[locale], key)
    ?? getText(featureTranslations[locale], key)
    ?? getText(translations.fr, key)
    ?? getText(uiTranslations.fr, key)
    ?? getText(featureTranslations.fr, key)
    ?? key;
  if (!vars) return raw;
  // A callback keeps dollar signs literal and never substitutes placeholders
  // inside a user-provided value a second time.
  return raw.replace(/\{([^{}]+)\}/g, (placeholder, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : placeholder,
  );
}
