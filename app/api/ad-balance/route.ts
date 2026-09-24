import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPayoutStatus } from "@/lib/payments/saspay";
import { AD_WITHDRAWAL_MIN_XOF, type AdBalanceSummary } from "@/lib/ad-balance";

// Solde publicitaire = argent mis sur la carte au lancement des campagnes, HORS commission
// Vendeo de 2 % (le webhook SasPay ne crédite que le budget net, cf. credit_ad_campaign_deposit).
export async function GET() {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const admin = createAdminClient();

  await reconcilePendingWithdrawals(supabase, admin);

  const summary = await admin.rpc("ad_wallet_summary", { target_user_id: user.id });
  if (summary.error || !summary.data) return NextResponse.json({ error: "Impossible de charger le solde" }, { status: 500 });
  const data = summary.data as { balance: number; reserved: number; withdrawable: number; locked: boolean; pending_withdrawals: number };

  const { data: recent } = await supabase
    .from("ad_wallet_transactions")
    .select("id,amount,status,network,created_at")
    .eq("kind", "withdrawal")
    .order("created_at", { ascending: false })
    .limit(3);

  const body: AdBalanceSummary = {
    currency: "XOF",
    balance: Number(data.balance),
    reserved: Number(data.reserved),
    withdrawable: Number(data.withdrawable),
    locked: Boolean(data.locked),
    pendingWithdrawals: Number(data.pending_withdrawals),
    minWithdrawal: AD_WITHDRAWAL_MIN_XOF,
    recent: (recent ?? []).map((row) => ({ id: row.id, amount: Number(row.amount), status: row.status, network: row.network, created_at: row.created_at })),
  };
  return NextResponse.json(body);
}

// Filet de sécurité si le webhook SasPay (transaction.success / transaction.failed) n'est pas
// arrivé : un retrait resté "pending" plus de 90 s est revérifié directement auprès de SasPay.
// Sans ça, un webhook manquant bloquerait indéfiniment le montant réservé.
async function reconcilePendingWithdrawals(supabase: any, admin: ReturnType<typeof createAdminClient>) {
  try {
    const cutoff = new Date(Date.now() - 90_000).toISOString();
    const { data: pending } = await supabase
      .from("ad_wallet_transactions")
      .select("id,external_id")
      .eq("kind", "withdrawal")
      .eq("status", "pending")
      .not("external_id", "is", null)
      .lt("created_at", cutoff)
      .limit(3);
    for (const row of pending ?? []) {
      const payout = await getPayoutStatus(row.external_id).catch(() => null);
      const status = payout?.status?.toUpperCase();
      if (status === "SUCCESS") await admin.rpc("finalize_ad_withdrawal", { withdrawal_id: row.id, new_status: "completed" });
      else if (status === "FAILED" || status === "CANCELLED") await admin.rpc("finalize_ad_withdrawal", { withdrawal_id: row.id, new_status: "failed", error_text: `SasPay: ${status}` });
    }
  } catch {
    // La réconciliation ne doit jamais empêcher l'affichage du solde.
  }
}
