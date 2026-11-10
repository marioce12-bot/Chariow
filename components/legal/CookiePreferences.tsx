"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/i18n";
import { readCookieConsent, saveCookieConsent } from "@/lib/legal/cookie-consent";

export function CookiePreferences() {
  const { locale } = useI18n();
  const en = locale === "en";
  const [marketing, setMarketing] = useState(false);
  const [ready, setReady] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setMarketing(readCookieConsent()?.marketing ?? false);
    setReady(true);
  }, []);

  function save(marketingAllowed: boolean) {
    setMarketing(marketingAllowed);
    saveCookieConsent(marketingAllowed);
    setSaved(true);
  }

  return (
    <section className="cookie-preferences" aria-labelledby="cookie-preferences-title">
      <div className="cookie-preferences-heading">
        <span className="cookie-category-icon" aria-hidden="true">✓</span>
        <div>
          <h2 id="cookie-preferences-title">{en ? "Your cookie and tracker settings" : "Vos réglages cookies et traceurs"}</h2>
          <p>{en ? "Change your choice at any time. Essential storage is always active; optional tracking is off by default." : "Vous pouvez modifier votre choix à tout moment. Le stockage indispensable reste actif ; les traceurs facultatifs sont désactivés par défaut."}</p>
        </div>
      </div>

      <div className="cookie-preference-row">
        <div>
          <strong>{en ? "Essential" : "Indispensables"}</strong>
          <p>{en ? "Authentication, security, language and saving your privacy choice. Required to provide the service." : "Connexion, sécurité, langue et mémorisation de votre choix de confidentialité. Nécessaires au service."}</p>
        </div>
        <span className="cookie-always-on">{en ? "Always on" : "Toujours actifs"}</span>
      </div>

      <label className="cookie-preference-row cookie-preference-toggle">
        <span>
          <strong>{en ? "Advertising and measurement" : "Publicité et mesure d’audience"}</strong>
          <p>{en
            ? "Meta Pixel on Vendeo and, on public storefronts, the seller’s configured Meta Pixel and Vendeo visit measurement. These may store or read identifiers and receive page-view or registration events."
            : "Pixel Meta sur Vendeo et, sur les vitrines publiques, pixel Meta configuré par le marchand et mesure des visites par Vendeo. Ces outils peuvent lire ou enregistrer des identifiants et recevoir des événements de visite ou d’inscription."}</p>
        </span>
        <input
          type="checkbox"
          checked={marketing}
          disabled={!ready}
          onChange={(event) => { setMarketing(event.target.checked); setSaved(false); }}
          aria-label={en ? "Allow advertising and measurement trackers" : "Autoriser les traceurs de publicité et de mesure"}
        />
      </label>

      <div className="cookie-preferences-actions">
        <button type="button" className="cookie-choice-secondary" onClick={() => save(false)} disabled={!ready}>{en ? "Reject optional" : "Refuser les optionnels"}</button>
        <button type="button" className="cookie-choice-secondary" onClick={() => save(marketing)} disabled={!ready}>{en ? "Save my choice" : "Enregistrer mon choix"}</button>
        <button type="button" className="cookie-choice-primary" onClick={() => save(true)} disabled={!ready}>{en ? "Allow all" : "Tout autoriser"}</button>
      </div>
      {saved ? <p className="cookie-preference-saved" role="status">{en ? "Your choice has been saved on this device." : "Votre choix a été enregistré sur cet appareil."}</p> : null}
    </section>
  );
}
