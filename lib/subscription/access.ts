import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const PLANS_REQUIRED_MESSAGE = "Ton essai gratuit est terminé. Active ton abonnement pour continuer.";

/**
 * Même règle d'accès que la fonction Postgres consume_message_quota() :
 * essai actif et non expiré, OU abonnement payant actif (trial_active=false,
 * status="active"). Utilisé pour bloquer les actions payantes qui ne passent
 * pas par /api/chat (donc pas par consume_message_quota) — typiquement le
 * Studio (génération/édition d'image, vidéo) — une fois l'essai gratuit
 * terminé, sans consommer de quota de messages au passage.
 *
 * Retourne une NextResponse 402 (code "PLANS_REQUIRED") à renvoyer tel quel
 * si l'accès doit être bloqué, ou null si la route peut continuer.
 */
export async function requireActiveSubscription(userId: string): Promise<NextResponse | null> {
  const admin = createAdminClient();
  const { data: subscription } = await admin
    .from("subscriptions")
    .select("status, trial_active, trial_ends_at")
    .eq("user_id", userId)
    .maybeSingle();

  const trialOk =
    Boolean(subscription?.trial_active) &&
    Boolean(subscription?.trial_ends_at) &&
    new Date(subscription!.trial_ends_at as string).getTime() > Date.now();
  const subscriptionOk = subscription?.status === "active" && subscription?.trial_active === false;

  if (trialOk || subscriptionOk) return null;
  return NextResponse.json({ error: PLANS_REQUIRED_MESSAGE, code: "PLANS_REQUIRED" }, { status: 402 });
}
