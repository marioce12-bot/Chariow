import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPackMetaOperations } from "@/lib/ad-variant-pack-meta";
import { launchPack, packProgress, validatePackInput, type PackCheckpoint, type PackInput } from "@/lib/ad-variant-packs";

type Context = { params: Promise<{ id: string }> };
export const maxDuration = 300;

export async function POST(_request: Request, context: Context) {
  if (process.env.VERCEL_ENV === "preview") return NextResponse.json({ error: "Le lancement des Packs est désactivé sur cette Preview. Aucune publicité n’a été envoyée.", code: "PACK_PREVIEW_BLOCKED" }, { status: 403 });
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const { id } = await context.params;
  const { data: initial, error: readError } = await supabase.from("ad_variant_packs").select("*").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (readError) return NextResponse.json({ error: "État du Pack invérifiable; aucune action exécutée" }, { status: 500 });
  if (!initial) return NextResponse.json({ error: "Pack introuvable" }, { status: 404 });
  const pack = initial as PackInput & { id: string; user_id: string; status: string };
  const invalid = validatePackInput(pack);
  if (invalid) return NextResponse.json({ error: `Pack invalide: ${invalid}` }, { status: 422 });
  if (pack.user_id !== user.id || pack.id !== id) return NextResponse.json({ error: "Propriété du Pack invalide" }, { status: 404 });
  if (pack.status !== "draft") return NextResponse.json({ error: "Pack déjà réclamé ou non lançable; aucune nouvelle tentative autorisée", code: "PACK_ALREADY_CLAIMED", pack_status: pack.status, progress: packProgress(initial.checkpoints, pack.status) }, { status: 409 });

  const admin = createAdminClient();
  const claimToken = randomUUID();
  const { data: claimed, error: claimError } = await admin.rpc("claim_ad_variant_pack", { p_id: id, p_user_id: user.id, p_claim_token: claimToken });
  if (claimError || claimed !== true) return NextResponse.json({ error: claimError ? "Claim impossible; aucun lancement exécuté" : "Pack déjà réclamé par une autre requête; aucune relance autorisée", code: "PACK_ALREADY_CLAIMED" }, { status: claimError ? 503 : 409 });

  const owned = (query: any) => query.eq("id", id).eq("user_id", user.id).eq("status", "claimed").eq("claim_token", claimToken);
  const save = async (checkpoints: PackCheckpoint, patch: Record<string, unknown> = {}) => {
    const { data, error } = await owned(admin.from("ad_variant_packs").update({ ...patch, checkpoints, updated_at: new Date().toISOString() })).select("id");
    if (error || !Array.isArray(data) || data.length !== 1) throw new Error("Checkpoint CAS refusé ou résultat ambigu; aucune relance autorisée");
  };
  try {
    await save({ adsets: [null, null, null], creatives: [null, null, null], ads: [null, null, null] });
    const adapter = createPackMetaOperations({ supabase: admin, userId: user.id, pack });
    const checkpoint = await launchPack({ pack, pageId: pack.meta_page_id, adapter: { ...adapter, claim: async () => true, save } });
    const { data: done, error } = await admin.from("ad_variant_packs").select("id,status,checkpoints").eq("id", id).eq("user_id", user.id).eq("claim_token", claimToken).single();
    if (error || !done || done.status !== "completed" || done.checkpoints?.activated !== true || checkpoint.activated !== true) return NextResponse.json({ error: "Lancement terminé de façon ambiguë; état durable non confirmé. Ne relancez pas le Pack.", code: "PACK_LAUNCH_AMBIGUOUS", pack_status: done?.status ?? "ambiguous", progress: packProgress(done?.checkpoints, done?.status) }, { status: 503 });
    return NextResponse.json({ pack: done, progress: 100 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur de lancement inconnue";
    const { data: state } = await supabase.from("ad_variant_packs").select("status,checkpoints,last_error").eq("id", id).eq("user_id", user.id).maybeSingle();
    if (state?.status === "blocked") return NextResponse.json({ error: state.last_error ?? `Échec du préflight; rien n’a été créé. ${message}`, code: "PACK_PREFLIGHT_BLOCKED", pack_status: "blocked", progress: packProgress(state.checkpoints, "blocked") }, { status: 422 });
    try { const { data } = await owned(admin.from("ad_variant_packs").select("checkpoints")).maybeSingle(); if (data) await save(data.checkpoints ?? {}, { status: "ambiguous", last_error: message.slice(0, 500) }); } catch { /* claim remains blocking */ }
    return NextResponse.json({ error: "Lancement interrompu ou résultat externe/persistance ambigu. Le Pack reste bloqué et ne doit pas être relancé.", code: "PACK_LAUNCH_AMBIGUOUS", detail: message.slice(0, 300), pack_status: state?.status ?? "ambiguous", progress: packProgress(state?.checkpoints, state?.status) }, { status: 503 });
  }
}
