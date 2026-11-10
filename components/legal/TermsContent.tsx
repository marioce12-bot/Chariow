"use client";

import { useI18n } from "@/lib/i18n/i18n";
import { SHOPIFY_PRIVACY_COPY } from "@/lib/shopify/privacy-copy";
import { LegalDocumentShell } from "./LegalDocumentShell";

export default function TermsContent() {
  const { locale } = useI18n();
  const en = locale === "en";
  const shopify = SHOPIFY_PRIVACY_COPY[en ? "en" : "fr"];
  return (
    <LegalDocumentShell
      locale={locale}
      path="/terms"
      title={en ? "Terms of Use" : "Conditions d’utilisation"}
      intro={en
        ? "These terms explain the rules for using Vendeo, its subscriptions and Studio credits. They do not remove any rights that cannot legally be waived."
        : "Ces conditions précisent les règles d’utilisation de Vendeo, des abonnements et des crédits Studio. Elles ne suppriment aucun droit auquel il ne peut légalement être renoncé."}
    >
      <section>
        <h2>{en ? "1. Who provides Vendeo" : "1. Qui exploite Vendeo"}</h2>
        <p>{en
          ? <>Vendeo is operated under the trade name RISHMTC. Identification details are set out in the <a href="/legal-notice">legal notice</a>.</>
          : <>Vendeo est exploité sous le nom commercial RISHMTC. Les informations d’identification figurent dans les <a href="/legal-notice">mentions légales</a>.</>}</p>
      </section>

      <section>
        <h2>{en ? "2. Account and access" : "2. Compte et accès"}</h2>
        <p>{en
          ? "You must provide accurate account information, keep your sign-in credentials confidential and use the service lawfully. You are responsible for activity carried out through your account. Contact us promptly if you suspect unauthorized access."
          : "Vous devez fournir des informations exactes, garder confidentiels vos identifiants et utiliser le service conformément au droit applicable. Vous êtes responsable des actions effectuées depuis votre compte. Contactez-nous rapidement si vous soupçonnez un accès non autorisé."}</p>
        <p>{en
          ? "At sign-up, the version of these Terms and the Privacy Policy and the acceptance time are associated with your account metadata. You can review the current versions through the service-document links; any revision will show its own version and date."
          : "Lors de l’inscription, la version des présentes Conditions et de la Politique de confidentialité ainsi que l’heure d’acceptation sont associées aux métadonnées de votre compte. Les versions et dates de révision sont indiquées dans les documents du service."}</p>
      </section>

      <section>
        <h2>{en ? "3. Service and connected platforms" : "3. Service et plateformes connectées"}</h2>
        <p>{en
          ? "Vendeo provides software tools for managing digital commerce, campaigns, analysis and Studio creations. Some functions depend on third-party platforms, APIs or providers. Their availability and terms are outside Vendeo’s control. You remain responsible for authorizing each connection and reviewing the destination platform before confirming an action."
          : "Vendeo fournit des outils logiciels de gestion du commerce numérique, des campagnes, de l’analyse et des créations Studio. Certaines fonctions dépendent de plateformes, d’API ou de prestataires tiers. Leur disponibilité et leurs conditions ne relèvent pas du contrôle de Vendeo. Vous restez responsable d’autoriser chaque connexion et de vérifier la plateforme de destination avant de confirmer une action."}</p>
      </section>

      <section>
        <h2>{en ? "4. Subscriptions" : "4. Abonnements"}</h2>
        <p>{en
          ? "A subscription gives access to the features shown for the selected plan and period. It does not renew automatically. To continue after the period ends, you must choose to renew and complete a new payment. If you do not renew, subscription features may become unavailable when the active period expires."
          : "Un abonnement donne accès aux fonctions indiquées pour la formule et la période choisies. Il ne se renouvelle pas automatiquement. Pour continuer après la fin de la période, vous devez choisir de le renouveler et effectuer un nouveau paiement. Sans renouvellement, les fonctions liées à l’abonnement peuvent devenir indisponibles à l’échéance de la période active."}</p>
      </section>

      <section>
        <h2>{en ? "5. Studio credits" : "5. Crédits Studio"}</h2>
        <p>{en
          ? "The quantity and total price are shown before you continue to the payment provider. Credits are added only after payment is confirmed. Credits do not expire and cannot be transferred to another account. Their balance remains on your account, but use is blocked while you have no active subscription; access resumes if an active subscription is restored."
          : "La quantité et le prix total sont affichés avant de poursuivre vers le prestataire de paiement. Les crédits sont ajoutés uniquement après confirmation du paiement. Ils n’expirent pas et ne peuvent pas être transférés vers un autre compte. Leur solde reste associé à votre compte, mais leur utilisation est bloquée tant qu’aucun abonnement actif n’est en cours ; l’accès reprend si un abonnement actif est rétabli."}</p>
        <p>{en
          ? "A credit top-up is separate from a subscription and is not an automatic recurring charge. The final payment is made on the payment provider’s page after you review the amount."
          : "Une recharge de crédits est distincte d’un abonnement et ne constitue pas un prélèvement récurrent automatique. Le paiement final s’effectue sur la page du prestataire après vérification du montant."}</p>
      </section>

      <section>
        <h2>{en ? "6. Refund requests" : "6. Demandes de remboursement"}</h2>
        <p>{en
          ? "Nothing in these Terms is a blanket exclusion of refunds or of any mandatory consumer right. Requests are considered under the law applicable to the particular customer and transaction. Where a refund is due and returned by transfer, Vendeo may deduct only an actual fee charged by the payment provider for that return transfer, and only where the applicable law allows it. Any proposed deduction and its basis will be explained before processing; no such fee is deducted if it was not actually charged or if the law does not permit it."
          : "Les présentes Conditions n’excluent pas de manière générale les remboursements ni les droits impératifs du consommateur. Chaque demande est examinée selon le droit applicable à la personne et à la transaction concernées. Lorsqu’un remboursement est dû et renvoyé par transfert, Vendeo ne peut déduire que des frais réellement facturés par le prestataire pour ce transfert retour, et uniquement si le droit applicable l’autorise. Toute déduction envisagée et son fondement sont expliqués avant traitement ; aucun frais n’est déduit s’il n’a pas été effectivement facturé ou si la loi ne le permet pas."}</p>
        <p>{en
          ? "To request a review, email vendeo008@gmail.com with your account email and payment reference. Do not send a password or payment-card security code."
          : "Pour demander un examen, écrivez à vendeo008@gmail.com en indiquant l’adresse e-mail du compte et la référence du paiement. N’envoyez ni mot de passe ni code de sécurité de carte bancaire."}</p>
      </section>

      <section>
        <h2>{en ? "7. Shopify connections" : "7. Connexions Shopify"}</h2>
        <p>{en
          ? "By connecting Shopify, the merchant authorizes Vendeo to access the read_products and read_orders scopes and is responsible for having the legal basis and any notices or permissions required to provide store data for these purposes. This merchant authorization is not buyer consent and does not replace the merchant’s legal obligations to buyers. The merchant may revoke access by disconnecting or uninstalling the app."
          : "En connectant Shopify, le marchand autorise Vendeo à accéder aux autorisations read_products et read_orders et demeure responsable de disposer de la base légale ainsi que des informations ou autorisations requises pour transmettre les données de la boutique à ces fins. Cette autorisation du marchand n’est pas le consentement des acheteurs et ne remplace pas les obligations légales du marchand envers eux. Le marchand peut révoquer l’accès en déconnectant ou désinstallant l’application."}</p>
        <p>{shopify.retention}</p>
      </section>

      <section>
        <h2>{en ? "8. Your content and acceptable use" : "8. Vos contenus et règles d’utilisation"}</h2>
        <p>{en
          ? "You retain the rights you hold in the materials you provide. You authorize Vendeo to process them only as needed to provide the functions you request. Do not upload material you are not entitled to use, infringe another person’s rights, evade a platform’s rules or interfere with the service. You are responsible for reviewing generated content and for how you use it."
          : "Vous conservez les droits que vous détenez sur les éléments que vous fournissez. Vous autorisez Vendeo à les traiter uniquement dans la mesure nécessaire aux fonctions que vous demandez. Ne transmettez pas de contenu que vous n’avez pas le droit d’utiliser, qui porte atteinte aux droits d’autrui, contourne les règles d’une plateforme ou perturbe le service. Vous restez responsable de vérifier les créations générées et de leur utilisation."}</p>
      </section>

      <section>
        <h2>{en ? "9. Availability and changes" : "9. Disponibilité et évolutions"}</h2>
        <p>{en
          ? "We work to keep Vendeo available and secure, but cannot promise uninterrupted access or that every third-party integration will always work. We may maintain, change or discontinue a feature for operational, security or legal reasons. Nothing here limits liability or rights that cannot legally be excluded."
          : "Nous nous efforçons de maintenir Vendeo disponible et sécurisé, sans pouvoir garantir un accès ininterrompu ni le fonctionnement permanent de chaque intégration tierce. Nous pouvons maintenir, modifier ou retirer une fonction pour des raisons opérationnelles, de sécurité ou juridiques. Aucune disposition ne limite une responsabilité ou un droit qui ne peut légalement être écarté."}</p>
      </section>

      <section>
        <h2>{en ? "10. Applicable rules and contact" : "10. Règles applicables et contact"}</h2>
        <p>{en
          ? <>These Terms are subject to mandatory rules applicable to you. Nothing in them removes protections that apply in your country or predetermines a court’s jurisdiction. For service support, email <a href="mailto:vendeo008@gmail.com">vendeo008@gmail.com</a> or message us on <a href="https://wa.me/2290191829482" target="_blank" rel="noopener noreferrer">WhatsApp at +229 01 91 82 94 82</a>.</>
          : <>Les présentes Conditions sont soumises aux règles impératives applicables à votre situation. Elles ne retirent pas les protections prévues dans votre pays et ne préjugent pas de la compétence d’une juridiction. Pour le support, écrivez à <a href="mailto:vendeo008@gmail.com">vendeo008@gmail.com</a> ou envoyez-nous un message sur <a href="https://wa.me/2290191829482" target="_blank" rel="noopener noreferrer">WhatsApp au +229 01 91 82 94 82</a>.</>}</p>
      </section>
    </LegalDocumentShell>
  );
}
