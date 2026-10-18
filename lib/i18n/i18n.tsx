"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { detectLocale, persistLocale, type Locale } from "./locales";
import { translate } from "./translate";

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  // Démarre en français au premier rendu serveur/client, puis s'aligne sur la
  // langue détectée (choix persisté ou langue du navigateur) dès le montage.
  const [locale, setLocaleState] = useState<Locale>("fr");
  const choiceRevision = useRef(0);

  useEffect(() => {
    let active = true;
    const initialRevision = choiceRevision.current;
    const detected = detectLocale();
    setLocaleState(detected);
    document.documentElement.lang = detected;
    fetch("/api/account/preferences", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((data: { locale?: Locale } | null) => {
        if (active && choiceRevision.current === initialRevision && (data?.locale === "fr" || data?.locale === "en")) {
          setLocaleState(data.locale);
          persistLocale(data.locale);
        }
      })
      .catch(() => {
        // Les pages publiques ou une ancienne base sans cette colonne gardent la préférence locale.
      });
    return () => { active = false; };
  }, []);

  const setLocale = useCallback((next: Locale) => {
    choiceRevision.current += 1;
    setLocaleState(next);
    persistLocale(next);
    void fetch("/api/account/preferences", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ locale: next }) }).catch(() => {
      // Le stockage local/cookie reste le repli si l'utilisateur n'est pas connecté.
    });
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => translate(locale, key, vars),
    [locale],
  );

  return <I18nContext.Provider value={{ locale, setLocale, t }}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n doit être utilisé dans un I18nProvider");
  return context;
}
