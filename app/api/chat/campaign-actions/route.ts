import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { requireUser } from "@/lib/auth";
import { decryptSecret } from "@/lib/crypto";
import { activateMetaCampaign, deleteMetaCampaign, pauseMetaCampaign } from "@/lib/meta/campaigns";
import { META_GRAPH_BASE_URL } from "@/lib/meta/api";
import { issueConfirmation, normalizeChanges, platformStatusFromMeta, verifyConfirmation, type CampaignAction } from "@/lib/chat/campaign-actions";

const copyFields = ["store_id", "product_id", "product_name", "platform", "objective", "ad_set_name", "ad_name", "ad_text", "destination_url", "media_url", "carousel_urls", "countries", "geo_targeting", "min_age", "max_age", "meta_ad_account_id", "tiktok_ad_account_id", "pinterest_ad_account_id", "meta_page_id", "call_to_action", "advantage_creative", "advantage_audience", "daily_budget", "duration_days"] as const;
const fields = "id,user_id,title,status,external_campaign_id,external_adset_id,external_ad_id,external_creative_id,autopilot_enabled,updated_at,store_id,product_id,product_name,platform,objective,ad_set_name,ad_name,ad_text,destination_url,media_url,carousel_urls,countries,geo_targeting,min_age,max_age,meta_ad_account_id,tiktok_ad_account_id,pinterest_ad_account_id,meta_page_id,call_to_action,advantage_creative,advantage_audience,daily_budget,duration_days";
const fail = (error: string, status: number) => NextResponse.json({ error }, { status });
type Row = Record<string, any>;
async function graphRead(id: string, accessToken: string, requestedFields: string): Promise<Row> {
  const url = new URL(`${META_GRAPH_BASE_URL}/${id}`);
  url.searchParams.set("fields", requestedFields);
  url.searchParams.set("access_token", accessToken);
  const response = await fetch(url.toString(), { cache: "no-store", signal: AbortSignal.timeout(15000) });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json || json.error || json.id !== id) throw new Error("Lecture Meta non vérifiée");
  return json;
}
function draftCopy(campaign: Row, userId: string) {
  const copy: Row = Object.fromEntries(copyFields.map(field => [field, campaign[field] ?? null]));
  // A whitelist prevents copying external IDs, payment state or Autopilot state.
  copy.user_id = userId;
  copy.status = "draft";
  copy.title = `${campaign.title || campaign.product_name || "Campagne"} (copie)`;
  copy.estimated_budget = Number(campaign.daily_budget) * Number(campaign.duration_days);
  copy.autopilot_enabled = false;
  if (typeof copy.destination_url === "string") {
    try { const url = new URL(copy.destination_url); url.searchParams.delete("utm_campaign"); copy.destination_url = url.toString(); } catch { /* preserve legacy link */ }
  }
  return copy;
}

