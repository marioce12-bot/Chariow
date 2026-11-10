"use client";

import { useI18n } from "@/lib/i18n/i18n";
import { CookiePreferences } from "./CookiePreferences";
import { LegalDocumentShell } from "./LegalDocumentShell";

export default function CookiePolicyContent() {
  const { locale } = useI18n();
  const en = locale === "en";
  return (
    <LegalDocumentShell
      locale={locale}
      path="/cookies"
      title={en ? "Cookies and trackers" : "Cookies et traceurs"}
      intro={en
        ? "Essential storage is used to make Vendeo work. Advertising and visit-measurement trackers are optional and remain off until you allow them."
        : "Le stockage indispensable permet à Vendeo de fonctionner. Les traceurs publicitaires et de mesure des visites sont facultatifs et restent désactivés jusqu’à votre accord."}
    >
      <CookiePreferences />
      <section>
        <h2>{en ? "Essential storage" : "Stockage indispensable"}</h2>
        <p>{en
          ? "Vendeo uses session cookies for authentication, a short-lived marker during password reset and a language preference cookie. Your consent choice is kept in local storage on this device. These items support the service and are not used to build advertising profiles."
          : "Vendeo utilise des cookies de session pour l’authentification, un marqueur temporaire lors d’une réinitialisation du mot de passe et un cookie de préférence de langue. Votre choix de consentement est conservé dans le stockage local de cet appareil. Ces éléments servent au fonctionnement du service et ne créent pas de profil publicitaire."}</p>
      </section>
      <section>
        <h2>{en ? "Optional advertising and measurement" : "Publicité et mesure facultatives"}</h2>
        <p>{en
          ? "When you allow optional trackers, Vendeo may load its Meta Pixel to measure page views and completed registrations. On a published merchant storefront, the merchant’s configured Meta Pixel and Vendeo’s visit measurement may also operate. A random visitor ID can be stored for up to one year; visit de-duplication uses session storage for the current browser session. Meta may set or read its own identifiers and receives the event and technical data described in the Privacy Policy."
          : "Lorsque vous autorisez les traceurs facultatifs, Vendeo peut charger son Pixel Meta pour mesurer les pages vues et les inscriptions terminées. Sur la vitrine publiée d’un marchand, le Pixel Meta configuré par celui-ci et la mesure des visites par Vendeo peuvent également fonctionner. Un identifiant visiteur aléatoire peut être conservé jusqu’à un an ; le dédoublonnage des visites utilise le stockage de session pour la session de navigation en cours. Meta peut lire ou enregistrer ses propres identifiants et reçoit les événements et données techniques décrits dans la Politique de confidentialité."}</p>
      </section>
      <section>
        <h2>{en ? "Change or withdraw your choice" : "Modifier ou retirer votre choix"}</h2>
        <p>{en
          ? "Use the settings above at any time. Rejecting optional trackers stops future optional tracking in this browser and asks the browser to remove Vendeo-controlled visitor and Meta identifiers where possible. Information already transmitted to an external provider cannot be recalled through this setting."
          : "Utilisez les réglages ci-dessus à tout moment. Le refus des traceurs facultatifs arrête les futurs suivis facultatifs dans ce navigateur et lui demande de supprimer les identifiants visiteur et Meta contrôlés par Vendeo lorsque cela est possible. Les informations déjà transmises à un prestataire externe ne peuvent pas être rappelées par ce réglage."}</p>
      </section>
    </LegalDocumentShell>
  );
}
