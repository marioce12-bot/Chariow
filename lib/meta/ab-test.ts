import { META_GRAPH_BASE_URL } from "./api";
import { createMetaAd, createMetaAdSet, publishMetaAdWithAdvantage } from "./campaigns";
import { askImole } from "@/lib/ai/imole";
import { askGemini } from "@/lib/ai/gemini";

/**
 * Test A/B natif Meta (« Split Test » de l'API Experiments : POST /{business_id}/ad_studies, type SPLIT_TEST).
 *
 * Principe retenu : une seule variable testée = la créative (texte + titre), avec la même image, la même
 * audience et le même objectif.
 * - Version A : la pub de l'utilisateur, telle quelle.
 * - Version B : variante de texte et de titre générée par l'IA de Vendeo (voir generateAbVariantB).
 * - Deux ensembles de pubs (un par version), chacun avec la moitié du budget journalier, rattachés à la
 *   même campagne. Meta répartit l'audience en deux groupes exclusifs (50/50, sans chevauchement) et
 *   calcule le gagnant à la fin du test.
 */

/** Chaque version reçoit la moitié du budget : on garde le minimum de 1 $ par ensemble de pubs. */
export const AB_TEST_MIN_DAILY_BUDGET_USD = 2;

/** Message renvoyé quand le test A/B est demandé sur un compte qui n'est pas relié à un Business Manager lisible. */
export const AB_TEST_BUSINESS_UNAVAILABLE_MESSAGE =
  "Le test A/B de Meta s'appuie sur ton Business Manager, et Vendeo n'a pas pu le lire avec la connexion Meta actuelle. " +
  "Reconnecte Meta en acceptant l'accès à ton Business Manager, ou lance la campagne sans test A/B.";

export type AbVariant = { message: string; headline: string };

export class AbTestError extends Error {
  code: "AB_TEST_BUDGET_TOO_LOW" | "AB_TEST_UNAVAILABLE" | "AB_TEST_VARIANT_FAILED";
  constructor(code: AbTestError["code"], message: string) {
    super(message);
    this.name = "AbTestError";
    this.code = code;
  }
}

/** Budget par version (en $), identique pour A et B pour que le test reste comparable. */
export function abBudgetPerVariant(totalDailyBudgetUsd: number): number {
  return Math.floor((totalDailyBudgetUsd * 100) / 2) / 100;
}

/** Vérifie le budget AVANT toute création chez Meta. */
export function assertAbBudget(totalDailyBudgetUsd: number) {
  if (!Number.isFinite(totalDailyBudgetUsd) || totalDailyBudgetUsd < AB_TEST_MIN_DAILY_BUDGET_USD) {
    throw new AbTestError(
      "AB_TEST_BUDGET_TOO_LOW",
      `Le test A/B partage ton budget en deux versions : il faut au moins ${AB_TEST_MIN_DAILY_BUDGET_USD} $ par jour au total (1 $ par version). Augmente le budget ou lance sans test A/B.`
    );
  }
}