export async function POST(request: Request) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || !["prepare", "execute"].includes(String(body.phase)) || typeof body.campaignId !== "string" || !body.campaignId || !["edit", "delete", "pause", "activate", "duplicate"].includes(String(body.action))) return fail("Paramètres invalides", 400);
  const action = body.action as CampaignAction;
  let changes;
  try { changes = normalizeChanges(action, body.changes); } catch (error) { return fail(error instanceof Error ? error.message : "Paramètres invalides", 400); }
  const { data: campaign, error: dbError } = await supabase.from("ad_campaigns").select(fields).eq("id", body.campaignId).eq("user_id", user.id).maybeSingle();
  if (dbError) return fail("Impossible de charger la campagne", 500);
  if (!campaign) return fail("Campagne introuvable", 404);
  if (typeof campaign.updated_at !== "string" || !campaign.updated_at) return fail("Version de campagne non vérifiable", 409);
  if (!["meta", "pinterest", "tiktok"].includes(campaign.platform)) return fail("Plateforme indisponible", 501);
  const localDraft = campaign.status === "draft" && !campaign.external_campaign_id && !campaign.external_adset_id && !campaign.external_ad_id && !campaign.external_creative_id;
  let live: Row | null = null;
  let children: { adSet: Row; ad: Row } | null = null;
  let accessToken = "";
  let currentStatus = campaign.status as string;
  let name = campaign.title || campaign.product_name || campaign.id;
  let warning = "";
  if (localDraft) {
    if (!["edit", "delete", "duplicate"].includes(action)) return fail(`Action ${action} indisponible pour un brouillon local. Utilise le parcours de lancement avec sa confirmation.`, 409);
  } else {
    if (campaign.platform !== "meta") return fail(`Gestion des campagnes ${campaign.platform} déjà publiées indisponible ici; aucune modification effectuée.`, 501);
    if (action === "edit") return fail("Édition d’une campagne publiée indisponible, même en pause. Duplique-la puis modifie le nouveau brouillon.", 501);
    if (action === "activate" && !["active", "paused", "autopilot_paused", "review", "preparing", "unknown", "rejected", "completed"].includes(campaign.status)) return fail("Cette campagne doit passer par le parcours de lancement et ses validations habituelles avant de pouvoir être réactivée ici.", 409);
    if (!campaign.external_campaign_id || !campaign.meta_ad_account_id) return fail("Identifiants Meta incomplets; action indisponible.", 409);
    const { data: account, error: accountError } = await supabase.from("meta_ad_accounts").select("access_token_encrypted,is_active,meta_account_id,currency").eq("id", campaign.meta_ad_account_id).eq("user_id", user.id).maybeSingle();
    if (accountError) return fail("Impossible de vérifier le compte Meta", 500);
    if (!account?.is_active || !account.access_token_encrypted || !account.meta_account_id) return fail("Intégration Meta indisponible", 409);
    try {
      accessToken = decryptSecret(account.access_token_encrypted);
      live = await graphRead(campaign.external_campaign_id, accessToken, "id,name,account_id,status,effective_status,daily_budget,lifetime_budget");
      const expectedAccount = String(account.meta_account_id).replace(/^act_/, "");
      if (String(live.account_id) !== expectedAccount) throw new Error("Compte Meta incohérent");
      const knownStatuses = ["ACTIVE", "PAUSED", "ARCHIVED", "DELETED", "IN_PROCESS", "WITH_ISSUES", "DISAPPROVED", "PENDING_REVIEW"];
      const status = platformStatusFromMeta(live);
      if (!status || !knownStatuses.includes(status) || typeof live.status !== "string") throw new Error("État Meta inconnu");
      currentStatus = status;
      name = typeof live.name === "string" && live.name ? live.name : name;
      if (["ARCHIVED", "DELETED"].includes(status) && action !== "duplicate") return fail("Cette campagne Meta est archivée ou supprimée; action indisponible.", 409);
      if (action === "pause" || action === "activate") {
        if (!campaign.external_adset_id || !campaign.external_ad_id) return fail("Ensemble et publicité Meta non identifiés; action indisponible.", 409);
        const adSet = await graphRead(campaign.external_adset_id, accessToken, "id,name,account_id,campaign_id,status,effective_status,daily_budget,lifetime_budget,start_time,end_time");
        const ad = await graphRead(campaign.external_ad_id, accessToken, "id,name,account_id,campaign_id,adset_id,status,effective_status");
        if (adSet.campaign_id !== campaign.external_campaign_id || ad.campaign_id !== campaign.external_campaign_id || ad.adset_id !== campaign.external_adset_id || String(adSet.account_id) !== expectedAccount || String(ad.account_id) !== expectedAccount || !adSet.status || !ad.status) throw new Error("Entités Meta incohérentes");
        if (action === "activate" && [adSet.status, ad.status].some(status => ["ARCHIVED", "DELETED"].includes(status))) return fail("Un ensemble ou une publicité est archivé ou supprimé; activation indisponible.", 409);
        children = { adSet, ad };
        const daily = live.daily_budget || adSet.daily_budget;
        const lifetime = live.lifetime_budget || adSet.lifetime_budget;
        const budget = daily ? `Budget Meta quotidien : ${daily} unités mineures ${account.currency || "(devise non vérifiée)"}.` : lifetime ? `Budget Meta total : ${lifetime} unités mineures ${account.currency || "(devise non vérifiée)"}.` : "Budget Meta non renseigné dans cette lecture; consulter Meta avant activation.";
        warning = `Cible Meta : campagne ${campaign.external_campaign_id}, ensemble ${campaign.external_adset_id}, publicité ${campaign.external_ad_id}. Statut demandé sur les trois : ${action === "pause" ? "PAUSED" : "ACTIVE"}. ${budget} Les règles automatiques de budget associées seront désactivées.`;
      }
    } catch { return fail("Impossible de relire et vérifier l’état actuel et les entités chez Meta; aucune mutation envoyée.", 503); }
  }
  if (action === "duplicate") warning = "Copie des réglages enregistrés dans Vendeo vers un brouillon indépendant; aucun objet Meta/Pinterest/TikTok créé, aucun lancement ni dépense.";
  if (action === "delete") warning = `${localDraft ? "Suppression du brouillon Vendeo uniquement." : "Suppression de la campagne Meta et de ses ensembles/publicités par cascade."} Cette suppression est irréversible.`;
  // Bind the confirmation to every platform parameter displayed/read, not just cached status.
  const snapshot = createHash("sha256").update(JSON.stringify({ localStatus: campaign.status, currentStatus, live, children })).digest("hex");
  const expected = { userId: user.id, campaignId: campaign.id, action, changes, status: snapshot, updatedAt: campaign.updated_at };
  if (body.phase === "prepare") {
    try {
      const token = issueConfirmation(expected);
      return NextResponse.json({ preview: { campaignId: campaign.id, name, platform: campaign.platform, action, changes, currentStatus, warning, requiresConfirmation: true }, token, capabilities: { editDraft: localDraft, delete: true, pause: !localDraft, activate: !localDraft, editLive: false, duplicateDraft: true } }, { headers: { "Cache-Control": "private, no-store" } });
    } catch { return fail("Confirmation sécurisée indisponible; aucune modification effectuée.", 503); }
  }
  let valid = false;
  try { valid = verifyConfirmation(body.token, expected); } catch { /* no configured secret */ }
  if (!valid) return fail("Confirmation invalide, expirée ou état modifié. Prépare à nouveau l’action.", 409);
  if (body.confirmed !== true) return fail("Confirmation explicite requise.", 400);

  if (localDraft && action === "delete") {
    const { data, error } = await supabase.from("ad_campaigns").delete().eq("id", campaign.id).eq("user_id", user.id).eq("status", "draft").eq("updated_at", campaign.updated_at).select("id").maybeSingle();
    if (error || !data) return fail("Suppression impossible ou action déjà exécutée; prépare à nouveau.", error ? 500 : 409);
    return NextResponse.json({ message: "Brouillon supprimé de Vendeo; aucune campagne externe n’était associée." });
  }
  if (localDraft && action === "edit") {
    const updates = { ...(changes.title !== undefined ? { title: changes.title } : {}), ...(changes.daily_budget !== undefined ? { daily_budget: changes.daily_budget, estimated_budget: changes.daily_budget * Number(campaign.duration_days) } : {}) };
    const { data, error } = await supabase.from("ad_campaigns").update(updates).eq("id", campaign.id).eq("user_id", user.id).eq("status", "draft").eq("updated_at", campaign.updated_at).select("id,title,daily_budget,status").maybeSingle();
    if (error || !data) return fail("Modification impossible ou action déjà exécutée; prépare à nouveau.", error ? 500 : 409);
    return NextResponse.json({ message: "Brouillon modifié dans Vendeo; aucune campagne externe n’a été modifiée.", campaign: data });
  }
  // An atomic compare-and-swap claims this revision before external writes or copies.
  // The DB trigger sets updated_at itself: always use its RETURNED timestamp below.
  const { data: claimed, error: claimError } = await supabase.from("ad_campaigns").update({ updated_at: new Date().toISOString(), ...(!localDraft && action !== "duplicate" ? { autopilot_enabled: false } : {}) }).eq("id", campaign.id).eq("user_id", user.id).eq("updated_at", campaign.updated_at).select("id,updated_at").maybeSingle();
  if (claimError || !claimed?.updated_at || claimed.updated_at === campaign.updated_at) return fail("Action déjà exécutée ou campagne modifiée; prépare à nouveau.", claimError ? 500 : 409);
  if (action === "duplicate") {
    const { data, error } = await supabase.from("ad_campaigns").insert(draftCopy(campaign, user.id)).select("id,title,platform,status,daily_budget").single();
    if (error || !data) return fail("Impossible de créer le brouillon indépendant. Aucune campagne externe n’a été créée.", 500);
    return NextResponse.json({ message: "Brouillon dupliqué dans Vendeo. Aucun lancement ni création sur la plateforme.", campaign: data });
  }
  try {
    if (action === "delete") await deleteMetaCampaign({ campaignId: campaign.external_campaign_id, accessToken });
    else {
      const input = { campaignId: campaign.external_campaign_id, adSetId: campaign.external_adset_id, adId: campaign.external_ad_id, accessToken };
      if (action === "pause") await pauseMetaCampaign(input);
      else await activateMetaCampaign(input);
      // Verify configured states, never equate ACTIVE with actual delivery/spend.
      const target = action === "pause" ? "PAUSED" : "ACTIVE";
      const checked = await Promise.all([
        graphRead(campaign.external_campaign_id, accessToken, "id,status"),
        graphRead(campaign.external_adset_id, accessToken, "id,status"),
        graphRead(campaign.external_ad_id, accessToken, "id,status"),
      ]);
      if (checked.some(row => row.status !== target)) throw new Error("État demandé non vérifié après envoi");
    }
  } catch { return fail("L’action Meta a échoué ou son résultat n’est pas confirmé. Elle peut être partiellement appliquée; vérifie campagne, ensemble et publicité avant toute nouvelle action. Les règles automatiques de budget ont été désactivées.", 502); }
  const status = action === "delete" ? "deleted" : action === "pause" ? "paused" : "review";
  const updates = { status, autopilot_enabled: false, ...(action === "pause" ? { autopilot_paused_at: new Date().toISOString(), autopilot_pause_reason: "user_requested" } : {}) };
  const { data, error } = await supabase.from("ad_campaigns").update(updates).eq("id", campaign.id).eq("user_id", user.id).eq("updated_at", claimed.updated_at).select("id,title,status,platform").maybeSingle();
  if (error || !data) return fail("Meta a accepté l’action, mais l’état Vendeo n’a pas été enregistré. Vérifie la campagne avant toute nouvelle action.", 502);
  return NextResponse.json({ message: action === "delete" ? "Suppression confirmée par Meta; campagne marquée supprimée dans Vendeo." : action === "pause" ? "Pause configurée et vérifiée chez Meta sur la campagne, l’ensemble et la publicité; les règles automatiques de budget ont été désactivées." : "Statut ACTIVE configuré et vérifié chez Meta. La diffusion reste soumise à l’examen et aux restrictions Meta; les règles automatiques de budget ont été désactivées.", campaign: data });
}
