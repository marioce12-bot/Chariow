import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret } from "@/lib/crypto";
import { buildPackMetaState, isTerminalPackMetaState, syncLinkedStandardCampaignStatus, unavailablePackMetaState, withPackMetaState } from "@/lib/ad-variant-pack-lifecycle";
import { createPackMetaLifecycleOperations } from "@/lib/ad-variant-pack-meta-lifecycle";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const { id } = await context.params;
  const { data: pack, error } = await supabase.from("ad_variant_packs")
    .select("id,user_id,status,meta_ad_account_id,external_campaign_id,checkpoints,updated_at")
    .eq("id", id).eq("user_id", user.id).maybeSingle();
  if (error) return NextResponse.json({ error: "Impossible de charger le Pack." }, { status: 500, headers: { "Cache-Control": "private, no-store" } });
  if (!pack) return NextResponse.json({ error: "Pack introuvable." }, { status: 404, headers: { "Cache-Control": "private, no-store" } });
  if (typeof pack.updated_at !== "string" || !pack.updated_at) return NextResponse.json({ error: "Version du Pack non vérifiable." }, { status: 409, headers: { "Cache-Control": "private, no-store" } });
  const existingState = pack.checkpoints?.meta_state;
  if (isTerminalPackMetaState(existingState)) return NextResponse.json({ meta_state: existingState, unchanged: true }, { headers: { "Cache-Control": "private, no-store" } });
  if (pack.status !== "completed" || pack.checkpoints?.activated !== true) return NextResponse.json({ error: "Le statut Meta est disponible uniquement pour un Pack dont le lancement est confirmé." }, { status: 409, headers: { "Cache-Control": "private, no-store" } });

  const admin = createAdminClient();
  const syncedAt = new Date().toISOString();
  let metaState;
  let unavailable = false;
  try {
    if (!pack.meta_ad_account_id) throw new Error("Compte Meta indisponible");
    const { data: account, error: accountError } = await admin.from("meta_ad_accounts")
      .select("id,meta_account_id,access_token_encrypted,is_active,account_status")
      .eq("id", pack.meta_ad_account_id).eq("user_id", user.id).maybeSingle();
    if (accountError || !account?.is_active || !account.access_token_encrypted || !account.meta_account_id) throw new Error("Compte Meta indisponible");
    const operations = createPackMetaLifecycleOperations({
      pack,
      accessToken: decryptSecret(account.access_token_encrypted),
      metaAccountId: account.meta_account_id,
      accountStatus: account.account_status,
    });
    metaState = buildPackMetaState(await operations.read(), syncedAt);
  } catch {
    unavailable = true;
    metaState = unavailablePackMetaState(syncedAt, "Impossible de vérifier le statut actuel de cette campagne chez Meta.");
  }

  const { data: saved, error: saveError } = await admin.from("ad_variant_packs")
    .update({ checkpoints: withPackMetaState(pack.checkpoints, metaState), updated_at: syncedAt })
    .eq("id", pack.id).eq("user_id", user.id).eq("updated_at", pack.updated_at)
    .select("id")
    .maybeSingle();
  if (saveError || !saved) return NextResponse.json({ error: "Le Pack a changé pendant la synchronisation; relance une vérification." }, { status: 409, headers: { "Cache-Control": "private, no-store" } });
  if (!unavailable && metaState.status !== "unknown") {
    try {
      await syncLinkedStandardCampaignStatus({
        client: admin,
        userId: user.id,
        metaAdAccountId: pack.meta_ad_account_id,
        externalCampaignId: pack.external_campaign_id || pack.checkpoints?.campaignId || "",
        status: metaState.status,
      });
    } catch {
      return NextResponse.json({ error: "Le statut Pack est synchronisé, mais une campagne standard liée n’a pas pu être mise à jour." }, { status: 502, headers: { "Cache-Control": "private, no-store" } });
    }
  }
  return NextResponse.json({ meta_state: metaState, ...(unavailable ? { error: "Le statut Meta n’a pas pu être confirmé." } : {}) }, {
    status: unavailable ? 503 : 200,
    headers: { "Cache-Control": "private, no-store" },
  });
}
