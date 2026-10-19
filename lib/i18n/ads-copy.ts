import type { Locale } from "./locales";

export const adsCopy: Record<Locale, Record<string, string>> = {
  fr: {
    "adsExtra.status.draft": "Brouillon", "adsExtra.status.account_required": "Compte requis",
    "adsExtra.status.submitting": "Création en cours…", "adsExtra.status.paused": "Suspendue",
    "adsExtra.status.meta_paused": "En pause chez Meta", "adsExtra.status.autopilot_paused": "Mise en pause par le pilote",
    "adsExtra.status.paid": "Prête à lancer", "adsExtra.status.review": "En cours d'examen", "adsExtra.status.preparing": "Préparation en cours", "adsExtra.status.unknown": "Statut à vérifier",
    "adsExtra.status.active": "Active", "adsExtra.status.rejected": "Rejetée", "adsExtra.status.error": "Erreur",
    "adsExtra.status.completed": "Terminée", "adsExtra.status.archived": "Archivée",
    "adsExtra.status.deleted": "Supprimée chez Meta", "adsExtra.status.unavailable": "Statut à vérifier",
    "adsExtra.duplicate": "Dupliquer", "adsExtra.resume": "Reprendre", "adsExtra.history": "Historique des campagnes ({count})",
    "adsExtra.traffic_without_pixel": "Trafic (sans pixel)", "adsExtra.daily": "{amount} $/j · {days} j", "adsExtra.poster_alt": "Affiche de la campagne",
  },
  en: {
    "adsExtra.status.draft": "Draft", "adsExtra.status.account_required": "Account required",
    "adsExtra.status.submitting": "Creating…", "adsExtra.status.paused": "Paused",
    "adsExtra.status.meta_paused": "Paused by Meta", "adsExtra.status.autopilot_paused": "Paused by autopilot",
    "adsExtra.status.paid": "Ready to launch", "adsExtra.status.review": "Under review", "adsExtra.status.preparing": "Preparing", "adsExtra.status.unknown": "Status to verify",
    "adsExtra.status.active": "Active", "adsExtra.status.rejected": "Rejected", "adsExtra.status.error": "Error",
    "adsExtra.status.completed": "Completed", "adsExtra.status.archived": "Archived",
    "adsExtra.status.deleted": "Deleted on Meta", "adsExtra.status.unavailable": "Status to verify",
    "adsExtra.duplicate": "Duplicate", "adsExtra.resume": "Resume", "adsExtra.history": "Campaign history ({count})",
    "adsExtra.traffic_without_pixel": "Traffic (no pixel)", "adsExtra.daily": "{amount} $/day · {days} days", "adsExtra.poster_alt": "Campaign poster",
  },
};
