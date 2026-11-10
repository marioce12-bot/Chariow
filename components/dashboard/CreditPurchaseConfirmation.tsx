"use client";

import Link from "next/link";

export function CreditPurchaseConfirmation({
  locale,
  credits,
  unitPrice,
  total,
  currentBalance,
  accepted,
  submitting,
  error,
  onAcceptedChange,
  onCancel,
  onConfirm,
}: {
  locale: "fr" | "en";
  credits: number;
  unitPrice: number;
  total: number;
  currentBalance: number;
  accepted: boolean;
  submitting: boolean;
  error: string;
  onAcceptedChange: (value: boolean) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const en = locale === "en";
  const format = (value: number) => value.toLocaleString(en ? "en-US" : "fr-FR");
  return (
    <div className="studio-credit-modal-backdrop studio-credit-confirm-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !submitting) onCancel(); }}>
      <section
        className="studio-credit-modal studio-credit-confirm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="studio-credit-confirm-title"
        onKeyDown={(event) => { if (event.key === "Escape" && !submitting) onCancel(); }}
      >
        <div className="studio-credit-modal-head">
          <div>
            <span className="eyebrow">{en ? "Review before checkout" : "Vérification avant paiement"}</span>
            <h2 id="studio-credit-confirm-title">{en ? "Confirm this credit top-up" : "Confirme cette recharge de crédits"}</h2>
          </div>
          <button type="button" className="studio-recharge-close" onClick={onCancel} disabled={submitting} aria-label={en ? "Close" : "Fermer"}>×</button>
        </div>

        <dl className="studio-credit-confirm-summary">
          <div><dt>{en ? "Credits to add" : "Crédits à ajouter"}</dt><dd>{format(credits)} {en ? "credits" : "crédits"}</dd></div>
          <div><dt>{en ? "Price per credit" : "Prix par crédit"}</dt><dd>{unitPrice.toLocaleString(en ? "en-US" : "fr-FR")} XOF</dd></div>
          <div><dt>{en ? "Available balance" : "Solde disponible"}</dt><dd>{format(currentBalance)} {en ? "credits" : "crédits"}</dd></div>
          <div className="is-total"><dt>{en ? "Total to pay" : "Total à payer"}</dt><dd>{format(total)} XOF</dd></div>
        </dl>

        <ul className="studio-credit-confirm-rules">
          <li>{en ? "Credits do not expire and cannot be transferred." : "Les crédits n’expirent pas et ne sont pas transférables."}</li>
          <li>{en ? "Your balance remains on your account, but use is blocked while there is no active subscription." : "Le solde reste sur ton compte, mais son utilisation est bloquée sans abonnement actif."}</li>
          <li>{en ? "This is a one-time credit top-up, not an automatically renewing subscription." : "C’est une recharge ponctuelle, pas un abonnement à renouvellement automatique."}</li>
        </ul>

        <label className="studio-credit-confirm-check">
          <input type="checkbox" checked={accepted} onChange={(event) => onAcceptedChange(event.target.checked)} disabled={submitting} />
          <span>{en
            ? <>I confirm that I want to request <strong>{format(credits)} credits for {format(total)} XOF</strong> and have reviewed the <Link href="/terms" target="_blank">Terms</Link>.</>
            : <>Je confirme demander <strong>{format(credits)} crédits pour {format(total)} XOF</strong> et avoir consulté les <Link href="/terms" target="_blank">Conditions</Link>.</>}</span>
        </label>

        <p className="studio-credit-confirm-payment-note">{en
          ? "This opens SasPay. You will not be charged by this button alone; complete or cancel payment on SasPay. Credits are added only after payment confirmation."
          : "Cette action ouvre SasPay. Ce bouton seul ne débite rien : tu confirmes ou annules le paiement sur SasPay. Les crédits sont ajoutés uniquement après confirmation du paiement."}</p>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <div className="studio-credit-modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={submitting}>{en ? "Back" : "Retour"}</button>
          <button type="button" className="btn btn-dark" onClick={onConfirm} disabled={!accepted || submitting || total <= 0}>
            {submitting ? (en ? "Opening SasPay…" : "Ouverture de SasPay…") : `${en ? "Continue to SasPay" : "Continuer vers SasPay"} · ${format(total)} XOF`}
          </button>
        </div>
      </section>
    </div>
  );
}