async function graphRead(path: string, params: Record<string, string>, accessToken: string): Promise<Record<string, unknown> | null> {
  const url = new URL(`${META_GRAPH_BASE_URL}/${path}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  url.searchParams.set("access_token", accessToken);
  try {
    const response = await fetch(url.toString(), { cache: "no-store" });
    const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    return response.ok ? json : null;
  } catch {
    return null;
  }
}

/**
 * Identifiant du Business Manager (obligatoire dans l'URL de création d'un test : /{business_id}/ad_studies).
 * 1) le Business propriétaire du compte publicitaire, 2) à défaut le premier Business accessible (me/businesses).
 * À appeler AVANT de créer quoi que ce soit chez Meta, pour échouer sans rien avoir à nettoyer.
 */
export async function resolveMetaBusinessId(accountId: string, accessToken: string): Promise<string> {
  const account = await graphRead(accountId, { fields: "business" }, accessToken);
  const owner = account?.business as { id?: unknown } | undefined;
  if (typeof owner?.id === "string" && owner.id) return owner.id;

  const businesses = await graphRead("me/businesses", { fields: "id,name", limit: "10" }, accessToken);
  const first = Array.isArray(businesses?.data) ? (businesses.data[0] as { id?: unknown } | undefined) : undefined;
  if (typeof first?.id === "string" && first.id) return first.id;

  throw new AbTestError("AB_TEST_UNAVAILABLE", AB_TEST_BUSINESS_UNAVAILABLE_MESSAGE);
}

function extractJsonObject(raw: string): Record<string, unknown> | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1));
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const normalizeText = (value: string) => value.toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Génère la version B du test : même offre, même langue, mais un autre angle d'accroche.
 * Aucun chiffre, remise ou promesse nouvelle ne doit apparaître (on ne dit que ce que la version A dit déjà).
 * Lance une AbTestError si l'IA est indisponible ou renvoie quelque chose d'inutilisable : on ne lance
 * jamais un test A/B avec deux versions identiques.
 */
export async function generateAbVariantB(input: { message: string; headline: string; productName?: string | null }): Promise<AbVariant> {
  const system = [
    "Tu es un expert en publicités Facebook/Instagram pour des créateurs de produits digitaux.",
    "On te donne la version A d'une publicité (texte principal + titre). Écris la version B pour un test A/B.",
    "Règles :",
    "- Même offre, même produit, même langue que la version A.",
    "- Angle d'accroche DIFFÉRENT de la version A (par exemple bénéfice concret au lieu de la curiosité, ou question au lieu d'une affirmation).",
    "- N'invente aucun chiffre, prix, remise, délai, témoignage ni garantie qui ne figure pas dans la version A.",
    "- Texte principal : 300 caractères maximum. Titre : 40 caractères maximum.",
    "- Réponds UNIQUEMENT par un objet JSON compact : {\"message\": string, \"headline\": string}.",
  ].join("\n");
  const user = `Produit : ${input.productName?.trim() || "non précisé"}\nVersion A — texte principal : ${input.message}\nVersion A — titre : ${input.headline}`;
  const messages = [
    { role: "system" as const, content: system },
    { role: "user" as const, content: user },
  ];

  let raw: string | null = null;
  try {
    raw = await askImole(messages);
  } catch (imoleError) {
    console.error("ab-test: variante B, Imole indisponible", imoleError instanceof Error ? imoleError.message : imoleError);
    try {
      raw = await askGemini(messages);
    } catch (geminiError) {
      console.error("ab-test: variante B, Gemini indisponible", geminiError instanceof Error ? geminiError.message : geminiError);
    }
  }

  const parsed = raw ? extractJsonObject(raw) : null;
  const message = typeof parsed?.message === "string" ? parsed.message.trim().slice(0, 300) : "";
  const headline = typeof parsed?.headline === "string" ? parsed.headline.trim().slice(0, 40) : "";
  if (!message || !headline || normalizeText(message) === normalizeText(input.message)) {
    throw new AbTestError(
      "AB_TEST_VARIANT_FAILED",
      "Vendeo n'a pas réussi à préparer la version B du test A/B (service IA indisponible). Réessaie dans un instant ou lance sans test A/B."
    );
  }
  return { message, headline };
}

async function createSplitTestStudy(input: { businessId: string; accessToken: string; name: string; startTime: Date; endTime: Date; adSetIds: [string, string] }) {
  const body = new URLSearchParams({
    name: input.name.slice(0, 200),
    description: "Test A/B créé par Vendeo : version A (texte d'origine) contre version B (variante de texte et de titre).",
    type: "SPLIT_TEST",
    start_time: String(Math.floor(input.startTime.getTime() / 1000)),
    end_time: String(Math.floor(input.endTime.getTime() / 1000)),
    cells: JSON.stringify([
      { name: "Version A", treatment_percentage: 50, adsets: [input.adSetIds[0]] },
      { name: "Version B", treatment_percentage: 50, adsets: [input.adSetIds[1]] },
    ]),
    access_token: input.accessToken,
  });
  const response = await fetch(`${META_GRAPH_BASE_URL}/${input.businessId}/ad_studies`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok || typeof json.id !== "string") {
    const error = (json.error as Record<string, unknown> | undefined) ?? {};
    const detail = [error.error_user_title, error.error_user_msg ?? error.message].filter((part): part is string => typeof part === "string" && part.length > 0).join(" — ");
    throw new Error(`Meta n'a pas créé le test A/B${detail ? ` : ${detail}` : ` (${response.status})`}`);
  }
  return String(json.id);
}

