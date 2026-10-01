import { META_GRAPH_BASE_URL } from "./api";

type GraphResponse = Record<string, unknown>;

function describeGraphError(json: GraphResponse, status: number): string {
  const error = (json.error as GraphResponse | undefined) ?? undefined;
  if (!error) return `Meta request failed (${status})`;
  const parts: string[] = [];
  const title = typeof error.error_user_title === "string" ? error.error_user_title : null;
  const userMsg = typeof error.error_user_msg === "string" ? error.error_user_msg : null;
  const message = typeof error.message === "string" ? error.message : null;
  // error_user_title/error_user_msg (quand Meta les fournit) expliquent concrètement
  // quel champ pose problème et pourquoi — message seul (ex: "Invalid parameter")
  // ne l'indique jamais. On les préfère donc, en gardant message en repli/complément.
  if (title || userMsg) {
    if (title) parts.push(title);
    if (userMsg && userMsg !== title) parts.push(userMsg);
  } else if (message) {
    parts.push(message);
  } else {
    parts.push(`Meta request failed (${status})`);
  }
  if (typeof error.error_subcode === "number") parts.push(`(subcode ${error.error_subcode})`);
  if (typeof error.fbtrace_id === "string") parts.push(`[fbtrace_id: ${error.fbtrace_id}]`);
  return parts.join(" — ");
}

/**
 * Vrai si le message d'erreur Graph indique que l'objet (campagne, ad set ou
 * annonce) n'existe plus côté Meta — supprimé directement depuis Meta Ads
 * Manager, ou déjà supprimé par un appel précédent (delete idempotent). Utilisé
 * pour garder Vendeo synchronisé dans les deux sens avec Meta : suppression
 * côté Meta → suppression de la campagne côté Vendeo (cron + vérif de statut).
 */
export function isMetaObjectMissingError(message: string): boolean {
  return /does not exist|has been deleted|cannot be loaded/i.test(message);
}

async function graphPost(path: string, accessToken: string, params: Record<string, string>) {
  const body = new URLSearchParams({ ...params, access_token: accessToken });
  const response = await fetch(`${META_GRAPH_BASE_URL}/${path}`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body, cache: "no-store" });
  const json = await response.json().catch(() => ({})) as GraphResponse;
  if (!response.ok || (typeof json.id !== "string" && json.success !== true)) {
    throw new Error(describeGraphError(json, response.status));
  }
  return json;
}

async function graphGet(path: string, accessToken: string, fields: string) {
  const url = new URL(`${META_GRAPH_BASE_URL}/${path}`);
  url.searchParams.set("fields", fields);
  url.searchParams.set("access_token", accessToken);
  const response = await fetch(url.toString(), { cache: "no-store" });
  const json = await response.json().catch(() => ({})) as GraphResponse;
  if (!response.ok) {
    throw new Error(describeGraphError(json, response.status));
  }
  return json;
}

/**
 * Supprime un objet Meta (campagne, ad set ou annonce — la suppression d'une
 * campagne entraîne côté Meta celle de ses ad sets/annonces). Contrairement à
 * un simple passage à PAUSED, c'est irréversible : utilisé uniquement quand
 * l'utilisateur supprime explicitement la campagne depuis Vendeo.
 */
async function graphDelete(path: string, accessToken: string) {
  const url = new URL(`${META_GRAPH_BASE_URL}/${path}`);
  url.searchParams.set("access_token", accessToken);
  const response = await fetch(url.toString(), { method: "DELETE", cache: "no-store" });
  const json = await response.json().catch(() => ({})) as GraphResponse;
  if (!response.ok || json.success === false) {
    throw new Error(describeGraphError(json, response.status));
  }
  return json;
}

