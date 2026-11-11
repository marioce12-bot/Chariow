export const LAUNCH_TAG = "[[LANCE_CAMPAGNE]]";

export const LAUNCH_OBJECTIVES = [
  "OUTCOME_SALES",
  "OUTCOME_TRAFFIC",
  "OUTCOME_ENGAGEMENT",
  "OUTCOME_LEADS",
  "OUTCOME_AWARENESS",
] as const;

export const LAUNCH_CALL_TO_ACTIONS = [
  "SHOP_NOW",
  "BUY_NOW",
  "ORDER_NOW",
  "DOWNLOAD",
  "LEARN_MORE",
  "GET_OFFER",
  "CONTACT_US",
] as const;

export type LaunchPayload = {
  name: string;
  objective: (typeof LAUNCH_OBJECTIVES)[number];
  dailyBudget: number;
  currency: "XOF" | "EUR" | "USD";
  countries: string[];
  ageMin: number;
  ageMax: number;
  gender: "male" | "female" | null;
  interests: string[];
  message: string;
  headline: string;
  linkUrl: string | null;
  durationDays: number;
  platform: "meta" | "pinterest";
  callToAction: (typeof LAUNCH_CALL_TO_ACTIONS)[number] | null;
  storeId: string | null;
  productId: string | null;
  productName: string | null;
  storeName: string | null;
};

export type PriorChatMessage = { role: string; content?: unknown };

export const MAX_LAUNCH_INTERESTS = 5;

const requiredKeys: Array<keyof LaunchPayload> = [
  "name", "objective", "dailyBudget", "currency", "countries", "ageMin", "ageMax",
  "gender", "interests", "message", "headline", "linkUrl", "durationDays", "platform",
  "callToAction", "storeId", "productId", "productName", "storeName",
];

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function isValidLaunchPayload(value: unknown): value is LaunchPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (!requiredKeys.every((key) => Object.prototype.hasOwnProperty.call(record, key))) return false;
  if (!isNonEmptyString(record.name) || !LAUNCH_OBJECTIVES.includes(record.objective as LaunchPayload["objective"])) return false;
  if (typeof record.dailyBudget !== "number" || !Number.isFinite(record.dailyBudget) || record.dailyBudget <= 0) return false;
  if (record.currency !== "XOF" && record.currency !== "EUR" && record.currency !== "USD") return false;
  if (!Array.isArray(record.countries) || record.countries.length === 0 || !record.countries.every((item) => typeof item === "string" && /^[A-Z]{2}$/.test(item))) return false;
  if (!Number.isInteger(record.ageMin) || !Number.isInteger(record.ageMax) || (record.ageMin as number) < 13 || (record.ageMax as number) > 100 || (record.ageMin as number) > (record.ageMax as number)) return false;
  if (record.gender !== null && record.gender !== "male" && record.gender !== "female") return false;
  if (!Array.isArray(record.interests) || record.interests.length > MAX_LAUNCH_INTERESTS || !record.interests.every((item) => typeof item === "string" && item.trim().length > 0)) return false;
  if (!isNonEmptyString(record.message) || !isNonEmptyString(record.headline)) return false;
  if (record.linkUrl !== null && (typeof record.linkUrl !== "string" || !isValidHttpUrl(record.linkUrl))) return false;
  if (!Number.isInteger(record.durationDays) || (record.durationDays as number) < 1) return false;
  if (record.platform !== "meta" && record.platform !== "pinterest") return false;
  if (record.platform === "meta" && !LAUNCH_CALL_TO_ACTIONS.some((action) => action === record.callToAction)) return false;
  if (record.platform === "pinterest" && (record.callToAction !== null || record.gender !== null || (record.interests as unknown[]).length > 0)) return false;
  if (!isNullableString(record.storeId) || !isNullableString(record.productId) || !isNullableString(record.productName) || !isNullableString(record.storeName)) return false;
  return true;
}

// Le modèle dépasse parfois la limite de centres d'intérêt : on garde les premiers
// (nettoyés) plutôt que de rejeter tout le lancement et de laisser l'utilisateur sans pop-up.
function normalizeLaunchPayload(payload: unknown): unknown {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  const record = payload as Record<string, unknown>;
  if (!Array.isArray(record.interests)) return payload;
  const interests = record.interests
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .slice(0, MAX_LAUNCH_INTERESTS);
  return { ...record, interests };
}

