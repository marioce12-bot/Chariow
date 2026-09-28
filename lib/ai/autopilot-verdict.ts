// Couche IA du pilotage automatique — branchée sur Imole (le fournisseur IA
// principal de l'app, cf. lib/ai/imole.ts), pas Gemini.
//
// Le moteur déterministe (lib/autopilot.ts, computeAutopilotDecision) reste la
// SEULE autorité pour décider "learning"/"insufficient_data" (garde-fou anti-
// jugement-prématuré) et pour décider qu'une campagne DOIT être mise en pause.
// Imole n'est jamais consulté pour ces phases, et ne peut jamais transformer
// un "keep_running" en "pause" tout seul — l'IA ne déclenche jamais d'action
// par elle-même, elle explique et, dans un seul cas précis, tempère.
//
// Ce qu'Imole apporte réellement :
//  1. Un motif rédigé en langage clair qui intègre le diagnostic déterministe
//     existant (lib/meta/diagnostic.ts — audience / créative / attribution,
//     comparé à la propre baseline de la campagne) plutôt qu'un simple
//     "ROAS de 0.3".
//  2. Un unique pouvoir de nuance : si le moteur de diagnostic a lui-même
//     détecté une anomalie d'attribution grave (le ROAS Meta ne correspond pas
//     aux ventes réelles), Imole peut recommander de repasser un "pause" en
//     "keep_running" le temps de vérifier le tracking — sinon on couperait une
//     campagne rentable sur la foi d'un chiffre faussé. Ce garde-fou est
//     vérifié dans le code (anomalie critique/haute réellement présente), pas
//     seulement sur la parole du modèle.

import { askImole } from "@/lib/ai/imole";
import type { AutopilotDecision, AutopilotDecisionName, AutopilotInput } from "@/lib/autopilot";
import type { Anomaly } from "@/lib/meta/diagnostic";

function hasCriticalAttributionAnomaly(anomalies: Anomaly[]): boolean {
  return anomalies.some((a) => a.stage === "attribution" && (a.severity === "critical" || a.severity === "high"));
}

const STAGE_LABEL: Record<Anomaly["stage"], string> = {
  audience: "ciblage/audience",
  creative: "fatigue de la créative",
  attribution: "fiabilité de la mesure (attribution)",
  offer: "offre",
  checkout: "paiement",
  technical: "technique",
};

function describeAnomaly(a: Anomaly): string {
  return `${STAGE_LABEL[a.stage]} (gravité ${a.severity}, preuves : ${JSON.stringify(a.evidence)})`;
}

/**
 * Affine le verdict déterministe avec Imole : motif enrichi par le diagnostic,
 * et éventuelle requalification pause -> keep_running strictement encadrée.
 * Ne lance jamais d'erreur et ne bloque jamais le cron : si Imole est
 * indisponible ou répond n'importe quoi, on retombe sur `base` tel quel.
 */
export async function refineAutopilotVerdictWithAI(
  input: AutopilotInput,
  base: AutopilotDecision,
  anomalies: Anomaly[],
  context: { campaignTitle: string; currency: string; platform: "meta" | "tiktok" },
): Promise<AutopilotDecision> {
  // Garde-fou de sécurité : phase d'apprentissage / pas assez de données —
  // l'IA ne juge jamais dans ce cas, il n'y a rien à interpréter.
  if (base.decision === "learning" || base.decision === "insufficient_data") return base;

  const diagnosticAvailable = context.platform === "meta";
  const anomalyLines = anomalies.length ? anomalies.map(describeAnomaly).join(" ; ") : "aucune anomalie détectée";

  const prompt = `Tu es le module d'explication du pilotage automatique des publicités de Vendeo (plateforme pour créateurs de produits digitaux, paiements en ${context.currency}). Une campagne tourne sans supervision humaine directe.

Décision déjà calculée par les règles de l'algorithme (déterministe, c'est la référence, tu ne la recalcules pas) : "${base.decision === "pause" ? "mettre en pause" : "laisser tourner"}".
Motif calculé par les règles : ${base.reasons.join(" ")}

Chiffres de la campagne "${context.campaignTitle}" :
- Dépense : ${input.spend.toFixed(0)} ${context.currency} sur ${Math.round(input.daysSinceLaunch)} jour(s), budget quotidien ${input.dailyBudget} ${context.currency}
- Ventes confirmées : ${input.completedSales}, revenu net : ${input.netRevenue.toFixed(0)} ${context.currency}
- ROAS net : ${base.roas !== null ? base.roas.toFixed(2) : "indisponible"}

Diagnostic technique (moteur déterministe, comparaison à la propre baseline de la campagne)${diagnosticAvailable ? "" : " — non disponible pour cette plateforme"} : ${diagnosticAvailable ? anomalyLines : "n/a"}

Rédige UNIQUEMENT un motif de 2 à 3 phrases en français, clair, sans jargon technique, destiné à l'utilisateur final : explique la décision en t'appuyant sur le diagnostic quand il existe (ex: dire que la créa s'essouffle, que le ciblage ne convertit plus, ou que le ROAS affiché est probablement faussé par un problème de mesure). Ne change pas les chiffres, ne les invente pas.

Réponds UNIQUEMENT avec un JSON compact, sans texte autour, sans balises markdown : {"reasoning": "...", "attribution_looks_broken": true|false}
"attribution_looks_broken" = true seulement si le diagnostic ci-dessus indique clairement que le ROAS mesuré ne reflète pas les ventes réelles.`;

  try {
    const raw = await askImole([{ role: "user", content: prompt }]);
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned) as { reasoning?: string; attribution_looks_broken?: boolean };
    const reasons = typeof parsed.reasoning === "string" && parsed.reasoning.trim() ? [parsed.reasoning.trim().slice(0, 600)] : base.reasons;

    // La requalification ne dépend jamais uniquement de ce que l'IA affirme :
    // il faut qu'une anomalie d'attribution grave soit réellement présente
    // dans le diagnostic calculé par le code.
    const decision: AutopilotDecisionName =
      base.decision === "pause" && diagnosticAvailable && hasCriticalAttributionAnomaly(anomalies) && parsed.attribution_looks_broken ? "keep_running" : base.decision;

    return { decision, reasons, roas: base.roas };
  } catch (error) {
    console.error("autopilot: Imole verdict unavailable, keeping deterministic decision", error instanceof Error ? error.message : error);
    return base;
  }
}