export async function createMetaCampaign(input: {
  accountId: string;
  accessToken: string;
  name: string;
  objective: "sales" | "traffic" | "engagement" | "leads";
  dailyBudget: number;
  status?: "ACTIVE" | "PAUSED";
}) {
  // Meta keeps its objective names separate from the simpler Vendeo labels.
  const objective = input.objective === "sales" ? "OUTCOME_SALES" : input.objective === "traffic" ? "OUTCOME_TRAFFIC" : input.objective === "leads" ? "OUTCOME_LEADS" : "OUTCOME_ENGAGEMENT";
  const campaign = await graphPost(`${input.accountId}/campaigns`, input.accessToken, {
    name: input.name.slice(0, 200),
    objective,
    // PAUSED par défaut : on crée d'abord la campagne (et l'adset/l'ad qui suivent)
    // sans jamais dépenser un centime, pour vérifier que Meta accepte bien la
    // création avant de demander le paiement. C'est seulement au moment
    // d'activateMetaCampaign() (après paiement confirmé) que le statut passe à
    // ACTIVE — c'est ce basculement, et lui seul, qui soumet la campagne à la
    // modération de Meta et démarre la diffusion.
    status: input.status ?? "PAUSED",
    special_ad_categories: "[]",
    // Requis par Meta (Graph API v24.0+, voir changelog) dès qu'aucun budget n'est
    // défini au niveau de la campagne (ici chaque ad set porte son propre
    // daily_budget, pas de CBO) : sans ce champ, Meta refuse la création
    // (subcode 4834011). Doit être envoyé ICI, sur POST .../campaigns — un premier
    // correctif l'avait envoyé par erreur sur POST .../adsets, ce qui ne suffit pas.
    // "false" car on ne veut pas que les ad sets d'une même campagne partagent 20%
    // de leur budget entre eux.
    is_adset_budget_sharing_enabled: "false",
  });
  return { id: String(campaign.id), objective };
}

export interface MetaGeoTargeting {
  countries: string[];
  regions?: { key: string; name?: string }[];
  cities?: { key: string; name?: string; radius?: number; distance_unit?: string }[];
}

/**
 * Nom de l'annonceur exigé par Meta (Digital Services Act, subcode 3858081 :
 * « Aucun annonceur indiqué »). Meta demande dsa_beneficiary (qui bénéficie de
 * la pub) et dsa_payor (qui la paie) sur chaque ad set. On utilise le nom
 * fourni par l'appelant, sinon le nom du compte publicitaire lu via l'API Graph
 * (business_name en priorité, puis name). Retourne null si rien n'est trouvé :
 * on n'envoie alors pas les champs, comme avant.
 */
async function resolveAdvertiserName(accountId: string, accessToken: string, explicit?: string): Promise<string | null> {
  const given = explicit?.trim();
  if (given) return given.slice(0, 200);
  try {
    const json = await graphGet(accountId, accessToken, "business_name,name");
    const businessName = typeof json.business_name === "string" ? json.business_name.trim() : "";
    const accountName = typeof json.name === "string" ? json.name.trim() : "";
    const found = businessName || accountName;
    return found ? found.slice(0, 200) : null;
  } catch {
    return null;
  }
}

