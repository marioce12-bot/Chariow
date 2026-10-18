import type { Locale } from "./locales";

export const sectionsCopy: Record<Locale, Record<string, string>> = {
  fr: {
    "sectionsExtra.onboarding.error": "Connexion Chariow indisponible pour le moment.",
    "sectionsExtra.onboarding.step": "Première étape",
    "sectionsExtra.onboarding.title": "Connecter ma boutique Chariow",
    "sectionsExtra.onboarding.description": "Chariow ouvre la connexion et vous autorisez Vendeo. Aucun token à copier.",
    "sectionsExtra.onboarding.loading": "Connexion en cours…",
    "sectionsExtra.onboarding.connect": "Connecter ma boutique Chariow",
    "sectionsExtra.subscription.paymentError": "Impossible de lancer le paiement.",
    "sectionsExtra.subscription.unavailable": "Non disponible",
    "sectionsExtra.subscription.heading": "Ton abonnement",
    "sectionsExtra.subscription.active": "Abonnement Vendeo actif",
    "sectionsExtra.subscription.activeDescription": "Accès à toute la plateforme et jusqu'à 3 boutiques.",
  },
  en: {
    "sectionsExtra.onboarding.error": "Chariow connection is currently unavailable.",
    "sectionsExtra.onboarding.step": "First step",
    "sectionsExtra.onboarding.title": "Connect your Chariow store",
    "sectionsExtra.onboarding.description": "Chariow will open the connection flow, where you can authorize Vendeo. No token to copy.",
    "sectionsExtra.onboarding.loading": "Connecting…",
    "sectionsExtra.onboarding.connect": "Connect my Chariow store",
    "sectionsExtra.subscription.paymentError": "Unable to start payment.",
    "sectionsExtra.subscription.unavailable": "Unavailable",
    "sectionsExtra.subscription.heading": "Your subscription",
    "sectionsExtra.subscription.active": "Vendeo subscription active",
    "sectionsExtra.subscription.activeDescription": "Access to the entire platform and up to 3 stores.",
  },
};
