// Solde publicitaire : constantes et helpers partagés entre l'API et l'interface.
// Aucun import serveur ici : ce fichier est aussi utilisé côté client.

export const AD_WITHDRAWAL_MIN_XOF = 2000;

// Réseaux mobile money du Bénin (codes SasPay, cf. docs.saspay.me/api-reference/reference/formats).
export const AD_WITHDRAWAL_NETWORKS = [
  { code: "mtn_bj", label: "MTN MoMo" },
  { code: "moov_bj", label: "Moov Money" },
  { code: "celtiis_bj", label: "Celtiis Cash" },
] as const;

export type AdWithdrawalNetwork = (typeof AD_WITHDRAWAL_NETWORKS)[number]["code"];

export function isAdWithdrawalNetwork(value: unknown): value is AdWithdrawalNetwork {
  return AD_WITHDRAWAL_NETWORKS.some((network) => network.code === value);
}

/**
 * Normalise un numéro béninois. Accepte le format local à 10 chiffres
 * (0197505050 — le 0 initial fait partie du numéro) ou international
 * (+2290197505050, 002290197505050, 2290197505050). Renvoie null si invalide :
 * SasPay ne reformate jamais un numéro local mal saisi, l'erreur n'apparaîtrait
 * qu'au refus du gateway, après réservation du montant.
 */
export function normalizeBeninMsisdn(input: string): string | null {
  let digits = input.replace(/[^\d]/g, "");
  if (digits.startsWith("00229")) digits = digits.slice(2);
  if (/^01\d{8}$/.test(digits)) return digits;
  if (/^229\d{10}$/.test(digits)) return digits;
  return null;
}

export type AdBalanceSummary = {
  currency: "XOF";
  balance: number;
  reserved: number;
  withdrawable: number;
  locked: boolean;
  pendingWithdrawals: number;
  minWithdrawal: number;
  recent: Array<{ id: string; amount: number; status: "pending" | "completed" | "failed"; network: string | null; created_at: string }>;
};