export async function createMetaAdSet(input: {
  accountId: string;
  accessToken: string;
  campaignId: string;
  name: string;
  dailyBudget: number;
  countries: string[];
  /** Ciblage précis (régions/villes) choisi via le widget de recherche d'audience.
   *  Quand présent et non vide, prime sur `countries` pour geo_locations — sinon
   *  Meta cible les pays entiers (comportement historique). */
  geoTargeting?: MetaGeoTargeting | null;
  minAge: number;
  maxAge: number;
  publisherPlatforms?: string[];
  status?: "ACTIVE" | "PAUSED";
  /** Nom de la personne ou de l'organisation promue (annonceur / payeur, exigé
   *  par Meta au titre du DSA). Si absent, on lit le nom du compte publicitaire. */
  advertiserName?: string;
}) {
  const hasPreciseTargeting = !!(input.geoTargeting && ((input.geoTargeting.regions?.length ?? 0) > 0 || (input.geoTargeting.cities?.length ?? 0) > 0));
  const geoLocations: Record<string, unknown> = hasPreciseTargeting
    ? {
        // Meta exige un objet par entrée ({key}), avec radius/distance_unit pour
        // les villes (rayon indicatif de 25 miles autour du centre-ville, cohérent
        // avec ce que propose Meta Ads Manager par défaut pour un ciblage ville).
        ...(input.geoTargeting!.countries.length ? { countries: input.geoTargeting!.countries } : {}),
        ...(input.geoTargeting!.regions?.length ? { regions: input.geoTargeting!.regions.map((r) => ({ key: r.key })) } : {}),
        ...(input.geoTargeting!.cities?.length ? { cities: input.geoTargeting!.cities.map((c) => ({ key: c.key, radius: c.radius ?? 25, distance_unit: c.distance_unit ?? "mile" })) } : {}),
      }
    : { countries: input.countries };

  const targeting: Record<string, unknown> = {
    geo_locations: geoLocations,
    age_min: input.minAge,
    age_max: input.maxAge,
    // Requis par Meta (Graph API v23.0+, subcode 1870227) dès que l'âge min/max
    // n'est pas la config par défaut : il faut dire explicitement si l'audience
    // Advantage+ (élargissement automatique de l'audience par l'IA de Meta) est
    // activée. 0 = désactivée, pour garder exactement l'âge/pays choisis par
    // l'utilisateur plutôt que de laisser Meta les élargir automatiquement.
    // (Ne concerne QUE l'audience : l'Advantage+ créative, lui, se règle sur la
    // créative — voir ADVANTAGE_CREATIVE_FEATURES plus bas.)
    targeting_automation: { advantage_audience: 0 },
  };
  // Plan Éco : diffusion restreinte à Facebook uniquement (pas Instagram).
  // Sans ce champ, Meta diffuse automatiquement sur tous les emplacements disponibles.
  if (input.publisherPlatforms?.length) targeting.publisher_platforms = input.publisherPlatforms;

  const params: Record<string, string> = {
    name: input.name.slice(0, 200),
    campaign_id: input.campaignId,
    daily_budget: String(Math.round(input.dailyBudget * 100)),
    billing_event: "IMPRESSIONS",
    optimization_goal: "LINK_CLICKS",
    bid_strategy: "LOWEST_COST_WITHOUT_CAP",
    targeting: JSON.stringify(targeting),
    status: input.status ?? "PAUSED",
  };
  // Annonceur / payeur (DSA) : sans ces deux champs Meta refuse l'ad set avec
  // « Aucun annonceur indiqué » (subcode 3858081), même si un compte publicitaire
  // est bien sélectionné dans Vendeo — ce champ est distinct du compte pub.
  const advertiserName = await resolveAdvertiserName(input.accountId, input.accessToken, input.advertiserName);
  if (advertiserName) {
    params.dsa_beneficiary = advertiserName;
    params.dsa_payor = advertiserName;
  }
  return graphPost(`${input.accountId}/adsets`, input.accessToken, params);
}

/**
 * Advantage+ créative : améliorations automatiques du contenu publicitaire
 * (recommandation « Améliorations du contenu publicitaire Advantage+ » du Score
 * d'opportunité de Meta). Depuis l'API Marketing v22.0, l'ancien bundle
 * standard_enhancements n'existe plus : chaque fonction s'active séparément via
 * degrees_of_freedom_spec.creative_features_spec (enroll_status OPT_IN).
 *
 * Correspondance avec les libellés d'Ads Manager :
 * - image_touchups      → « Retouches visuelles » (recadrage/expansion, sans IA générative)
 * - text_optimizations  → « Améliorations du texte » (sans IA générative)
 * - image_templates     → « Ajouter des superpositions » (générée par IA)
 * Source : developers.facebook.com → Get Started with Advantage+ Creative.
 */
const ADVANTAGE_CREATIVE_FEATURES = ["image_touchups", "text_optimizations", "image_templates"] as const;

function advantageCreativeSpec(): string {
  const creativeFeaturesSpec: Record<string, { enroll_status: "OPT_IN" }> = {};
  for (const feature of ADVANTAGE_CREATIVE_FEATURES) creativeFeaturesSpec[feature] = { enroll_status: "OPT_IN" };
  return JSON.stringify({ creative_features_spec: creativeFeaturesSpec });
}

