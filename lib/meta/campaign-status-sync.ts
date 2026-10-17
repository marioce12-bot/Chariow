import { fetchMetaAccountStatus } from "@/lib/meta/api";
import { getMetaAdReviewStatus, mapMetaEffectiveStatus } from "@/lib/meta/campaigns";
import { markMetaPausedReason } from "@/lib/meta/status";
import { fetchMetaCampaignList } from "@/lib/meta/campaign-list";

type CampaignRow = {
  id: string;
  external_ad_id: string;
  external_campaign_id: string | null;
  status: string;
  external_error: string | null;
};

type SyncInput = {
  supabase: any;
  accountId: string;
  metaAccountId: string;
  accessToken: string;
  userId?: string;
};

const PAGE_SIZE = 500;
const MAX_CONCURRENT_META_REQUESTS = 5;

function graphAccountId(value: string) {
  return value.startsWith("act_") ? value : `act_${value}`;
}

/** Rafraîchit le compte et toutes les campagnes Meta lancées, y compris les pauses locales. */
export async function syncMetaCampaignStatuses(input: SyncInput) {
  const result = {
    accountStatus: null as number | null,
    accountStatusSaved: false,
    checked: 0,
    updated: 0,
    errors: 0,
  };

  try {
    result.accountStatus = await fetchMetaAccountStatus(graphAccountId(input.metaAccountId), input.accessToken);
    let accountUpdate = input.supabase.from("meta_ad_accounts").update({ account_status: result.accountStatus }).eq("id", input.accountId);
    if (input.userId) accountUpdate = accountUpdate.eq("user_id", input.userId);
    const { error } = await accountUpdate;
    if (error) throw error;
    result.accountStatusSaved = true;
  } catch (error) {
    result.errors += 1;
    console.error("Meta account status sync failed", error instanceof Error ? error.message : "unknown error");
  }

  const campaigns: CampaignRow[] = [];
  let offset = 0;
  while (true) {
    let query = input.supabase
      .from("ad_campaigns")
      .select("id,external_ad_id,external_campaign_id,status,external_error")
      .eq("platform", "meta")
      .eq("meta_ad_account_id", input.accountId)
      .in("status", ["active", "review", "paused"])
      .order("id", { ascending: true })
      .not("external_ad_id", "is", null);
    if (input.userId) query = query.eq("user_id", input.userId);

    const { data, error } = await query.range(offset, offset + PAGE_SIZE - 1);
    if (error) {
      result.errors += 1;
      console.error("Meta campaign status query failed", error.message);
      return result;
    }

    const page = (data ?? []) as CampaignRow[];
    campaigns.push(...page);
    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  // L'inventaire paginé est une source indépendante pour les campagnes dont l'annonce
  // retourne #100 (objet absent OU droits insuffisants). Toute erreur invalide la
  // réconciliation complète; aucun absent ne sera alors interprété.
  let inventory: Awaited<ReturnType<typeof fetchMetaCampaignList>>;
  try {
    inventory = await fetchMetaCampaignList(graphAccountId(input.metaAccountId), input.accessToken);
  } catch (error) {
    result.errors += 1;
    console.error("Meta campaign inventory incomplete; skipping reconciliation", error instanceof Error ? error.message : "unknown error");
    return result;
  }
  const inventoryById = new Map(inventory.map((campaign) => [campaign.id, campaign]));

  // Une campagne active absente d'un inventaire intégral n'est plus active chez Meta.
  // On conserve la ligne et l'historique, sans affirmer qu'elle a été supprimée.
  for (const campaign of campaigns) {
    if (!["active", "review"].includes(campaign.status) || !campaign.external_campaign_id || inventoryById.has(campaign.external_campaign_id)) continue;
    const reason = markMetaPausedReason("Campagne absente de l’inventaire complet Meta; statut mis en pause, historique conservé.");
    let update = input.supabase.from("ad_campaigns").update({ status: "paused", external_error: reason }).eq("id", campaign.id);
    if (input.userId) update = update.eq("user_id", input.userId);
    const { error } = await update;
    if (error) { result.errors += 1; continue; }
    result.updated += 1;
  }

  // Une pause manuelle locale n'empêche pas Meta de changer l'objet en archive/suppression.
  // Il faut donc rafraîchir toutes les campagnes liées, pas seulement les pauses « Meta ».
  const candidates = campaigns;
  let nextIndex = 0;
  const workerCount = Math.min(MAX_CONCURRENT_META_REQUESTS, candidates.length);
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < candidates.length) {
      const campaign = candidates[nextIndex++];
      if (campaign.external_campaign_id && !inventoryById.has(campaign.external_campaign_id)) continue;
      result.checked += 1;
      try {
        const { effectiveStatus, feedback } = await getMetaAdReviewStatus({ adId: campaign.external_ad_id, accessToken: input.accessToken });
        let mapped = mapMetaEffectiveStatus(effectiveStatus, feedback, result.accountStatus);
        // #100 peut également signifier permissions insuffisantes: ne jamais conclure
        // sur cette erreur seule. Si l'inventaire complet confirme la campagne parent,
        // son état parent peut toutefois fournir une réconciliation utile.
        if (!mapped && campaign.external_campaign_id) {
          const parent = inventoryById.get(campaign.external_campaign_id);
          if (parent?.effectiveStatus) mapped = mapMetaEffectiveStatus(parent.effectiveStatus, null, result.accountStatus);
        }
        if (!mapped) {
          // État Meta non reconnu : on laisse le statut tel quel, mais on le trace pour pouvoir l'ajouter au mapping.
          console.warn("Meta campaign status sync: effective_status non reconnu", campaign.id, effectiveStatus || "(vide)");
          continue;
        }
        const externalError = mapped.status === "paused"
          ? markMetaPausedReason(mapped.error ?? "Meta signale que la publicité est en pause.")
          : mapped.error;
        if (campaign.status === mapped.status && campaign.external_error === externalError) continue;

        let update = input.supabase
          .from("ad_campaigns")
          .update({ status: mapped.status, external_error: externalError })
          .eq("id", campaign.id);
        if (input.userId) update = update.eq("user_id", input.userId);
        const { error: updateError } = await update;
        if (updateError) throw updateError;
        result.updated += 1;
      } catch (error) {
        // Meta error #100 can mean missing object OR missing permissions. An
        // inconclusive lookup (including network/permission failures) is not a
        // deletion signal: keep the row and its existing status untouched.
        result.errors += 1;
        console.error("Meta campaign status sync failed", error instanceof Error ? error.message : "unknown error");
      }
    }
  }));

  return result;
}
