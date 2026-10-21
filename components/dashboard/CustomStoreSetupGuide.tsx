"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Info } from "lucide-react";

/** Preparation only. No custom-store connector, import or webhook is enabled here. */
export function CustomStoreSetupGuide({ en, onChangeType }: { en: boolean; onChangeType: () => void }) {
  const [step, setStep] = useState(0);
  const [catalogMethod, setCatalogMethod] = useState<"feed" | "csv">("feed");
  const heading = useRef<HTMLHeadingElement>(null);
  const labels = en ? ["Catalog", "Webhooks", "Verification"] : ["Catalogue", "Webhooks", "Vérification"];
  const titles = en
    ? ["Prepare your catalog", "Prepare order events", "Test before connecting"]
    : ["Préparer ton catalogue", "Préparer les événements de commande", "Tester avant de connecter"];

  useEffect(() => {
    heading.current?.focus();
    const dialog = heading.current?.closest<HTMLElement>('[role="dialog"]');
    if (dialog) dialog.scrollTop = 0;
  }, [step]);

  return <>
    <h2 id="store-connect-title" ref={heading} tabIndex={-1}>{titles[step]}</h2>
    <p id="store-connect-description">{en ? `Custom store · Step ${step + 1} of 3` : `Boutique personnalisée · Étape ${step + 1} sur 3`}</p>
    <ol className="custom-store-steps" aria-label={en ? "Setup preparation steps" : "Étapes de préparation"}>
      {labels.map((label, index) => <li key={label} aria-current={step === index ? "step" : undefined}><span>{index + 1}</span>{label}</li>)}
    </ol>
    <div className="custom-store-notice"><Info size={18} aria-hidden="true" /><p>{en
      ? "Preparation guide only. Custom-store integration is not available yet in Vendeo. Reading these steps does not connect your store or activate sales tracking."
      : "Guide de préparation uniquement. L’intégration des boutiques personnalisées n’est pas encore disponible dans Vendeo. Lire ces étapes ne connecte pas ta boutique et n’active pas le suivi des ventes."}</p></div>
    <div className="custom-store-content">
      {step === 0 && <>
        <h3>{en ? "1. Choose how to prepare your products" : "1. Choisis comment préparer tes produits"}</h3>
        <fieldset className="custom-store-methods">
          <legend>{en ? "Catalog source" : "Source du catalogue"}</legend>
          <label><input type="radio" name="custom-catalog-method" value="feed" checked={catalogMethod === "feed"} onChange={() => setCatalogMethod("feed")} />{en ? "Feed / API" : "Flux / API"}</label>
          <label><input type="radio" name="custom-catalog-method" value="csv" checked={catalogMethod === "csv"} onChange={() => setCatalogMethod("csv")} />{en ? "CSV file" : "Fichier CSV"}</label>
        </fieldset>
        {catalogMethod === "feed" ? <p>{en
          ? "Prepare your product-feed URL or your API documentation. Plan read-only access limited to the catalog. Do not share an administrator password."
          : "Prépare l’URL de ton flux produits ou la documentation de ton API. Prévois un accès en lecture seule, limité au catalogue. Ne partage pas de mot de passe administrateur."}</p>
          : <p>{en
            ? "Prepare a CSV file with one row per product, using UTF-8 and a comma separator. Use stable product IDs so later orders can be matched to the right products."
            : "Prépare un fichier CSV avec une ligne par produit, encodé en UTF-8 et séparé par des virgules. Garde des identifiants produits stables pour rattacher les commandes aux bons produits."}</p>}
        <p><strong>{en ? "Required information to prepare:" : "Informations à préparer :"}</strong></p>
        <ul><li>{en ? "Stable product ID and title." : "Identifiant produit stable et titre."}</li><li>{en ? "Price and currency, such as USD or XOF." : "Prix et devise, par exemple USD ou XOF."}</li><li>{en ? "Product-page URL and image URL." : "URL de la fiche produit et URL de l’image."}</li></ul>
        {catalogMethod === "csv" && <div className="custom-store-example"><span>{en ? "Suggested CSV headers" : "En-têtes CSV proposés"}</span><code>id,title,price,currency,url,image_url</code></div>}
        <p className="custom-store-pending">{en ? "Not imported. No upload or feed connection is available at this stage." : "Non importé. Aucun envoi de fichier ni branchement de flux n’est disponible à cette étape."}</p>
      </>}
      {step === 1 && <>
        <h3>{en ? "2. Plan secure order webhooks" : "2. Prévois des webhooks de commande sécurisés"}</h3>
        <p>{en ? "Ask your developer to prepare events for paid orders and refunds. A simple visit or checkout attempt must not be counted as a sale." : "Demande à ton développeur de préparer les événements de commande payée et de remboursement. Une visite ou une tentative de paiement ne doit pas être comptée comme une vente."}</p>
        <ul>
          <li>{en ? "Include a unique event ID, order ID, date, amount, currency and product IDs." : "Prévoir un identifiant d’événement unique, l’identifiant de commande, la date, le montant, la devise et les identifiants produits."}</li>
          <li>{en ? "Plan an HMAC-SHA256 signature, a shared secret and a timestamp so requests can be verified." : "Prévoir une signature HMAC-SHA256, un secret partagé et un horodatage pour vérifier les requêtes."}</li>
          <li>{en ? "Plan duplicate detection and retries so the same order is never counted twice." : "Prévoir la détection des doublons et les nouvelles tentatives pour ne jamais compter deux fois la même commande."}</li>
        </ul>
        <p className="custom-store-pending">{en ? "Not configured. Vendeo does not generate a custom-store webhook URL or secret yet. Do not send real orders to an assumed endpoint." : "Non configuré. Vendeo ne génère pas encore d’URL webhook ni de secret pour les boutiques personnalisées. N’envoie pas de vraies commandes à une adresse supposée."}</p>
      </>}
      {step === 2 && <>
        <h3>{en ? "3. Verify before activating anything" : "3. Vérifie avant toute activation"}</h3>
        <p>{en ? "Once a real connector is available and configured, these checks must pass before a store can be shown as connected:" : "Lorsqu’un vrai connecteur sera disponible et configuré, ces contrôles devront réussir avant d’afficher une boutique comme connectée :"}</p>
        <ul>
          <li>{en ? "Check imported product IDs, prices, currencies and images against the source store." : "Comparer les identifiants, prix, devises et images importés avec la boutique source."}</li>
          <li>{en ? "Send a test paid order, replay it to check deduplication, then test a refund." : "Envoyer une commande payée de test, la renvoyer pour vérifier les doublons, puis tester un remboursement."}</li>
          <li>{en ? "Reject invalid signatures and verify that orders and totals belong to the right store." : "Rejeter les signatures invalides et vérifier que les commandes et les totaux sont rattachés à la bonne boutique."}</li>
        </ul>
        <dl className="custom-store-status" aria-label={en ? "Actual integration status" : "État réel de l’intégration"}>
          <div><dt>{en ? "Catalog" : "Catalogue"}</dt><dd>{en ? "Not imported" : "Non importé"}</dd></div>
          <div><dt>Webhook</dt><dd>{en ? "Not configured" : "Non configuré"}</dd></div>
          <div><dt>{en ? "Tests" : "Tests"}</dt><dd>{en ? "Not run" : "Non exécutés"}</dd></div>
          <div><dt>{en ? "Store" : "Boutique"}</dt><dd>{en ? "Not connected" : "Non connectée"}</dd></div>
          <div><dt>{en ? "Sales tracking" : "Suivi des ventes"}</dt><dd>{en ? "Inactive" : "Inactif"}</dd></div>
        </dl>
        <p className="custom-store-pending">{en ? "Verification is unavailable until a working import and secure webhook are implemented. No test has been run by this guide." : "La vérification est indisponible tant qu’un import fonctionnel et un webhook sécurisé ne sont pas en place. Ce guide n’a exécuté aucun test."}</p>
      </>}
    </div>
    <div className="custom-store-actions">
      {step > 0 && <button type="button" className="store-connection-back" onClick={() => setStep(step - 1)}><ArrowLeft size={15} aria-hidden="true" />{en ? "Previous step" : "Étape précédente"}</button>}
      {step < 2 && <button type="button" className="btn btn-dark store-connection-cta" onClick={() => setStep(step + 1)}>{en ? "Next step" : "Étape suivante"}<ArrowRight size={16} aria-hidden="true" /></button>}
    </div>
    <button type="button" className="store-connection-back" onClick={onChangeType}>{en ? "Change store type" : "Changer de type de boutique"}</button>
  </>;
}