export async function createMetaCreative(input: {
  accountId: string;
  accessToken: string;
  name: string;
  pageId: string;
  link: string;
  message: string;
  headline: string;
  imageUrl: string;
  /** Hash d'une image déjà envoyée à Meta (POST /adimages) : utilisé à la place de l'URL, que Meta n'arrive pas toujours à télécharger. */
  imageHash?: string;
  /** Active les améliorations Advantage+ créative (voir ADVANTAGE_CREATIVE_FEATURES).
   *  Désactivé par défaut : seuls les appelants qui le demandent explicitement en profitent. */
  advantageCreative?: boolean;
}) {
  const params: Record<string, string> = {
    name: input.name.slice(0, 200),
    // Dans link_data, le champ pour une image par URL s'appelle "picture", pas
    // "image_url" — "image_url" n'existe que dans video_data/photo_data et Meta
    // le refuse ici (subcode 1443050 : "Utilisation d'un champ non pris en
    // charge dans object_story_spec").
    object_story_spec: JSON.stringify({ page_id: input.pageId, link_data: { link: input.link, message: input.message, name: input.headline, ...(input.imageHash ? { image_hash: input.imageHash } : { picture: input.imageUrl }), call_to_action: { type: "LEARN_MORE", value: { link: input.link } } } }),
  };
  if (input.advantageCreative) {
    try {
      return await graphPost(`${input.accountId}/adcreatives`, input.accessToken, { ...params, degrees_of_freedom_spec: advantageCreativeSpec() });
    } catch (error) {
      // Filet de sécurité : si Meta refuse ce réglage (nom de champ, éligibilité…),
      // on ne bloque pas le lancement — on recrée la créative sans Advantage+.
      // Si le problème venait d'autre chose (image, page…), le second appel
      // renverra la même erreur, qui remontera normalement à l'utilisateur.
      const message = error instanceof Error ? error.message : "Erreur inconnue.";
      console.error("createMetaCreative: Advantage+ créative refusé par Meta, nouvel essai sans", message);
    }
  }
  return graphPost(`${input.accountId}/adcreatives`, input.accessToken, params);
}

export async function createMetaAd(input: { accountId: string; accessToken: string; name: string; adsetId: string; creativeId: string; status?: "ACTIVE" | "PAUSED" }) {
  return graphPost(`${input.accountId}/ads`, input.accessToken, { name: input.name.slice(0, 200), adset_id: input.adsetId, creative: JSON.stringify({ creative_id: input.creativeId }), status: input.status ?? "PAUSED" });
}

/**
 * Demande à Meta l'aperçu de chaque fonction Advantage+ créative sur une annonce
 * existante. La doc Meta demande de créer l'annonce en PAUSED, de passer par
 * l'aperçu, puis de l'activer quand la créative utilise une fonction générée par
 * IA (ici image_templates). Best-effort : une erreur d'aperçu ne bloque jamais.
 */
async function previewMetaAdFeatures(input: { adId: string; accessToken: string }) {
  await Promise.all(
    ADVANTAGE_CREATIVE_FEATURES.map(async (feature) => {
      try {
        const url = new URL(`${META_GRAPH_BASE_URL}/${input.adId}/previews`);
        url.searchParams.set("ad_format", "MOBILE_FEED_STANDARD");
        url.searchParams.set("creative_feature", feature);
        url.searchParams.set("access_token", input.accessToken);
        await fetch(url.toString(), { cache: "no-store" });
      } catch {
        // l'aperçu est indicatif : on ignore
      }
    })
  );
}

/**
 * Crée l'annonce en PAUSED, demande l'aperçu des fonctions Advantage+ créative,
 * puis l'active — le parcours que la doc Meta impose quand des fonctions IA sont
 * activées sur la créative. À utiliser avec une créative créée via
 * createMetaCreative({ advantageCreative: true }). Même résultat final que
 * createMetaAd({ status: "ACTIVE" }) : une annonce ACTIVE.
 */
export async function publishMetaAdWithAdvantage(input: { accountId: string; accessToken: string; name: string; adsetId: string; creativeId: string }) {
  const ad = await createMetaAd({ ...input, status: "PAUSED" });
  const adId = String(ad.id);
  await previewMetaAdFeatures({ adId, accessToken: input.accessToken });
  await setMetaObjectStatus({ id: adId, accessToken: input.accessToken, status: "ACTIVE" });
  return ad;
}

/**
 * Basule le statut d'un objet Meta déjà créé (campagne, adset ou ad — l'API Graph
 * accepte "status" sur les trois types de nœud de la même façon). Utilisé pour
 * l'activation post-paiement : on ne recrée rien, on passe juste PAUSED → ACTIVE.
 */
export async function setMetaObjectStatus(input: { id: string; accessToken: string; status: "ACTIVE" | "PAUSED" }) {
  return graphPost(input.id, input.accessToken, { status: input.status });
}

/**
 * Active une campagne Meta déjà créée en PAUSED (campagne, adset et ad) : c'est ce
 * basculement — et seulement lui — qui soumet la publicité à la modération de Meta
 * et démarre la diffusion réelle. Appelé uniquement après confirmation du paiement.
 */
