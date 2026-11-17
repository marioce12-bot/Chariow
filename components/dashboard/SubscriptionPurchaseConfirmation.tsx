"use client";

import Link from "next/link";

export function SubscriptionPurchaseConfirmation({
  locale,
  price,
  perMonth,
  billingNote,
  accepted,
  submitting,
  error,
  onAcceptedChange,
  onCancel,
  onConfirm,
}: {
  locale: "fr" | "en";
  price: string;
  perMonth: string;
  billingNote: string;
  accepted: boolean;
  submitting: boolean;
  error: string;
  onAcceptedChange: (value: boolean) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const en = locale === "en";
  return (
    <div className="studio-credit-modal-backdrop studio-credit-confirm-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !submitting) onCancel(); }}>
      <section
        className="studio-credit-modal studio-credit-confirm-modal subscription-purchase-confirm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="subscription-purchase-confirm-title"
        onKeyDown={(event) => { if (event.key === "Escape" && !submitting) onCancel(); }}
      >
        <div className="studio-credit-modal-head">
          <div>
            <span className="eyebrow">{en ? "Review before checkout" : "Vérification avant paiement"}</span>
            <h2 id="subscription-purchase-confirm-title">{en ? "Confirm your Vendeo subscription" : "Confirme ton abonnement Vendeo"}</h2>
          </div>
          <button type="button" className="studio-recharge-close" onClick={onCancel} disabled={submitting} aria-label={en ? "Close" : "Fermer"}>×</button>
        </div>
        <dl className="studio-credit-confirm-summary">
          <div><dt>{en ? "Plan" : "Offre"}</dt><dd>Vendeo</dd></div>
          <div><dt>{en ? "Displayed price" : "Tarif affiché"}</dt><dd>{price} {perMonth}</dd></div>
          <div className="is-total"><dt>{en ? "Billing" : "Facturation"}</dt><dd>{billingNote}</dd></div>
        </dl>
        <ul className="studio-credit-confirm-rules">
          <li>{en ? "Renewal is manual; Vendeo will not automatically charge you again." : "Le renouvellement est manuel ; Vendeo ne te facturera pas automatiquement une nouvelle période."}</li>
          <li>{en ? "The final amount is billed in XOF and shown by SasPay before you complete payment." : "Le montant final est facturé en XOF et affiché par SasPay avant la validation du paiement."}</li>
          <li>{en ? "Access starts after payment confirmation." : "L’accès commence après confirmation du paiement."}</li>
        </ul>
        <label className="studio-credit-confirm-check">
          <input type="checkbox" checked={accepted} onChange={(event) => onAcceptedChange(event.target.checked)} disabled={submitting} />
          <span>{en
            ? <>I confirm that I have read and accept Vendeo’s <Link href="/terms" target="_blank">Terms of Use</Link> and wish to continue to payment at the displayed price.</>
            : <>Je confirme avoir lu et accepter les <Link href="/terms" target="_blank">Conditions d’utilisation</Link> de Vendeo et souhaite poursuivre vers le paiement au tarif affiché.</>}</span>
        </label>
        <p className="studio-credit-confirm-payment-note">{en
          ? "This opens SasPay. This confirmation alone does not charge you; review and complete or cancel payment with the provider."
          : "Cette action ouvre SasPay. Cette confirmation seule ne te débite pas ; vérifie puis valide ou annule le paiement auprès du prestataire."}</p>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <div className="studio-credit-modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={submitting}>{en ? "Back" : "Retour"}</button>
          <button type="button" className="btn btn-dark" onClick={onConfirm} disabled={!accepted || submitting}>
            {submitting ? (en ? "Opening payment…" : "Ouverture du paiement…") : (en ? "Continue to SasPay" : "Continuer vers SasPay")}
          </button>
        </div>
      </section>
    </div>
  );
}