/**
 * Fin commune aux deux ensembles de pubs : `durationDays` jours, avec au moins 25 h 30 min.
 * createMetaAdSet impose lui-même un minimum de 25 h à partir de SON propre « maintenant » : en restant
 * au-dessus de ce minimum, les deux ensembles (créés à quelques secondes d'écart) ont exactement la même fin.
 */
export function abAdSetEndIso(durationDays: number): string {
  const days = Number.isFinite(durationDays) && durationDays > 0 ? durationDays : 1;
  const requested = Date.now() + days * 24 * 60 * 60 * 1000;
  const minimum = Date.now() + (25 * 60 + 30) * 60 * 1000;
  return new Date(Math.max(requested, minimum)).toISOString();
}

/**
 * Début du test : quelques minutes dans le futur (Meta refuse un début déjà passé).
 * Fin du test : la fin des ensembles de pubs + 1 h de marge, pour que les deux ensembles tiennent toujours
 * entièrement dans la période du test.
 */
export function abStudyWindow(adSetEndIso: string): { startTime: Date; endTime: Date } {
  return {
    startTime: new Date(Date.now() + 5 * 60 * 1000),
    endTime: new Date(new Date(adSetEndIso).getTime() + 60 * 60 * 1000),
  };
}

/**
 * Crée la version B (ensemble de pubs + créative + annonce) dans la campagne existante, puis le test A/B Meta
 * qui oppose l'ensemble A (déjà créé par l'appelant) à l'ensemble B.
 *
 * L'appelant fournit `adSetInput` (mêmes réglages que l'ensemble A : ciblage, budget par version, pixel, fin…)
 * et `createCreative` (la fabrique de créative de l'appelant, appelée avec le texte et le titre de la version B).
 * En cas d'erreur, rien n'est nettoyé ici : l'appelant supprime la campagne Meta entière (cascade sur ses ensembles/annonces).
 */
export async function addAbVariantAndStartTest(input: {
  accountId: string;
  accessToken: string;
  businessId: string;
  campaignName: string;
  adSetAId: string;
  adSetInput: Parameters<typeof createMetaAdSet>[0];
  endTimeIso: string;
  variantB: AbVariant;
  createCreative: (variant: AbVariant) => Promise<{ id?: unknown }>;
  advantageCreative: boolean;
}) {
  const adSetB = await createMetaAdSet({ ...input.adSetInput, name: `${input.campaignName} — Ensemble B`, endTime: input.endTimeIso });
  const adSetBId = String(adSetB.id);
  const creativeB = await input.createCreative(input.variantB);
  const creativeBId = String(creativeB.id);
  const adInput = { accountId: input.accountId, accessToken: input.accessToken, name: `${input.campaignName} — Pub B`, adsetId: adSetBId, creativeId: creativeBId };
  const adB = input.advantageCreative ? await publishMetaAdWithAdvantage(adInput) : await createMetaAd({ ...adInput, status: "ACTIVE" });
  const { startTime, endTime } = abStudyWindow(input.endTimeIso);
  const studyId = await createSplitTestStudy({
    businessId: input.businessId,
    accessToken: input.accessToken,
    name: `${input.campaignName} — Test A/B`,
    startTime,
    endTime,
    adSetIds: [input.adSetAId, adSetBId],
  });
  return { studyId, adSetBId, creativeBId, adBId: String(adB.id) };
}
