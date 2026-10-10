import type { Locale } from "@/lib/i18n/locales";

/** Code renvoyé par /api/ad-campaigns/[id]/launch (HTTP 409) quand Pinterest refuse l'objectif Ventes faute de balise. */
export const PINTEREST_TAG_REQUIRED_CODE = "PINTEREST_TAG_REQUIRED";

/**
 * Pinterest refuse l'objectif Ventes (optimisation WEB_CONVERSION) tant que le compte publicitaire
 * n'a pas de balise Pinterest (Pinterest Tag) qui remonte des conversions (SIGNUP, CHECKOUT,
 * ADD_TO_CART ou LEAD). Message d'origine : « optimization goal WEB_CONVERSION requires matched
 * conversions of type SIGNUP, CHECKOUT, ADD_TO_CART, or LEAD ».
 */
export function isPinterestConversionTagError(message: string | null | undefined): boolean {
  if (!message) return false;
  return /web_conversion|matched conversions/i.test(message);
}

/** Message court (listes de campagnes, erreurs enregistrées, API). */
export function pinterestTagShortMessage(locale: Locale): string {
  return locale === "fr"
    ? "Pinterest ne peut pas optimiser sur les ventes : aucune balise Pinterest (Pinterest Tag) avec des conversions n’a été trouvée sur ton compte publicitaire. Installe la balise sur ta boutique Chariow, ou choisis de lancer la campagne en objectif Trafic."
    : "Pinterest can’t optimize for sales: no Pinterest Tag with conversions was found on your ad account. Install the tag on your Chariow store, or choose to launch the campaign with the Traffic objective.";
}

/** Message pour l'assistant (chat), où le choix « Trafic » se fait dans le wizard Pub. */
export function pinterestTagChatMessage(): string {
  return "Pinterest ne peut pas optimiser sur les ventes : aucune balise Pinterest (Pinterest Tag) avec des conversions n’a été trouvée sur ton compte publicitaire. Aucune pub n’a été lancée. Tu as deux options : installer la balise Pinterest sur ta boutique Chariow (Pinterest Ads Manager → Publicités → Conversions → balise Pinterest, puis colle-la dans les paramètres de ta boutique Chariow), ou lancer la campagne en objectif Trafic depuis Pub → Lancer une pub → Pinterest, où tu devras confirmer ton choix.";
}

export type PinterestTagCopy = {
  title: string;
  intro: string;
  optionTagTitle: string;
  pinterestTitle: string;
  pinterestSteps: string[];
  chariowTitle: string;
  chariowSteps: string[];
  tagNote: string;
  optionTrafficTitle: string;
  optionTrafficBody: string;
  retrySales: string;
  confirmTraffic: string;
  cancel: string;
  trafficDone: string;
};

export function pinterestTagCopy(locale: Locale): PinterestTagCopy {
  if (locale === "fr") {
    return {
      title: "Pinterest ne peut pas optimiser cette campagne sur les ventes",
      intro:
        "Pour optimiser sur les ventes, Pinterest doit voir les achats faits sur ta boutique grâce à sa balise (Pinterest Tag). Aucune balise avec des conversions n’a été trouvée sur ton compte publicitaire, donc Pinterest a refusé la campagne. Aucune pub n’est en diffusion et rien n’est lancé sans ton accord.",
      optionTagTitle: "Option 1 : installer la balise (recommandé pour les ventes)",
      pinterestTitle: "Récupérer la balise sur Pinterest",
      pinterestSteps: [
        "Ouvre Pinterest Ads Manager avec le compte publicitaire connecté à Vendeo.",
        "Va dans Publicités → Conversions, puis clique sur « Configurer la balise » (Pinterest Tag).",
        "Choisis l’installation manuelle, puis copie le code de base de la balise (ou simplement son identifiant, un numéro appelé Tag ID).",
      ],
      chariowTitle: "L’installer sur ta boutique Chariow",
      chariowSteps: [
        "Dans ton tableau de bord Chariow, ouvre les paramètres de ta boutique, rubrique Pixels / Suivi marketing.",
        "Colle le code (ou l’identifiant) de la balise Pinterest, puis enregistre.",
        "Visite ta boutique et fais un « Ajouter au panier » pour tester : l’événement doit apparaître dans Pinterest → Conversions (cela peut prendre jusqu’à 24 h).",
      ],
      tagNote: "Quand Pinterest reçoit des conversions, reviens ici et clique sur « Réessayer en Ventes ».",
      optionTrafficTitle: "Option 2 : lancer en Trafic maintenant",
      optionTrafficBody:
        "Ta campagne sera optimisée pour envoyer des visiteurs sur ta boutique (clics), pas pour déclencher des achats. Les résultats en ventes peuvent être moins bons. Elle ne sera lancée que si tu confirmes ci-dessous.",
      retrySales: "J’ai installé la balise : réessayer en Ventes",
      confirmTraffic: "Oui, lancer en Trafic",
      cancel: "Non, ne rien lancer",
      trafficDone:
        "Comme tu l’as confirmé, ta campagne a été lancée avec l’objectif Trafic (clics vers ta boutique). Pour optimiser sur les ventes la prochaine fois, installe la balise Pinterest sur ta boutique Chariow.",
    };
  }
  return {
    title: "Pinterest can’t optimize this campaign for sales",
    intro:
      "To optimize for sales, Pinterest needs to see purchases made on your store through its tag (Pinterest Tag). No tag with conversions was found on your ad account, so Pinterest rejected the campaign. No ad is running and nothing is launched without your approval.",
    optionTagTitle: "Option 1: install the tag (recommended for sales)",
    pinterestTitle: "Get the tag from Pinterest",
    pinterestSteps: [
      "Open Pinterest Ads Manager with the ad account connected to Vendeo.",
      "Go to Ads → Conversions, then click “Set up tag” (Pinterest Tag).",
      "Choose manual installation, then copy the tag’s base code (or just its ID, a number called Tag ID).",
    ],
    chariowTitle: "Install it on your Chariow store",
    chariowSteps: [
      "In your Chariow dashboard, open your store settings, Pixels / Marketing tracking section.",
      "Paste the Pinterest tag code (or ID), then save.",
      "Visit your store and add a product to the cart to test: the event should show up in Pinterest → Conversions (it can take up to 24 hours).",
    ],
    tagNote: "Once Pinterest receives conversions, come back here and click “Retry with Sales”.",
    optionTrafficTitle: "Option 2: launch with Traffic now",
    optionTrafficBody:
      "Your campaign will be optimized to send visitors to your store (clicks), not to trigger purchases. Sales results may be lower. It will only launch if you confirm below.",
    retrySales: "I installed the tag: retry with Sales",
    confirmTraffic: "Yes, launch with Traffic",
    cancel: "No, don’t launch anything",
    trafficDone:
      "As you confirmed, your campaign launched with the Traffic objective (clicks to your store). To optimize for sales next time, install the Pinterest tag on your Chariow store.",
  };
}
