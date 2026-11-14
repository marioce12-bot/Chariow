import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret } from "@/lib/crypto";
import { buildPackMetaState, syncLinkedStandardCampaignStatus, unavailablePackMetaState, withPackMetaState, type PackMetaSnapshot, type PackMetaState } from "@/lib/ad-variant-pack-lifecycle";
import { createPackMetaLifecycleOperations } from "@/lib/ad-variant-pack-meta-lifecycle";
import { isMetaObjectMissingError } from "@/lib/meta/campaigns";
import { issueConfirmation, verifyConfirmation, type CampaignAction } from "@/lib/chat/campaign-actions";

type Context = { params: Promise<{ id: string }> };
type Action = "pause" | "activate" | "delete" | "pause-ad" | "activate-ad";
type Row = Record<string, any>;
const fail = (error: string, status: number) => NextResponse.json({ error }, { status, headers: { "Cache-Control": "private, no-store" } });
const terminal = new Set(["ARCHIVED", "CAMPAIGN_ARCHIVED", "ADSET_ARCHIVED", "AD_ARCHIVED", "DELETED", "CAMPAIGN_DELETED", "ADSET_DELETED", "AD_DELETED"]);

function actionType(action: Action): CampaignAction {
  if (action === "pause" || action === "pause-ad") return "pause";
  if (action === "activate" || action === "activate-ad") return "activate";
  return "delete";
}

function nodeVersion(node: Row | null | undefined) {
  if (!node) return null;
  return {
    id: node.id ?? null,
    account_id: node.account_id ?? null,
    campaign_id: node.campaign_id ?? null,
    adset_id: node.adset_id ?? null,
    status: node.status ?? null,
    effective_status: node.effective_status ?? null,
    ad_review_feedback: node.ad_review_feedback ?? null,
  };
}

function confirmationSnapshot(snapshot: PackMetaSnapshot, action: Action, adIndex: number | null) {
  return createHash("sha256").update(JSON.stringify({
    action,
    adIndex,
    missing: snapshot.missing === true,
    campaign: nodeVersion(snapshot.campaign),
    adsets: snapshot.adsets.map(nodeVersion),
    ads: snapshot.ads.map(nodeVersion),
  })).digest("hex");
}

function actionValidation(action: Action, snapshot: PackMetaSnapshot, state: PackMetaState, adIndex: number | null): string | null {
  if (action === "delete") return null;
  if (snapshot.missing) return "La campagne Meta n’existe plus ou est supprimée; seule sa suppression/historique est disponible.";
  if (action === "pause-ad" || action === "activate-ad") {
    const ad = snapshot.ads[adIndex ?? -1];
    if (!ad) return "Publicité du Pack introuvable chez Meta.";
    const statuses = [ad.status, ad.effective_status].filter((value): value is string => typeof value === "string").map((value) => value.toUpperCase());
    if (statuses.some((value) => terminal.has(value))) return "Cette publicité est archivée ou supprimée chez Meta.";
    if (!ad.status || !["ACTIVE", "PAUSED"].includes(ad.status.toUpperCase())) return "État Meta de cette publicité non reconnu; aucune action envoyée.";
    if (action === "activate-ad" && state.ads?.[adIndex ?? -1]?.status === "rejected") return "Meta a refusé cette publicité; corrige son contenu avant de l’activer.";
    return null;
  }
  const entities = [snapshot.campaign, ...snapshot.adsets, ...snapshot.ads];
  if (entities.some((entity) => [entity.status, entity.effective_status].some((value) => typeof value === "string" && terminal.has(value.toUpperCase())))) {
    return "Un objet Meta du Pack est archivé ou supprimé; aucune action groupée envoyée.";
  }
  if (entities.some((entity) => !entity.status || !["ACTIVE", "PAUSED"].includes(entity.status.toUpperCase()))) {
    return "L’état d’un objet Meta n’est pas reconnu; aucune action groupée envoyée.";
  }
  if (action === "activate" && state.ads?.some((ad) => ad.status === "rejected")) return "Meta a refusé au moins une publicité; corrige son contenu avant d’activer tout le Pack.";
  return null;
}

function warningFor(action: Action, pack: Row, snapshot: PackMetaSnapshot, adIndex: number | null) {
  if (action === "delete") {
    return snapshot.missing
      ? "Meta confirme que la campagne n’existe déjà plus. Vendeo va marquer le Pack comme supprimé; aucune nouvelle demande de suppression ne sera envoyée."
      : "Suppression irréversible : Vendeo demandera à Meta de supprimer la campagne parent et, par cascade, ses ensembles et publicités. L’historique du Pack restera dans Vendeo.";
  }
  if (action === "pause-ad" || action === "activate-ad") {
    const angle = pack.variants?.[adIndex ?? -1]?.angle || `Variante ${(adIndex ?? 0) + 1}`;
    return `${action === "pause-ad" ? "Mettre en pause" : "Réactiver"} uniquement « ${angle} » (${snapshot.ads[adIndex ?? -1]?.id}). Les autres publicités et la campagne parent ne seront pas modifiées.`;
  }
  const target = action === "pause" ? "PAUSED" : "ACTIVE";
  return `${action === "pause" ? "Mettre en pause" : "Réactiver"} la campagne Meta, ses ${snapshot.adsets.length} ensemble(s) et ses ${snapshot.ads.length} publicité(s) (${target}). ${action === "activate" ? "Meta peut encore examiner les publicités avant leur diffusion." : "Aucune publicité du Pack ne devrait alors diffuser."}`;
}

