// Moteur de décision du pilotage automatique (déterministe, sans IA).
// À partir des métriques d'une campagne (dépense pub + ventes réelles Chariow),
// il décide s'il faut la laisser tourner ou la mettre en pause, avec un motif
// explicite. Les seuils sont relatifs au budget de la campagne (jamais un seuil
// absolu générique), pour ne conclure qu'une fois qu'il y a assez de signal.

export type AutopilotDecisionName = "keep_running" | "pause" | "learning" | "insufficient_data";

export type AutopilotDecision = {
  decision: AutopilotDecisionName;
  reasons: string[];
  roas: number | null;
};

export type AutopilotInput = {
  /** Dépense publicitaire totale sur la période évaluée (devise du compte pub). */
  spend: number;
  /** Revenu net réellement encaissé (net_amount des ventes complétées). */
  netRevenue: number;
  /** Revenu brut des ventes complétées (amount). */
  grossRevenue: number;
  /** Nombre de ventes complétées attribuées à la campagne. */
  completedSales: number;
  /** Jours écoulés depuis le lancement de la campagne. */
  daysSinceLaunch: number;
  /** Budget quotidien de la campagne (référence pour les seuils). */
  dailyBudget: number;
  /** Vrai seulement si le suivi d'achat et l'attribution à cette campagne sont fiables. */
  attributionReliable: boolean;
};

function fmt(value: number): string {
  return value.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
}

function roasOf(netRevenue: number, spend: number): number | null {
  return spend > 0 ? netRevenue / spend : null;
}

/**
 * Seuil de dépense minimale avant de conclure "à arrêter" : on exige d'avoir
 * dépensé au moins 1,5 fois le budget quotidien pour qu'un manque de ventes
 * soit un vrai signal (et pas un simple démarrage lent).
 */
const MIN_SPEND_TO_CONCLUDE_MULTIPLIER = 1.5;

/** ROAS au-delà duquel la campagne est considérée rentable (seuil de rentabilité = 1). */
const BREAKEVEN_ROAS = 1;

/** ROAS en dessous duquel on arrête, une fois le seuil de dépense atteint. */
const STOP_ROAS = 0.5;

export function computeAutopilotDecision(input: AutopilotInput): AutopilotDecision {
  const { spend, netRevenue, grossRevenue, completedSales, daysSinceLaunch, dailyBudget, attributionReliable } = input;
  const roas = roasOf(netRevenue, spend);

  if (!attributionReliable) {
    return {
      decision: "insufficient_data",
      reasons: ["Suivi des achats ou attribution à cette campagne non confirmé : aucune pause automatique ne sera déclenchée."],
      roas: null,
    };
  }

  if (spend <= 0) {
    return {
      decision: "insufficient_data",
      reasons: ["Aucune dépense enregistrée sur la période : rien à conclure pour l'instant."],
      roas,
    };
  }

  // Phase d'apprentissage : trop tôt (ou trop peu dépensé) pour conclure.
  if (daysSinceLaunch < 1 || dailyBudget <= 0 || spend < dailyBudget * MIN_SPEND_TO_CONCLUDE_MULTIPLIER) {
    return {
      decision: "learning",
      reasons: ["Phase d'apprentissage : la campagne vient de démarrer, il n'y a pas encore assez de données pour juger sa rentabilité."],
      roas,
    };
  }

  // Rentable : on laisse tourner (et on le dit clairement).
  if (roas !== null && roas >= BREAKEVEN_ROAS) {
    return {
      decision: "keep_running",
      reasons: [`Rentable : ${fmt(netRevenue)} de ventes nettes pour ${fmt(spend)} de pub (ROAS ${roas.toFixed(2)}). La campagne se paie et rapporte.`],
      roas,
    };
  }

  const enoughSpend = spend >= dailyBudget * MIN_SPEND_TO_CONCLUDE_MULTIPLIER;

  // Aucune vente après une dépense significative : signal fort d'arrêt.
  if (completedSales === 0 && enoughSpend) {
    return {
      decision: "pause",
      reasons: [`${fmt(spend)} dépensés sans aucune vente confirmée. L'audience touchée ne convertit pas : la campagne brûle le budget sans rien rapporter.`],
      roas,
    };
  }

  // ROAS nettement sous le seuil de rentabilité, avec assez de dépense.
  if (roas !== null && roas < STOP_ROAS && enoughSpend) {
    return {
      decision: "pause",
      reasons: [`ROAS de ${roas.toFixed(2)} : ${fmt(netRevenue)} de ventes nettes pour ${fmt(spend)} de pub. La campagne coûte plus qu'elle ne rapporte.`],
      roas,
    };
  }

  // Encore sous le seuil mais pas encore assez de dépense, ou ROAS intermédiaire :
  // on laisse tourner et on surveille.
  if (roas !== null && roas < BREAKEVEN_ROAS) {
    return {
      decision: "keep_running",
      reasons: [
        roas < STOP_ROAS
          ? `ROAS de ${roas.toFixed(2)} mais dépense encore faible (${fmt(spend)}) : on attend d'avoir plus de données avant de trancher.`
          : `ROAS de ${roas.toFixed(2)}, proche du seuil de rentabilité : la campagne collecte encore des données, on la laisse tourner sous surveillance.`,
      ],
      roas,
    };
  }

  return {
    decision: "keep_running",
    reasons: [`${completedSales} vente(s) confirmée(s) pour ${fmt(spend)} de pub (${fmt(grossRevenue)} brut). La campagne reste sous surveillance.`],
    roas,
  };
}
