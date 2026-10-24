import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { syncMetaInsights } from "@/lib/meta/sync";
import { dateOnly, initialBackfillDate, nextBackfillChunk } from "@/lib/meta/backfill";
import { isMetaReconnectRequired, markMetaReconnectRequired } from "@/lib/meta/connection-state";
import { isMetaAuthenticationError } from "@/lib/meta/graph";

type BackfillAccount = {
  id: string;
  meta_integration_id: string | null;
  meta_account_id: string;
  access_token_encrypted: string;
  last_sync_error: string | null;
  last_backfill_at: string | null;
  backfill_status: "processing" | "in_progress" | "failed" | "complete" | null;
  backfill_next_from: string | null;
  backfill_started_at: string | null;
};

const ACCOUNT_COLUMNS = "id,meta_integration_id,meta_account_id,access_token_encrypted,last_sync_error,last_backfill_at,backfill_status,backfill_next_from,backfill_started_at";
const STALE_LOCK_MS = 10 * 60 * 1000;

async function updateAccount(supabase: any, account: BackfillAccount, expectedStatus: BackfillAccount["backfill_status"], patch: Record<string, unknown>) {
  let query = supabase.from("meta_ad_accounts").update(patch).eq("id", account.id);
  if (expectedStatus === null) query = query.is("backfill_status", null);
  else query = query.eq("backfill_status", expectedStatus);
  if (expectedStatus === "processing") {
    if (!account.backfill_started_at) return null;
    query = query.eq("backfill_started_at", account.backfill_started_at);
  }
  const { data, error } = await query.select(ACCOUNT_COLUMNS).maybeSingle();
  if (error) throw error;
  return data as BackfillAccount | null;
}

export async function POST(request: Request) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const body = await request.json().catch(() => null);
  const accountId = typeof body?.account_id === "string" ? body.account_id : "";
  if (!accountId) return NextResponse.json({ error: "account_id est requis" }, { status: 400 });

  const { data: found, error: readError } = await supabase
    .from("meta_ad_accounts")
    .select(ACCOUNT_COLUMNS)
    .eq("id", accountId)
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();
  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });
  if (!found) return NextResponse.json({ error: "Compte Meta introuvable" }, { status: 404 });

  let account = found as BackfillAccount;
  if (isMetaReconnectRequired(account.last_sync_error)) {
    return NextResponse.json({ status: "skipped", reason: "reauth_required", needs_reconnect: true }, { status: 409 });
  }
  if (account.last_backfill_at || account.backfill_status === "complete") {
    return NextResponse.json({ status: "complete", lastBackfillAt: account.last_backfill_at });
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const today = dateOnly(now);
  let startFrom = account.backfill_next_from || initialBackfillDate(today);

  // Une tranche ne peut être exécutée que par un seul appel à la fois. Une
  // requête bloquée plus de dix minutes peut être reprise à la même date :
  // les écritures sont des upserts sur la clé Meta/jour et restent idempotentes.
  if (account.backfill_status === "processing") {
    const lockTime = account.backfill_started_at ? new Date(account.backfill_started_at).getTime() : 0;
    if (lockTime && now.getTime() - lockTime < STALE_LOCK_MS) {
      return NextResponse.json({ status: "in_progress", nextFrom: startFrom });
    }
    const claimed = await updateAccount(supabase, account, "processing", {
      backfill_status: "processing", backfill_started_at: nowIso,
      backfill_next_from: startFrom,
    });
    if (!claimed) return NextResponse.json({ status: "in_progress", nextFrom: startFrom });
    account = claimed;
  } else {
    const claimed = await updateAccount(supabase, account, account.backfill_status, {
      backfill_status: "processing", backfill_started_at: nowIso,
      backfill_next_from: startFrom,
    });
    if (!claimed) return NextResponse.json({ status: "in_progress", nextFrom: startFrom });
    account = claimed;
  }

  const chunk = nextBackfillChunk(startFrom, today);
  if (!chunk) {
    const finished = await supabase.from("meta_ad_accounts").update({
      backfill_status: "complete", last_backfill_at: nowIso,
      backfill_started_at: null, backfill_next_from: null,
    }).eq("id", account.id).eq("backfill_status", "processing").eq("backfill_started_at", nowIso).select("id").maybeSingle();
    if (finished.error) return NextResponse.json({ error: "Impossible d’enregistrer la fin de l’import" }, { status: 500 });
    if (!finished.data) return NextResponse.json({ status: "in_progress", nextFrom: startFrom });
    return NextResponse.json({ status: "complete", lastBackfillAt: nowIso });
  }

  try {
    const synced = await syncMetaInsights(supabase, account, chunk.from, chunk.to);
    if (synced.some((result) => result.error)) throw new Error("Certaines campagnes Meta n’ont pas pu être importées.");
    const patch = chunk.done
      ? { backfill_status: "complete", last_backfill_at: new Date().toISOString(), backfill_started_at: null, backfill_next_from: null }
      : { backfill_status: "in_progress", backfill_started_at: null, backfill_next_from: chunk.nextFrom };
    const { data: saved, error: saveError } = await supabase.from("meta_ad_accounts").update(patch)
      .eq("id", account.id).eq("backfill_status", "processing").eq("backfill_started_at", nowIso).select("id").maybeSingle();
    if (saveError) throw saveError;
    if (!saved) return NextResponse.json({ status: "in_progress", nextFrom: chunk.from });
    return NextResponse.json({ status: chunk.done ? "complete" : "in_progress", from: chunk.from, to: chunk.to, nextFrom: chunk.done ? null : chunk.nextFrom, synced });
  } catch (error) {
    if (isMetaAuthenticationError(error)) {
      await markMetaReconnectRequired(supabase, account, user.id);
      await supabase.from("meta_ad_accounts").update({ backfill_status: "failed", backfill_started_at: null })
        .eq("id", account.id).eq("backfill_status", "processing").eq("backfill_started_at", nowIso);
      return NextResponse.json({ status: "failed", reason: "reauth_required", needs_reconnect: true }, { status: 409 });
    }
    const message = error instanceof Error ? error.message.slice(0, 500) : "Meta backfill failed";
    await supabase.from("meta_ad_accounts").update({ backfill_status: "failed", backfill_started_at: null })
      .eq("id", account.id).eq("backfill_status", "processing").eq("backfill_started_at", nowIso);
    console.error("Meta history backfill failed", { accountId: account.id, from: chunk.from, to: chunk.to, message });
    return NextResponse.json({ status: "failed", error: "L’import Meta a échoué. Réessaie pour reprendre à la dernière tranche." }, { status: 502 });
  }
}
