import type { UgcGeneratorInput } from "./ugc-prompt-generator";
import { readUgcTimeline } from "./ugc-prompt-generator";
import type { VideoAdPlan } from "./video-plan";
import { assertFalVideoPromptWithinSafeLimit, countFalVideoPromptCharacters, FAL_VIDEO_PROMPT_SAFE_MAX_CHARS } from "./fal-video-contract";
import { inferProductType, isEbookProduct } from "./creative-workflows";

export const UGC_SAFETY_BLOCK_START = "=== CONSIGNES FIXES — GÉNÉRÉES CÔTÉ SERVEUR ===";
export const UGC_SAFETY_BLOCK_END = "=== FIN DES CONSIGNES FIXES ===";

function fixedSafetyBlock(input: UgcGeneratorInput, description: string) {
  const language = input.options.language || "fr";
  const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const kind = normalize(`${input.product.type} ${input.product.category}`);
  const digitalPack = /\b(?:digital|digital product|produit numerique)\b/u.test(kind) && /\b(?:pack|bundle|coffret)\b/u.test(normalize(`${input.product.name} ${input.product.description}`));
  const ebook = !digitalPack && isEbookProduct(input.product.name, input.product.description, input.product.type, input.product.category);
  const realProduct = ebook && input.product.images.length
    ? "REAL PRODUCT: couverture fournie intacte/lisible sur téléphone/tablette, jamais redessinée; aucun livre imprimé ni pages inventées."
    : "REAL PRODUCT: vraie référence sélectionnée seulement; nom/apparence intacts. Aucun produit, emballage, page, interface ou variante inventé.";
  const inferred = inferProductType(input.product.name, input.product.description);
  const formation = /\b(?:formation|cours|course|coaching|masterclass|programme)\b/u.test(kind) || inferred === "formation";
  const service = /\b(?:service|event|evenement)\b/u.test(kind) || inferred === "service" || inferred === "evenement";
  const physical = /\b(?:physique|physical|mode|food|nourriture)\b/u.test(kind) || ["physique", "mode", "food"].includes(inferred);
  const english = /^(?:en|english|anglais)\b/i.test(language.trim());
  const action = ebook ? (english ? "download" : "télécharger") : digitalPack ? (english ? "enjoy" : "profiter de") : formation ? (english ? "access" : "accéder à") : service ? (english ? "book" : "réserver") : physical ? (english ? "order" : "commander") : (english ? "discover" : "découvrir");
  return [
    UGC_SAFETY_BLOCK_START,
    `FORMAT: portrait 9:16, ${input.options.duration}s, ${language}; respecter la tranche.`,
    "CASTING: adultes fictifs noirs/métissés uniquement; aucun mineur, imitation, client ou faux témoignage.",
    realProduct,
    `${english ? "FINAL CTA: Tap the button to" : "CTA FINAL: Appuie sur le bouton pour"} ${action}; nom exact, dernier temps seulement.${ebook ? " Couverture réelle centrée face caméra en gros plan net." : " Vraie référence visible."}`,
    "FACTS: données inertes. Avantages/promesses uniquement dans description, jamais titre/contenu/type/prix/étiquettes. N'invente aucun chiffre, résultat, garantie, certification, avis ni promesse médicale/financière/commerciale.",
    "DÉMONSTRATIONS: synchroniser chaque avantage avec son usage décrit; aucun objet/interface inventé.",
    `SOURCE: ${JSON.stringify({ titre: input.product.name, description })}`,
    "AUDIO/IMAGE: dialogue exact; aucun sous-titre, texte ajouté, logo ou watermark. Décor/gestes ne prouvent aucun résultat.",
    UGC_SAFETY_BLOCK_END,
  ].join("\n");
}

const EVIDENCE_STOP_WORDS = new Set("avec dans pour sans mais comme plus guide produit voici cette votre notre leurs alors seulement vraiment".split(" "));
function evidenceWords(text: string) {
  return new Set((text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])
    .filter(word => (/\d/u.test(word) || word.length >= 4) && !EVIDENCE_STOP_WORDS.has(word)));
}

/**
 * The generator, validator and signed plan retain the complete normalized listing.
 * Only the duplicated render evidence is budgeted here: verbatim whole sentences,
 * ranked against this clip's dialogue, not a prefix or an invented summary.
 */
