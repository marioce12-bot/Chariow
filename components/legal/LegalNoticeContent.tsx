"use client";

import { useI18n } from "@/lib/i18n/i18n";
import { LegalDocumentShell } from "./LegalDocumentShell";

export default function LegalNoticeContent() {
  const { locale } = useI18n();
  const en = locale === "en";
  return (
    <LegalDocumentShell
      locale={locale}
      path="/legal-notice"
      title={en ? "Legal notice" : "Mentions légales"}
      intro={en
        ? "Identification information for Vendeo and its operator under the trade name RISHMTC."
        : "Informations d’identification de Vendeo et de son exploitant sous le nom commercial RISHMTC."}
    >
      <section>
        <h2>{en ? "Publisher and operator" : "Éditeur et exploitant"}</h2>
        <p>{en ? "Vendeo is operated under the trade name RISHMTC." : "Vendeo est exploité sous le nom commercial RISHMTC."}</p>
        <dl className="legal-details-list">
          <div><dt>{en ? "Commercial registration" : "Immatriculation commerciale"}</dt><dd>{en ? "RCCM Cotonou No. RB/COT/26 A 119887, registered 3 September 2026." : "RCCM Cotonou n° RB/COT/26 A 119887, immatriculé le 3 septembre 2026."}</dd></div>
          <div><dt>{en ? "Principal establishment" : "Établissement principal"}</dt><dd>{en ? "Îlot 3433, Plot C, Agla Les Pylônes, 13th arrondissement, Cotonou, Littoral, Benin." : "Îlot 3433, parcelle C, Agla Les Pylônes, 13e arrondissement, Cotonou, Littoral, Bénin."}</dd></div>
          <div><dt>{en ? "Business email" : "E-mail professionnel"}</dt><dd><a href="mailto:rishmtc@gmail.com">rishmtc@gmail.com</a></dd></div>
          <div><dt>{en ? "Business telephone" : "Téléphone professionnel"}</dt><dd><a href="tel:+2290167207218">+229 01 67 20 72 18</a></dd></div>
          <div><dt>{en ? "Vendeo service contact" : "Contact du service Vendeo"}</dt><dd><a href="mailto:vendeo008@gmail.com">vendeo008@gmail.com</a></dd></div>
          <div><dt>{en ? "WhatsApp support" : "Support WhatsApp"}</dt><dd><a href="https://wa.me/2290191829482" target="_blank" rel="noopener noreferrer">+229 01 91 82 94 82</a></dd></div>
        </dl>
      </section>
      <section>
        <h2>{en ? "Publication contact" : "Responsable de publication"}</h2>
        <p>RISHMTC</p>
      </section>
      <section>
        <h2>{en ? "Hosting" : "Hébergement"}</h2>
        <p>{en ? "Vercel Inc., 440 N Barranca Ave #4133, Covina, CA 91723, United States. Vercel’s official contact for privacy matters: privacy@vercel.com." : "Vercel Inc., 440 N Barranca Ave #4133, Covina, CA 91723, États-Unis. Contact officiel de Vercel pour les questions de confidentialité : privacy@vercel.com."}</p>
      </section>
      <section>
        <h2>{en ? "Intellectual property" : "Propriété intellectuelle"}</h2>
        <p>{en ? "The Vendeo name, interface and original materials are protected by applicable intellectual-property rules. You may not copy or redistribute them except as permitted by law or with authorization. Content supplied by users and merchants remains subject to the rights and licenses they hold." : "Le nom Vendeo, son interface et ses éléments originaux sont protégés par les règles de propriété intellectuelle applicables. Ils ne peuvent être copiés ou redistribués que dans les cas permis par la loi ou avec autorisation. Les contenus fournis par les utilisateurs et marchands restent soumis aux droits et licences qu’ils détiennent."}</p>
      </section>
      <section>
        <h2>{en ? "Related documents" : "Documents associés"}</h2>
        <ul>
          <li><a href="/terms">{en ? "Terms of Use" : "Conditions d’utilisation"}</a></li>
          <li><a href="/privacy">{en ? "Privacy Policy" : "Politique de confidentialité"}</a></li>
          <li><a href="/cookies">{en ? "Cookie and tracker settings" : "Réglages cookies et traceurs"}</a></li>
        </ul>
      </section>
    </LegalDocumentShell>
  );
}
