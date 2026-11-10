"use client";

import Link from "next/link";
import { useI18n } from "@/lib/i18n/i18n";
import { SHOPIFY_PRIVACY_COPY } from "@/lib/shopify/privacy-copy";
import { LegalDocumentShell } from "./LegalDocumentShell";

export default function PrivacyContent() {
  const { locale } = useI18n();
  const en = locale === "en";
  const shopify = SHOPIFY_PRIVACY_COPY[en ? "en" : "fr"];
  return (
    <LegalDocumentShell
      locale={locale}
      path="/privacy"
      title={en ? "Privacy Policy" : "Politique de confidentialité"}
      intro={en
        ? "This policy describes what Vendeo processes to provide the service, who may receive the data and how you can exercise your choices."
        : "Cette politique explique les données traitées pour fournir Vendeo, les destinataires possibles et la manière d’exercer vos choix."}
    >
      <section>
        <h2>{en ? "1. Who is responsible" : "1. Qui est responsable"}</h2>
        <p>{en
          ? <>Vendeo is operated under the trade name RISHMTC. See the <Link href="/legal-notice">legal notice</Link> for identification details. For privacy requests, contact <a href="mailto:vendeo008@gmail.com">vendeo008@gmail.com</a>.</>
          : <>Vendeo est exploité sous le nom commercial RISHMTC. Consultez les <Link href="/legal-notice">mentions légales</Link> pour les informations d’identification. Pour toute demande relative à la confidentialité, écrivez à <a href="mailto:vendeo008@gmail.com">vendeo008@gmail.com</a>.</>}</p>
      </section>

      <section>
        <h2>{en ? "2. Information we process" : "2. Informations traitées"}</h2>
        <ul>
          <li>{en ? "Account details such as your name, email address, authentication identifiers and preferences." : "Les informations de compte, comme le nom, l’adresse e-mail, les identifiants d’authentification et les préférences."}</li>
          <li>{en ? "Subscription, payment-provider references, credit balance and service-use records. Payment details entered on the provider’s page are handled under that provider’s terms; do not send card details to Vendeo support." : "Les informations d’abonnement, références du prestataire de paiement, solde de crédits et traces d’utilisation du service. Les données de paiement saisies sur la page du prestataire sont traitées selon ses conditions ; ne transmettez pas de données de carte au support Vendeo."}</li>
          <li>{en ? "Information you connect from commerce or advertising platforms, and content you submit to use requested functions." : "Les informations que vous connectez depuis les plateformes de commerce ou de publicité, ainsi que les contenus transmis pour utiliser les fonctions demandées."}</li>
          <li>{en ? "Security and technical information needed to operate the service, diagnose errors and prevent abuse." : "Les informations techniques et de sécurité nécessaires au fonctionnement du service, au diagnostic des erreurs et à la prévention des abus."}</li>
          <li>{en ? "If you accept optional tracking, a random visitor identifier, campaign parameters and page-view or registration events may be processed." : "Si vous acceptez les traceurs facultatifs, un identifiant visiteur aléatoire, des paramètres de campagne et des événements de visite ou d’inscription peuvent être traités."}</li>
        </ul>
      </section>

      <section>
        <h2>{en ? "3. Why we use it" : "3. Pourquoi ces données sont utilisées"}</h2>
        <ul>
          <li>{en ? "To create and secure your account and provide the features you request." : "Créer et sécuriser votre compte et fournir les fonctions que vous demandez."}</li>
          <li>{en ? "To manage subscriptions, credit top-ups, payment status, receipts and customer requests." : "Gérer les abonnements, recharges de crédits, statuts de paiement, reçus et demandes des utilisateurs."}</li>
          <li>{en ? "To show commerce dashboards, campaign analysis and Studio history for connected accounts." : "Afficher les tableaux de bord commerciaux, analyses de campagnes et historique Studio des comptes connectés."}</li>
          <li>{en ? "To send essential account and service messages, protect the service and meet legal obligations that apply." : "Envoyer les messages indispensables sur le compte et le service, protéger le service et respecter les obligations légales applicables."}</li>
          <li>{en ? "To measure visits or advertising results only when optional tracking consent is active." : "Mesurer les visites ou résultats publicitaires uniquement lorsque le consentement aux traceurs facultatifs est actif."}</li>
        </ul>
      </section>

      <section>
        <h2>{en ? "4. Shopify information" : "4. Données Shopify"}</h2>
        <p>{shopify.data}</p>
        <p>{shopify.use}</p>
        <p>{shopify.retention}</p>
      </section>

      <section>
        <h2>{en ? "5. Service providers and other recipients" : "5. Prestataires et autres destinataires"}</h2>
        <ul>
          <li>{en ? "Vercel hosts and runs the application; Supabase provides authentication and database services." : "Vercel héberge et exécute l’application ; Supabase fournit l’authentification et la base de données."}</li>
          <li>{en ? "SasPay processes subscription and credit payments. Vendeo receives payment status and transaction references needed to update your account." : "SasPay traite les paiements d’abonnement et de crédits. Vendeo reçoit le statut et les références de transaction nécessaires à la mise à jour du compte."}</li>
          <li>{en ? "Brevo receives your name and email for signup notifications. Email authentication may also use the configured mail provider." : "Brevo reçoit le nom et l’adresse e-mail pour les notifications d’inscription. L’authentification par e-mail peut également utiliser le prestataire de messagerie configuré."}</li>
          <li>{en ? "Meta receives events from its Pixel only after consent to optional tracking. On a public shop, the merchant’s own configured Pixel can also receive events after that consent." : "Meta reçoit les événements de son Pixel uniquement après accord aux traceurs facultatifs. Sur une vitrine publique, le Pixel configuré par le marchand peut également recevoir des événements après cet accord."}</li>
          <li>{en ? "When you use a feature that sends content to an AI provider, the content needed for that feature may be sent to the provider named in the feature or its interface." : "Lorsque vous utilisez une fonction qui transmet du contenu à un fournisseur d’IA, le contenu nécessaire à cette fonction peut être envoyé au fournisseur indiqué dans la fonction ou son interface."}</li>
        </ul>
        <p>{shopify.sharing}</p>
        <p>{en ? "Some service providers may process data outside Benin. Their own terms and privacy information also apply to their services." : "Certains prestataires peuvent traiter des données en dehors du Bénin. Leurs propres conditions et informations de confidentialité s’appliquent également à leurs services."}</p>
      </section>

      <section>
        <h2>{en ? "6. Cookies, local storage and trackers" : "6. Cookies, stockage local et traceurs"}</h2>
        <p>{en
          ? "Essential storage supports sign-in, password-reset flow, language selection and saving your privacy choice. These functions do not run advertising measurement. Optional marketing and measurement tools are off until you explicitly allow them."
          : "Le stockage indispensable prend en charge la connexion, la procédure de réinitialisation du mot de passe, le choix de la langue et la mémorisation de votre choix de confidentialité. Ces fonctions ne réalisent pas de mesure publicitaire. Les outils facultatifs de publicité et de mesure restent désactivés jusqu’à votre accord explicite."}</p>
        <ul>
          <li>{en ? "Essential: Supabase authentication storage, the short-lived password-reset marker and the language preference cookie; the consent choice is stored locally on your device." : "Indispensables : stockage d’authentification Supabase, marqueur temporaire de réinitialisation du mot de passe et cookie de langue ; le choix de consentement est enregistré localement sur votre appareil."}</li>
          <li>{en ? "Optional: Vendeo’s Meta Pixel may receive PageView and CompleteRegistration events. On a published storefront, the merchant-configured Meta Pixel and Vendeo visit measurement may also run. A random visitor identifier can be stored for up to one year, and a visit marker is kept for the current browser session." : "Facultatifs : le Pixel Meta de Vendeo peut recevoir les événements PageView et CompleteRegistration. Sur une vitrine publiée, le Pixel Meta configuré par le marchand et la mesure des visites par Vendeo peuvent aussi fonctionner. Un identifiant visiteur aléatoire peut être conservé jusqu’à un an et un marqueur de visite pendant la session de navigation."}</li>
          <li>{en ? "You can change or withdraw your optional choice at any time on the cookie settings page. Withdrawal stops future optional tracking in this browser and removes Vendeo-controlled visitor and Meta identifiers where the browser permits; it cannot recall data already sent to a provider." : "Vous pouvez modifier ou retirer votre choix facultatif à tout moment depuis les réglages cookies. Le retrait arrête les prochains traceurs facultatifs dans ce navigateur et supprime les identifiants visiteur et Meta contrôlés par Vendeo lorsque le navigateur le permet ; il ne peut pas rappeler les données déjà transmises à un prestataire."}</li>
        </ul>
        <p><Link href="/cookies">{en ? "Manage cookie and tracker settings" : "Gérer les réglages cookies et traceurs"}</Link></p>
      </section>

      <section>
        <h2>{en ? "7. Retention" : "7. Durées de conservation"}</h2>
        <p>{en
          ? "We keep account and service information for as long as needed to provide the service and manage your account. Financial and security records may be kept for the period required by applicable obligations or to resolve disputes. When a specific retention period is known for a connected service, it is described above; active-database periods do not guarantee immediate removal from backups, logs or copies held by external providers."
          : "Nous conservons les informations du compte et du service aussi longtemps que nécessaire pour fournir le service et gérer votre compte. Les données financières et de sécurité peuvent être conservées pendant la durée nécessaire au respect des obligations applicables ou au règlement d’un différend. Lorsqu’une durée précise est connue pour un service connecté, elle est indiquée ci-dessus ; les durées en base active ne garantissent pas une suppression immédiate des sauvegardes, journaux ou copies conservées par des prestataires externes."}</p>
      </section>

      <section>
        <h2>{en ? "8. Your choices and requests" : "8. Vos choix et demandes"}</h2>
        <p>{en
          ? <>Depending on the law that applies to you, you may request access, correction, deletion or restriction of personal information. Email <a href="mailto:vendeo008@gmail.com">vendeo008@gmail.com</a> from your account address and describe your request. You can also use the <Link href="/data-deletion">data deletion page</Link>. We may need to verify your identity and retain some information where law requires or permits it.</>
          : <>Selon le droit applicable à votre situation, vous pouvez demander l’accès, la rectification, l’effacement ou la limitation de certaines données. Écrivez à <a href="mailto:vendeo008@gmail.com">vendeo008@gmail.com</a> depuis l’adresse du compte en précisant votre demande. Vous pouvez aussi consulter la page de <Link href="/data-deletion">suppression des données</Link>. Nous pouvons devoir vérifier votre identité et conserver certaines informations lorsque la loi l’exige ou le permet.</>}</p>
        <p>{en
          ? "When you sign up, the document versions and acceptance time are attached to account metadata so the accepted versions can be identified."
          : "Lors de l’inscription, les versions des documents et l’heure d’acceptation sont associées aux métadonnées du compte afin d’identifier les versions acceptées."}</p>
      </section>

      <section>
        <h2>{en ? "9. Policy changes and contact" : "9. Modifications et contact"}</h2>
        <p>{en
          ? <>If this policy changes, the new draft or effective version will display its revision date. For privacy questions or requests, email <a href="mailto:vendeo008@gmail.com">vendeo008@gmail.com</a>. For general support, you can also message us on <a href="https://wa.me/2290191829482" target="_blank" rel="noopener noreferrer">WhatsApp at +229 01 91 82 94 82</a>.</>
          : <>En cas de modification, la nouvelle version de travail ou en vigueur affichera sa date de révision. Pour toute question ou demande relative aux données, écrivez à <a href="mailto:vendeo008@gmail.com">vendeo008@gmail.com</a>. Pour le support général, vous pouvez également nous écrire sur <a href="https://wa.me/2290191829482" target="_blank" rel="noopener noreferrer">WhatsApp au +229 01 91 82 94 82</a>.</>}</p>
      </section>
    </LegalDocumentShell>
  );
}