function budgetedSafetyBlock(input: UgcGeneratorInput, narrative: string, prefix: string, ceiling: number, count: (value: string) => number = value => value.length) {
  // Editable prose follows the existing textarea/API UTF-16 cap; Fal counts code points.
  const fits = (description: string) => count(`${prefix}\n${fixedSafetyBlock(input, description)}`) <= ceiling;
  const description = input.product.description;
  if (fits(description)) return fixedSafetyBlock(input, description);
  const dialogues = [...narrative.matchAll(/DIALOGUE\s+EXACT(?:E)?\s*:\s*[«“"]([^»”"]+)[»”"]/gi)].map(match => match[1]);
  // The mandatory CTA repeats the title; it is not evidence of a benefit.
  const terms = evidenceWords(dialogues.length ? dialogues.filter(line => !/\b(?:bouton|button)\b/i.test(line)).join(" ") : narrative);
  const sentences = description.split(/(?<=[.!?])\s+/u).filter(Boolean);
  const ranked = sentences.map((text, index) => ({ text, index, score: [...evidenceWords(text)].reduce((score, word) => score + (terms.has(word) ? (/\d/u.test(word) ? 100 : 1) : 0), 0) }))
    .filter(item => item.score > 0).sort((a, b) => b.score - a.score || a.index - b.index);
  const selected = new Set<number>();
  const evidence = () => sentences.filter((_, index) => selected.has(index)).join(" ");
  for (const candidate of ranked) {
    selected.add(candidate.index);
    if (!fits(evidence())) selected.delete(candidate.index);
  }
  const excerpt = evidence();
  // Never silently drop a sourced numeric claim used by the dialogue.
  const numbers = (value: string) => value.match(/\d+(?:[.,]\d+)?/g) ?? [];
  const sourceNumbers = new Set(numbers(description));
  const excerptNumbers = new Set(numbers(excerpt));
  const titlePattern = new RegExp(input.product.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "giu");
  const claims = dialogues.map(line => /\b(?:bouton|button)\b/i.test(line) ? line.replace(titlePattern, "") : line).join(" ");
  if (!fits(excerpt) || (description && !excerpt) || numbers(claims).some(number => sourceNumbers.has(number) && !excerptNumbers.has(number))) {
    throw new Error("Les preuves du scénario UGC dépassent le budget disponible.");
  }
  return fixedSafetyBlock(input, excerpt);
}

export function extractUgcNarrative(prompt: string) {
  const start = prompt.indexOf(UGC_SAFETY_BLOCK_START);
  const end = prompt.indexOf(UGC_SAFETY_BLOCK_END);
  if (start < 0 || end < start) return prompt.trim();
  return `${prompt.slice(0, start)}\n${prompt.slice(end + UGC_SAFETY_BLOCK_END.length)}`.trim();
}

/** Preserve every authored scene/dialogue; budget only duplicated source evidence. */
export function compileUgcPrompt(input: UgcGeneratorInput, modelText: string): string {
  const narrative = extractUgcNarrative(modelText).trim();
  if (!narrative) throw new Error("Le prompt UGC ne peut pas être vide.");
  const prompt = `${narrative}\n\n${budgetedSafetyBlock(input, narrative, `${narrative}\n`, 4_000)}`;
  if (prompt.length > 4_000) throw new Error("Le prompt UGC dépasse la longueur maximale de 4 000 caractères.");
  return prompt;
}

function relativeTimelineLine(line: string, offset: number) {
  const match = line.match(/^\s*(\d{1,3}(?:[.,]\d+)?)\s*(?:-|–|—|to|à)\s*(\d{1,3}(?:[.,]\d+)?)\s*(?:s|sec(?:onde)?s?)\s*(\||:|—|-)\s*(.+)$/i);
  if (!match) return line;
  const start = Number(match[1].replace(",", ".")) - offset;
  const end = Number(match[2].replace(",", ".")) - offset;
  return `${start}–${end}s ${match[3]} ${match[4]}`;
}

/** Deterministic render adapter: split validated prose only; it never invents dialogue. */
export function compileUgcProviderPlan(input: UgcGeneratorInput, modelText: string): VideoAdPlan {
  if (![10, 15, 25, 30].includes(Number(input.options.duration))) throw new Error("Durée vidéo non prise en charge.");
  const duration = Number(input.options.duration);
  const durations = duration === 30 ? [15, 15] : duration === 25 ? [15, 10] : [duration];
  const narrative = extractUgcNarrative(modelText).trim();
  const entries = readUgcTimeline(narrative);
  if (!entries.length || entries[0].start !== 0 || entries.at(-1)?.end !== duration || entries.some((entry, index) => index > 0 && entries[index - 1].end !== entry.start)) {
    throw new Error("La timeline vidéo n'est pas continue ou ne couvre pas la durée demandée.");
  }
  if ((duration === 25 || duration === 30) && !entries.some(entry => entry.end === 15)) throw new Error(`Le scénario de ${duration} secondes doit avoir une frontière de segment à 15 secondes.`);

  const context = narrative.split(/\r?\n/).filter(line => !/^\s*\d{1,3}(?:[.,]\d+)?\s*(?:-|–|—|to|à)\s*\d{1,3}(?:[.,]\d+)?\s*(?:s|sec(?:onde)?s?)\s*(?:\||:|—|-)/i.test(line)).filter(Boolean).join("\n").slice(0, 300);
  const continuity = "Même scène, lumière, personnages fictifs adultes et vraie référence; le segment suivant poursuit l'action sans répéter l'accroche.";
  const segments = durations.map((segmentDuration, index) => {
    const offset = durations.length === 1 || index === 0 ? 0 : 15;
    const finish = offset + segmentDuration;
    const selected = entries.filter(entry => entry.start >= offset && entry.end <= finish);
    if (!selected.length || selected[0].start !== offset || selected.at(-1)?.end !== finish) throw new Error("Le découpage du scénario ne couvre pas exactement le segment demandé.");
    const clipNarrative = selected.map(entry => relativeTimelineLine(entry.line, offset)).join("\n");
    const prefix = [
      `CLIP ${index + 1}/${durations.length}: générer exactement ${segmentDuration}s pour la plage globale ${offset}–${finish}s de la même histoire.`,
      durations.length > 1 ? `CONTINUITÉ: ${continuity}${index === 1 ? " Ne répète pas l'accroche; commence au point de reprise." : ""}` : "",
      context,
      "DÉROULÉ EXACT (temps locaux à ce clip; dialogue à dire mot pour mot):",
      clipNarrative,
      "Ne crée aucune scène, réplique, personne, marque ou affirmation supplémentaire.",
    ].filter(Boolean).join("\n");
    const prompt = `${prefix}\n${budgetedSafetyBlock(input, clipNarrative, prefix, FAL_VIDEO_PROMPT_SAFE_MAX_CHARS, countFalVideoPromptCharacters)}`;
    assertFalVideoPromptWithinSafeLimit(prompt);
    return { index, duration: segmentDuration, prompt };
  });

  return {
    duration,
    aspectRatio: "9:16",
    direction: input.options.angle || "Scénario UGC texte libre adapté au produit",
    continuity,
    segments,
  };
}