export async function activateMetaCampaign(input: { campaignId: string; adSetId: string; adId: string; accessToken: string }) {
  await setMetaObjectStatus({ id: input.campaignId, accessToken: input.accessToken, status: "ACTIVE" });
  await setMetaObjectStatus({ id: input.adSetId, accessToken: input.accessToken, status: "ACTIVE" });
  await setMetaObjectStatus({ id: input.adId, accessToken: input.accessToken, status: "ACTIVE" });
}

/**
 * Met en pause une campagne Meta (campagne, ad set et ad). Utilisé par le
 * pilotage automatique quand la campagne n'est pas rentable.
 */
export async function pauseMetaCampaign(input: { campaignId: string; adSetId: string; adId: string; accessToken: string }) {
  await setMetaObjectStatus({ id: input.campaignId, accessToken: input.accessToken, status: "PAUSED" });
  await setMetaObjectStatus({ id: input.adSetId, accessToken: input.accessToken, status: "PAUSED" });
  await setMetaObjectStatus({ id: input.adId, accessToken: input.accessToken, status: "PAUSED" });
}

/**
 * Supprime une campagne Meta (et, par cascade côté Meta, ses ad sets et
 * annonces) — utilisée quand l'utilisateur supprime la campagne depuis Vendeo,
 * pour rester synchronisé dans les deux sens avec Meta Ads Manager. Idempotent
 * en pratique : si la campagne a déjà été supprimée côté Meta (ex: par
 * l'utilisateur directement dans Meta Ads Manager), l'appelant doit traiter
 * une erreur "does not exist" (voir isMetaObjectMissingError) comme un succès.
 */
export async function deleteMetaCampaign(input: { campaignId: string; accessToken: string }) {
  await graphDelete(input.campaignId, input.accessToken);
}

/**
 * Rattache une nouvelle créative à une annonce déjà créée chez Meta, sans
 * recréer l'annonce elle-même. Utilisé pour relancer une publicité rejetée :
 * Meta ne redéclenche une revue que si le contenu (texte/visuel/lien) change —
 * remettre seulement le statut à ACTIVE ne suffit pas sur une annonce DISAPPROVED.
 */
export async function updateMetaAdCreative(input: { adId: string; accessToken: string; creativeId: string }) {
  return graphPost(input.adId, input.accessToken, { creative: JSON.stringify({ creative_id: input.creativeId }) });
}

/**
 * Interroge Meta pour savoir où en est la modération d'une publicité soumise.
 * effective_status possibles (doc Meta) : PENDING_REVIEW, IN_PROCESS, PREAPPROVED,
 * PENDING_BILLING_INFO (encore en cours) ; ACTIVE (approuvée, diffusion en cours) ;
 * DISAPPROVED, WITH_ISSUES (refusée) ; CAMPAIGN_PAUSED / ADSET_PAUSED (mis en pause
 * en amont — normal tant que activateMetaCampaign() n'a pas encore été appelé).
 */
export async function getMetaAdReviewStatus(input: { adId: string; accessToken: string }) {
  const json = await graphGet(input.adId, input.accessToken, "effective_status,ad_review_feedback");
  return {
    effectiveStatus: String(json.effective_status ?? ""),
    feedback: (json.ad_review_feedback as Record<string, unknown> | null) ?? null,
  };
}

/** Traduit le statut Meta en statut Vendeo. Retourne null si rien ne doit changer (encore en cours). */
export function mapMetaEffectiveStatus(effectiveStatus: string, feedback: Record<string, unknown> | null): { status: "active" | "rejected"; error: string | null } | null {
  if (effectiveStatus === "ACTIVE") return { status: "active", error: null };
  if (effectiveStatus === "DISAPPROVED" || effectiveStatus === "WITH_ISSUES") {
    // La forme exacte de ad_review_feedback varie selon le type de refus (global vs par ligne).
    // On prend le texte tel quel pour l'afficher à l'utilisateur, tronqué par sécurité.
    let reason = "Publicité refusée par Meta.";
    try {
      const flat = JSON.stringify(feedback ?? {});
      if (flat && flat !== "{}" && flat !== "null") reason = flat.slice(0, 480);
    } catch {
      // garde le message par défaut
    }
    return { status: "rejected", error: reason };
  }
  return null; // PENDING_REVIEW, IN_PROCESS, PREAPPROVED, PENDING_BILLING_INFO...
}
