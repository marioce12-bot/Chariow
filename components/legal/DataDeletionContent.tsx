"use client";

import Link from "next/link";
import { useI18n } from "@/lib/i18n/i18n";
import { LegalDocumentShell } from "./LegalDocumentShell";

export default function DataDeletionContent() {
  const { locale } = useI18n();
  const en = locale === "en";
  return (
    <LegalDocumentShell
      locale={locale}
      path="/data-deletion"
      title={en ? "Data deletion" : "Suppression des données"}
      intro={en
        ? "You can ask Vendeo to close your account and delete personal information from active service systems, subject to records that must or may be retained."
        : "Vous pouvez demander la fermeture de votre compte et l’effacement des données personnelles des systèmes actifs de Vendeo, sous réserve des informations qui doivent ou peuvent être conservées."}
    >
      <section>
        <h2>{en ? "1. Send your request" : "1. Envoyer votre demande"}</h2>
        <p>{en
          ? <>Email <a href="mailto:vendeo008@gmail.com?subject=Data%20deletion%20request">vendeo008@gmail.com</a> with the subject “Data deletion request”. Use the email address associated with your Vendeo account and say whether you want to close the account as well.</>
          : <>Écrivez à <a href="mailto:vendeo008@gmail.com?subject=Demande%20de%20suppression%20des%20donn%C3%A9es">vendeo008@gmail.com</a> avec l’objet « Demande de suppression des données ». Utilisez l’adresse liée à votre compte Vendeo et indiquez si vous souhaitez également fermer ce compte.</>}</p>
        <p>{en
          ? "Do not send your password, payment-card number or security code. We may ask for limited information to verify that you control the account."
          : "N’envoyez pas votre mot de passe, votre numéro de carte bancaire ni son code de sécurité. Nous pouvons demander quelques informations limitées afin de vérifier que vous contrôlez le compte."}</p>
      </section>
      <section>
        <h2>{en ? "2. What happens next" : "2. Étapes de traitement"}</h2>
        <ul>
          <li>{en ? "We review the request and verify the account where needed." : "Nous examinons la demande et vérifions le compte si nécessaire."}</li>
          <li>{en ? "We remove or anonymize information from active Vendeo systems where deletion is appropriate." : "Nous supprimons ou anonymisons les informations des systèmes actifs de Vendeo lorsque l’effacement est approprié."}</li>
          <li>{en ? "We may retain limited transaction, security or dispute records where applicable obligations or legitimate protection require it." : "Nous pouvons conserver certaines données limitées de transaction, de sécurité ou de différend lorsque des obligations applicables ou la protection légitime le nécessitent."}</li>
          <li>{en ? "Backups, logs and copies already held by external providers may remain until their own retention and deletion processes run." : "Des sauvegardes, journaux et copies déjà détenues par des prestataires externes peuvent subsister jusqu’à l’application de leurs propres règles de conservation et de suppression."}</li>
        </ul>
      </section>
      <section>
        <h2>{en ? "3. Connected services" : "3. Services connectés"}</h2>
        <p>{en
          ? "Disconnecting an integration or deleting your Vendeo account does not automatically delete information held by Shopify, Meta, Chariow, SasPay or another connected provider. Use that provider’s own privacy controls for information it holds. For Shopify data handled by Vendeo, verified privacy requests are processed as described in the Privacy Policy."
          : "La déconnexion d’une intégration ou la suppression du compte Vendeo n’efface pas automatiquement les données détenues par Shopify, Meta, Chariow, SasPay ou un autre prestataire connecté. Pour les données détenues par ces services, utilisez leurs propres réglages de confidentialité. Les demandes vérifiées relatives aux données Shopify traitées par Vendeo sont gérées comme indiqué dans la Politique de confidentialité."}</p>
        <p>{en
          ? <>For how information is collected, used and retained, read the <Link href="/privacy">Privacy Policy</Link>. You can also review the <Link href="/terms">Terms of Use</Link>.</>
          : <>Pour savoir quelles données sont collectées, utilisées et conservées, consultez la <Link href="/privacy">Politique de confidentialité</Link>. Vous pouvez également lire les <Link href="/terms">Conditions d’utilisation</Link>.</>}</p>
      </section>
    </LegalDocumentShell>
  );
}