export function parseLaunchPayload(content: string): LaunchPayload | null {
  const markerIndex = content.indexOf(LAUNCH_TAG);
  if (markerIndex < 0 || content.indexOf(LAUNCH_TAG, markerIndex + LAUNCH_TAG.length) >= 0) return null;
  try {
    const payload: unknown = normalizeLaunchPayload(JSON.parse(content.slice(markerIndex + LAUNCH_TAG.length).trim()));
    return isValidLaunchPayload(payload) ? payload : null;
  } catch {
    return null;
  }
}

export function serializeLaunchPayload(payload: LaunchPayload): string {
  return `${LAUNCH_TAG}${JSON.stringify(payload)}`;
}

export function launchConfirmationFallback(locale: "fr" | "en"): string {
  return locale === "en"
    ? "I couldn't prepare the campaign confirmation from the available details. Please review or complete the campaign summary, then confirm again."
    : "Je n’ai pas pu préparer la confirmation avec les détails disponibles. Vérifie ou complète le récapitulatif de campagne, puis confirme à nouveau.";
}

function normalizeConfirmation(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[.,!?;:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isShortLaunchConfirmation(text: string): boolean {
  if (text.trim().endsWith("?")) return false;
  const normalized = normalizeConfirmation(text);
  if (!normalized || normalized.split(" ").length > 6) return false;
  return /^(?:oui|ok|yes|(?:(?:oui|ok|daccord|yes)\s+)?(?:lance(?:r|\s+la(?:\s+campagne)?)?|je\s+(?:valide|confirme)|(?:valide|confirme|confirmer)|cest\s+bon|vas\s+y|allons\s+y|go|launch|confirm|i\s+confirm|i\s+approve)(?:\s+la\s+campagne)?)$/.test(normalized);
}

export function isAwaitingLaunchConfirmation(history: PriorChatMessage[] | null | undefined): boolean {
  // The API supplies newest-first history; the client reverses its chronological state before calling.
  const latestAssistant = history?.find((item) => item.role === "assistant");
  if (!latestAssistant || typeof latestAssistant.content !== "string") return false;
  const content = latestAssistant.content.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const requestsConfirmation = /\b(confirmer|confirmez|confirme|valider|validez|confirmation|corrects?|corrections?)\b/.test(content);
  const mentionsCampaign = /\b(campagne|lancement|publicite|pub)\b/.test(content);
  const presentsRecap = /\b(informations|details|recapitulatif|configuration|corrects?)\b/.test(content);
  return requestsConfirmation && mentionsCampaign && presentsRecap;
}

// Détection souple d'un récapitulatif de campagne en attente de réponse : on ne s'appuie
// pas sur des mots-clés de validation précis, seulement sur la présence de plusieurs
// éléments de configuration. C'est ensuite le modèle qui juge si la réponse de
// l'utilisateur est une approbation (quelle que soit sa formulation).
// L'historique est fourni du plus récent au plus ancien (comme pour isAwaitingLaunchConfirmation).
export function isRecapAwaitingApproval(history: PriorChatMessage[] | null | undefined): boolean {
  const latestAssistant = history?.find((item) => item.role === "assistant");
  if (!latestAssistant || typeof latestAssistant.content !== "string") return false;
  if (latestAssistant.content.includes(LAUNCH_TAG)) return false;
  const content = latestAssistant.content.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (!/\b(campagne|campaign|lancement|launch|publicite|pub|ad)\b/.test(content)) return false;
  const signals = [
    /\b(budget)\b/,
    /\b(duree|duration|jours?|days?|mois|months?)\b/,
    /\b(pays|countries|country|cible[es]?|targets?)\b/,
    /\b(age|ages|ans|years)\b/,
    /\b(plateforme|platform|meta|pinterest|facebook|instagram)\b/,
    /\b(produit|product|boutique|store)\b/,
  ];
  return signals.filter((pattern) => pattern.test(content)).length >= 4;
}
