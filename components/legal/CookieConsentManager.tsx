"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n/i18n";
import { COOKIE_CONSENT_CHANGED_EVENT, readCookieConsent, saveCookieConsent } from "@/lib/legal/cookie-consent";
import { disableMetaPixels, enableMetaPixel } from "@/lib/legal/meta-pixels";

const VENDEO_META_PIXEL_ID = "1096494316523399";

export function CookieConsentManager() {
  const { locale } = useI18n();
  const [visible, setVisible] = useState(false);
  const [ready, setReady] = useState(false);
  const en = locale === "en";

  useEffect(() => {
    const sync = () => {
      const consent = readCookieConsent();
      setVisible(!consent);
      setReady(true);
      if (consent?.marketing) enableMetaPixel(VENDEO_META_PIXEL_ID);
      else disableMetaPixels();
    };
    sync();
    window.addEventListener(COOKIE_CONSENT_CHANGED_EVENT, sync);
    return () => window.removeEventListener(COOKIE_CONSENT_CHANGED_EVENT, sync);
  }, []);

  if (!ready || !visible) return null;
  return (
    <aside className="cookie-consent-banner" role="region" aria-label={en ? "Cookie and tracker choices" : "Choix des cookies et traceurs"}>
      <div className="cookie-consent-copy">
        <strong>{en ? "Your privacy choices" : "Vos choix de confidentialité"}</strong>
        <p>{en
          ? "Essential storage keeps sign-in and language preferences working. Optional Meta advertising and measurement trackers stay off unless you allow them."
          : "Le stockage indispensable permet la connexion et mémorise la langue. Les traceurs Meta de publicité et de mesure restent désactivés tant que vous ne les autorisez pas."}</p>
        <Link href="/privacy">{en ? "Read the privacy policy" : "Lire la politique de confidentialité"}</Link>
      </div>
      <div className="cookie-consent-actions">
        <button type="button" className="cookie-choice-secondary" onClick={() => saveCookieConsent(false)}>{en ? "Reject optional" : "Tout refuser"}</button>
        <Link className="cookie-choice-settings" href="/cookies">{en ? "Customize" : "Personnaliser"}</Link>
        <button type="button" className="cookie-choice-primary" onClick={() => saveCookieConsent(true)}>{en ? "Allow optional" : "Tout accepter"}</button>
      </div>
    </aside>
  );
}
