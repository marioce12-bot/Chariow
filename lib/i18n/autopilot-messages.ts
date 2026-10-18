import type { Locale } from "./locales";
import { localizeFinancialMessage } from "./system-messages";

// Display-only exact matches. Never infer a blocker from metrics or rewrite unknown content.
const messages: Array<[string, string, string]> = [
  ["NO_BUDGET_LIMIT", "Aucun plafond quotidien valide n’est confirmé pour cette campagne. Aucune pause ni aucun changement de budget automatique.", "No valid daily limit has been confirmed for this campaign. No automatic pausing or budget changes."],
  ["CURRENCY_UNAVAILABLE", "Vendeo ne peut pas vérifier le montant dans la devise de cette campagne. Aucun changement automatique.", "Vendeo cannot verify the amount in this campaign’s currency. No automatic changes."],
  ["CURRENCY_MISMATCH", "La devise du plafond ne correspond plus à celle de la campagne. Vérifie à nouveau le plafond avant toute action automatique.", "The limit currency no longer matches the campaign currency. Check the limit again before any automatic action."],
  ["BUDGET_EXCEEDED", "Le budget prévu dépasserait ton plafond quotidien. Ce changement automatique est bloqué.", "The planned budget would exceed your daily limit. This automatic change is blocked."],
  ["Blocage : données fiables et suffisamment mûres indisponibles ; recommandation inconnue.",
    "Vendeo n’a pas encore assez de données fiables et de recul pour te conseiller de changer cette campagne.",
    "Vendeo does not yet have enough reliable data and history to recommend a change to this campaign."],
  ["Inconnu : aucun seuil CPA fiable ne peut être calculé à partir de la valeur client réelle ; ne pas modifier la campagne.",
    "Vendeo ne peut pas encore estimer combien tu peux dépenser pour obtenir un client, à partir de ce que tes clients rapportent réellement. Aucun changement n’est recommandé.",
    "Vendeo cannot yet estimate how much you can spend to acquire a customer based on what your customers actually bring in. No change is recommended."],
  ["Mutation automatique bloquée : le suivi fiable des ventes et les limites explicites de budget ne sont pas tous deux configurés et vérifiés côté serveur.",
    "Le suivi des ventes et une limite de budget ne sont pas encore tous deux confirmés par Vendeo. L’autopilote ne met donc aucune campagne en pause et ne change aucun budget.",
    "Sales tracking and a budget limit have not yet both been confirmed by Vendeo. Autopilot will not pause any campaign or change any budget."],
  ["Mutation automatique bloquée : le dernier suivi des ventes n’est pas explicitement complet.",
    "Vendeo n’a pas confirmé que toutes les dernières ventes ont bien été récupérées. Aucune pause ni aucun changement de budget automatique pour le moment.",
    "Vendeo has not confirmed that all the latest sales have been retrieved. No automatic pausing or budget changes for now."],
  ["Mutation automatique bloquée : synchronisation des ventes absente, future ou vieille de plus de 48 h.",
    "La dernière mise à jour des ventes est absente, datée dans le futur ou remonte à plus de 48 h. Aucune pause ni aucun changement de budget automatique pour le moment.",
    "The latest sales update is missing, dated in the future, or more than 48 hours old. No automatic pausing or budget changes for now."],
  ["Mutation automatique bloquée : aucune limite de budget explicite et valide n’est définie.",
    "Aucune limite de budget valide n’est confirmée. Aucune pause ni aucun changement de budget automatique pour le moment.",
    "No valid budget limit has been confirmed. No automatic pausing or budget changes for now."],
  ["Suivi des achats ou attribution à cette campagne non confirmé : aucune pause automatique ne sera déclenchée.",
    "Vendeo ne peut pas encore vérifier que les achats sont bien suivis et reliés à cette campagne. Il ne la mettra pas en pause automatiquement.",
    "Vendeo cannot yet verify that purchases are reliably tracked and linked to this campaign. It will not pause it automatically."],
  ["Aucune dépense enregistrée sur la période : rien à conclure pour l'instant.",
    "Aucune dépense publicitaire n’a été enregistrée sur cette période. Vendeo ne peut pas encore juger la rentabilité.",
    "No advertising spend has been recorded for this period. Vendeo cannot assess profitability yet."],
  ["Phase d'apprentissage : la campagne vient de démarrer, il n'y a pas encore assez de données pour juger sa rentabilité.",
    "La campagne est encore en phase de démarrage : il faut davantage de données et de recul pour savoir si elle est rentable.",
    "The campaign is still getting started: more data and history are needed to tell whether it is profitable."],
];

export function explainAutopilotMessage(message: string, locale: Locale): string {
  const match = messages.find(([source]) => source === message);
  return match ? match[locale === "en" ? 2 : 1] : localizeFinancialMessage(message, locale);
}
