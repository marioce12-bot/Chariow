"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { detectLocale, persistLocale, type Locale } from "./locales";
import { translations } from "./translations";

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

function getPath(dict: Record<string, unknown>, key: string): unknown {
  return key.split(".").reduce<unknown>((acc, part) => {
    if (acc && typeof acc === "object" && part in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[part];
    }
    return undefined;
  }, dict);
}

export function I18nProvider({ children }: { children: ReactNode }) {
  // Démarre en français au premier rendu serveur/client, puis s'aligne sur la
  // langue détectée (choix persisté ou langue du navigateur) dès le montage.
  const [locale, setLocaleState] = useState<Locale>("fr");

  useEffect(() => {
    setLocaleState(detectLocale());
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    persistLocale(next);
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      const raw = (getPath(translations[locale] as Record<string, unknown>, key) ?? getPath(translations.fr as Record<string, unknown>, key) ?? key) as string;
      if (!vars) return raw;
      return Object.entries(vars).reduce((acc, [name, value]) => acc.replaceAll(`{${name}}`, String(value)), raw);
    },
    [locale],
  );

  return <I18nContext.Provider value={{ locale, setLocale, t }}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n doit être utilisé dans un I18nProvider");
  return context;
}