async function readOwnedPack(supabase: any, id: string, userId: string) {
  return supabase.from("ad_variant_packs")
    .select("id,user_id,status,meta_ad_account_id,external_campaign_id,checkpoints,updated_at,product_name,variants")
    .eq("id", id).eq("user_id", userId).maybeSingle();
}

export async function POST(request: Request, context: Context) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const { id } = await context.params;
  const body = await request.json().catch(() => null) as Row | null;
  if (!body || !["prepare", "execute"].includes(String(body.phase)) || !["pause", "activate", "delete", "pause-ad", "activate-ad"].includes(String(body.action))) {
    return fail("Paramètres d’action Pack invalides.", 400);
  }
  const action = body.action as Action;
  const adIndex = action === "pause-ad" || action === "activate-ad" ? body.adIndex : null;
  if ((action === "pause-ad" || action === "activate-ad") && (!Number.isInteger(adIndex) || adIndex < 0 || adIndex > 2)) return fail("Index de publicité invalide.", 400);
  if (!(action === "pause-ad" || action === "activate-ad") && body.adIndex !== undefined) return fail("Index inattendu pour cette action.", 400);

  const { data: pack, error: packError } = await readOwnedPack(supabase, id, user.id);
  if (packError) return fail("Impossible de charger le Pack.", 500);
  if (!pack) return fail("Pack introuvable.", 404);
  if (pack.status !== "completed" || pack.checkpoints?.activated !== true) return fail("Seul un Pack dont le lancement est confirmé peut être modifié.", 409);
  if (typeof pack.updated_at !== "string" || !pack.updated_at) return fail("Version du Pack non vérifiable.", 409);

  const admin = createAdminClient();
  if (!pack.meta_ad_account_id) return fail("Compte Meta indisponible; aucune action exécutée.", 409);
  const { data: account, error: accountError } = await admin.from("meta_ad_accounts")
    .select("id,meta_account_id,access_token_encrypted,is_active,account_status")
    .eq("id", pack.meta_ad_account_id).eq("user_id", user.id).maybeSingle();
  if (accountError) return fail("Impossible de vérifier le compte Meta.", 500);
  if (!account?.is_active || !account.access_token_encrypted || !account.meta_account_id) return fail("Connexion au compte Meta indisponible; aucune action exécutée.", 409);

  let operations: ReturnType<typeof createPackMetaLifecycleOperations>;
  let snapshot: PackMetaSnapshot;
  let metaState: PackMetaState;
  try {
    operations = createPackMetaLifecycleOperations({ pack, accessToken: decryptSecret(account.access_token_encrypted), metaAccountId: account.meta_account_id, accountStatus: account.account_status });
    snapshot = await operations.read();
    metaState = buildPackMetaState(snapshot);
  } catch {
    return fail("Impossible de relire et vérifier les entités Meta du Pack; aucune action envoyée.", 503);
  }
  const invalid = actionValidation(action, snapshot, metaState, adIndex);
  if (invalid) return fail(invalid, 409);

  const changes = {};
  const snapshotHash = confirmationSnapshot(snapshot, action, adIndex);
  const expected = { userId: user.id, campaignId: pack.id, action: actionType(action), changes, status: snapshotHash, updatedAt: pack.updated_at };
  if (body.phase === "prepare") {
    try {
      const token = issueConfirmation(expected);
      return NextResponse.json({
        token,
        preview: {
          packId: pack.id,
          name: pack.product_name || pack.id,
          action,
          currentStatus: metaState.status,
          warning: warningFor(action, pack, snapshot, adIndex),
          requiresConfirmation: true,
        },
      }, { headers: { "Cache-Control": "private, no-store" } });
    } catch {
      return fail("Confirmation sécurisée indisponible; aucune action effectuée.", 503);
    }
  }

  let valid = false;
  try { valid = verifyConfirmation(body.token, expected); } catch { /* token secret unavailable */ }
  if (!valid) return fail("Confirmation invalide, expirée ou état Meta modifié. Prépare à nouveau l’action.", 409);
  if (body.confirmed !== true) return fail("Confirmation explicite requise.", 400);

  const { data: claimed, error: claimError } = await admin.from("ad_variant_packs")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", pack.id).eq("user_id", user.id).eq("status", "completed").eq("updated_at", pack.updated_at)
    .select("id,updated_at")
    .maybeSingle();
  if (claimError || !claimed?.updated_at || claimed.updated_at === pack.updated_at) return fail("Action déjà exécutée ou Pack modifié; prépare une nouvelle confirmation.", claimError ? 500 : 409);

  const saveState = async (state: PackMetaState) => admin.from("ad_variant_packs")
    .update({ checkpoints: withPackMetaState(pack.checkpoints, state), updated_at: new Date().toISOString() })
    .eq("id", pack.id).eq("user_id", user.id).eq("updated_at", claimed.updated_at)
    .select("id")
    .maybeSingle();
  const markUnknown = async () => {
    try { await saveState(unavailablePackMetaState(new Date().toISOString(), "Action Meta envoyée ou partielle; résultat à vérifier, aucune relance automatique.")); } catch { /* keep the consumed CAS claim */ }
  };

  if (action === "delete") {
    try {
      if (!snapshot.missing) {
        try { await operations.deleteCampaign(); }
        catch (error) { if (!(error instanceof Error && isMetaObjectMissingError(error.message))) throw error; }
      }
    } catch {
      await markUnknown();
      return fail("Meta n’a pas confirmé la suppression. Le résultat peut être ambigu; vérifie dans Meta avant toute nouvelle action.", 502);
    }
    const deletedState: PackMetaState = {
      ...metaState,
      status: "deleted",
      source: "vendeo",
      synced_at: new Date().toISOString(),
      campaign: { id: operations.campaignId, status: "deleted", status_raw: "DELETED", effective_status: "DELETED" },
    };
    const { data: saved, error: saveError } = await saveState(deletedState);
    if (saveError || !saved) return fail("Meta a accepté la suppression, mais Vendeo n’a pas pu enregistrer l’état. Ne renvoie pas la suppression; vérifie la campagne.", 502);
    try {
      await syncLinkedStandardCampaignStatus({ client: admin, userId: user.id, metaAdAccountId: pack.meta_ad_account_id, externalCampaignId: operations.campaignId, status: "deleted" });
    } catch {
      return fail("La suppression Meta est confirmée et le Pack marqué supprimé, mais une ligne standard liée doit encore être synchronisée.", 502);
    }
    return NextResponse.json({ message: "Suppression confirmée chez Meta; le Pack est conservé comme supprimé dans l’historique Vendeo.", meta_state: deletedState }, { headers: { "Cache-Control": "private, no-store" } });
  }

  const target = action === "pause" || action === "pause-ad" ? "PAUSED" : "ACTIVE";
  try {
    if (action === "pause-ad" || action === "activate-ad") {
      const ad = snapshot.ads[adIndex as number];
      await operations.setStatus(ad.id, target);
    } else {
      const ids = [...new Set([operations.campaignId, ...operations.adsetIds, ...operations.adIds])];
      for (const objectId of ids) await operations.setStatus(objectId, target);
    }
    const verified = await operations.read();
    const checked = action === "pause-ad" || action === "activate-ad"
      ? [verified.ads[adIndex as number]]
      : [verified.campaign, ...verified.adsets, ...verified.ads];
    if (verified.missing || checked.some((node) => !node || node.status?.toUpperCase() !== target)) throw new Error("État demandé non vérifié après l’envoi.");
    metaState = buildPackMetaState(verified);
  } catch {
    await markUnknown();
    return fail("L’action Meta a échoué ou son résultat n’est pas confirmé. Elle peut avoir été appliquée en partie; vérifie les objets concernés avant toute nouvelle action.", 502);
  }

  const { data: saved, error: saveError } = await saveState(metaState);
  if (saveError || !saved) return fail("Meta a accepté l’action, mais Vendeo n’a pas pu enregistrer le statut. Vérifie le Pack avant toute nouvelle action.", 502);
  if (metaState.status !== "unknown") {
    try {
      await syncLinkedStandardCampaignStatus({ client: admin, userId: user.id, metaAdAccountId: pack.meta_ad_account_id, externalCampaignId: operations.campaignId, status: metaState.status });
    } catch {
      return fail("Meta et le Pack sont à jour, mais une campagne standard liée n’a pas pu être synchronisée.", 502);
    }
  }
  const message = action === "pause-ad" ? "La publicité du Pack est en pause chez Meta." : action === "activate-ad" ? "La publicité a été réactivée chez Meta; elle reste soumise à l’examen et aux restrictions Meta." : action === "pause" ? "La campagne, ses ensembles et ses publicités sont en pause chez Meta." : "Le statut ACTIVE est configuré et vérifié chez Meta; la diffusion reste soumise à l’examen Meta.";
  return NextResponse.json({ message, meta_state: metaState }, { headers: { "Cache-Control": "private, no-store" } });
}
